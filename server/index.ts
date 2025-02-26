import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { verifyDatabaseConnection } from "./db";
import { exec } from "child_process";
import net from "net";

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

// Mount the API router before route registration
app.use('/api', apiRouter);

// Global error handler
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
};

async function listProcessesOnPort(port: number): Promise<string> {
  return new Promise((resolve) => {
    exec(`lsof -i :${port} -n`, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error listing processes on port ${port}:`, error.message);
        resolve(`Error: ${error.message}`);
      } else {
        resolve(stdout || 'No processes found');
      }
    });
  });
}

async function killProcessOnPort(port: number): Promise<boolean> {
  console.log(`Attempting to kill process on port ${port}...`);

  // First list processes using the port
  const processList = await listProcessesOnPort(port);
  console.log(`Current processes on port ${port}:\n${processList}`);

  return new Promise((resolve) => {
    exec(`lsof -i :${port} -t | xargs -r kill -9`, (error) => {
      if (error) {
        console.log(`Could not terminate process on port ${port}:`, error.message);
        resolve(false);
      } else {
        console.log(`Successfully terminated process on port ${port}`);
        resolve(true);
      }
    });
  });
}

async function checkPort(port: number): Promise<boolean> {
  console.log(`Checking if port ${port} is available...`);
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        console.log(`Port ${port} is not available:`, err.message);
        resolve(false);
      })
      .once('listening', () => {
        console.log(`Port ${port} is available`);
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
    const PORT = 5001;
    const RETRY_DELAY = 3000; // 3 seconds delay
    const MAX_RETRIES = 5;
    const KILL_ATTEMPTS = 3;

    // Initial port check
    let isPortAvailable = await checkPort(PORT);

    // Multiple attempts to free up the port if needed
    if (!isPortAvailable) {
      console.log(`Port ${PORT} is in use. Making ${KILL_ATTEMPTS} attempts to free it...`);

      for (let i = 0; i < KILL_ATTEMPTS; i++) {
        console.log(`Kill attempt ${i + 1}/${KILL_ATTEMPTS}`);

        // Try to kill the process
        await killProcessOnPort(PORT);

        // Wait for port to be released
        console.log(`Waiting ${RETRY_DELAY}ms for port to be released...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

        // Check if port is now available
        isPortAvailable = await checkPort(PORT);
        if (isPortAvailable) {
          console.log(`Successfully freed port ${PORT} on attempt ${i + 1}`);
          break;
        }
      }

      if (!isPortAvailable) {
        throw new Error(`Failed to free port ${PORT} after ${KILL_ATTEMPTS} attempts`);
      }
    }

    // Verify database connection first
    await verifyDatabaseConnection();
    const server = await registerRoutes(app);
    app.use(errorHandler);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    let retries = MAX_RETRIES;
    const startListening = async () => {
      try {
        server.listen(PORT, "0.0.0.0", () => {
          log(`Server running on port ${PORT}`);
        }).on('error', (error: Error & { code?: string }) => {
          console.error('Server listen error:', error);
          throw error;
        });
      } catch (error) {
        console.error('Error in startListening:', error);
        if (retries > 0) {
          retries--;
          console.log(`Error starting server. Retrying in ${RETRY_DELAY}ms... (${retries} attempts remaining)`);
          setTimeout(startListening, RETRY_DELAY);
        } else {
          throw error;
        }
      }
    };

    await startListening();

    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('Unhandled server startup error:', error);
  if (error instanceof Error) {
    console.error('Error stack:', error.stack);
  }
  process.exit(1);
});