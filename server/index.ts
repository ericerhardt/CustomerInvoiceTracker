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

// Initialize server with proper error handling
async function startServer() {
  try {
    console.log('Starting server initialization...');
    const PORT = 5000;

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

    // Start the server
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      log(`Server running on port ${PORT}`);
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