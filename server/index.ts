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

// Global error handler with detailed logging
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error:', {
    message: err.message,
    stack: err.stack,
    status: err.status || err.statusCode,
    name: err.name,
    code: err.code
  });

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
};

// Check if port is in use
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port, '0.0.0.0');
  });
}

// Initialize server with proper error handling
async function startServer() {
  try {
    console.log('Starting server initialization...');
    const PORT = 5000;

    // Check if port is already in use
    const portInUse = await isPortInUse(PORT);
    if (portInUse) {
      console.error(`Port ${PORT} is already in use. Please free up the port and try again.`);
      process.exit(1);
    }

    // Verify database connection first
    console.log('Verifying database connection...');
    await verifyDatabaseConnection();
    console.log('Database connection verified successfully');

    // Register routes
    console.log('Registering routes...');
    const server = await registerRoutes(app);
    app.use(errorHandler);
    console.log('Routes registered successfully');

    // Setup Vite or static serving based on environment
    if (app.get("env") === "development") {
      console.log('Setting up Vite for development...');
      await setupVite(app, server);
      console.log('Vite setup completed');
    } else {
      console.log('Setting up static file serving...');
      serveStatic(app);
      console.log('Static file serving setup completed');
    }

    // Start the server with detailed error handling
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      log(`Server running on port ${PORT}`);
    }).on('error', (error: any) => {
      console.error('Server failed to start:', {
        error: error.message,
        code: error.code,
        syscall: error.syscall,
        port: error.port
      });
      process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('Unhandled server startup error:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});