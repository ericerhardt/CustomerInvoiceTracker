import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { verifyDatabaseConnection } from "./db";

const app = express();

// Create a separate router for non-webhook routes that will use JSON parsing
const apiRouter = express.Router();
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({ extended: false }));

// Add request logging middleware to API router
apiRouter.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Global error handler
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
};

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => {
          resolve(true);
        }).close();
      })
      .listen(port, '0.0.0.0');
  });
}

// Initialize server with proper error handling
async function startServer() {
  try {
    const PORT = 5000;

    // Check if port is available
    const isPortAvailable = await checkPort(PORT);
    if (!isPortAvailable) {
      console.log(`Port ${PORT} is in use. Attempting to terminate existing process...`);
      try {
        // On Unix systems, this will attempt to kill the process using port 5000
        await new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          exec(`lsof -i :${PORT} -t | xargs kill -9`, (error: any) => {
            if (error) {
              console.log('Could not terminate existing process, but continuing anyway...');
            }
            resolve(true);
          });
        });
        // Wait a moment for the port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error while trying to free port:', error);
      }
    }

    // Verify database connection first
    await verifyDatabaseConnection();

    const server = await registerRoutes(app);

    // Mount the API router after webhook registration
    app.use('/api', apiRouter);

    // Add error handler after all routes
    app.use(errorHandler);

    // Setup Vite or static serving based on environment
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Handle server errors
    server.on('error', (error: Error & { code?: string }) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is still in use. Please ensure no other process is using this port.`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });

    // Start listening with retry logic
    let retries = 3;
    const startListening = () => {
      server.listen(PORT, "0.0.0.0", () => {
        log(`serving on port ${PORT}`);
      }).on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE' && retries > 0) {
          retries--;
          console.log(`Retrying in 1 second... (${retries} attempts remaining)`);
          setTimeout(startListening, 1000);
        } else {
          throw error;
        }
      });
    };

    startListening();

    // Handle process termination
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('Unhandled server startup error:', error);
  process.exit(1);
});