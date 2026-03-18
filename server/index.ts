import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initStorage, MemoryStorage } from "./storage";
import { getBrandConfigFromProcess } from "@shared/brand-config";
import { startTavilyScheduler } from "./tavily";
import { initDb, getPool } from "./db";
import { PgStorage } from "./pg-storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
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

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize storage — Postgres if DATABASE_URL is set, otherwise in-memory
  const brandCfg = getBrandConfigFromProcess();
  if (process.env.DATABASE_URL) {
    try {
      await initDb(process.env.DATABASE_URL);
      const pool = getPool()!;
      const pgStore = new PgStorage(pool);
      await pgStore.seedIfNeeded(brandCfg.monitoredBrands);
      initStorage(brandCfg.monitoredBrands, pgStore);
      log("Using PostgreSQL storage");
    } catch (err) {
      log(`PostgreSQL init failed — falling back to memory storage: ${err}`);
      initStorage(brandCfg.monitoredBrands);
    }
  } else {
    initStorage(brandCfg.monitoredBrands);
    log("Using in-memory storage (no DATABASE_URL set)");
  }

  await registerRoutes(httpServer, app);

  // Start Tavily 3-hour refresh scheduler (runs whenever API key is set)
  if (process.env.TAVILY_API_KEY) {
    startTavilyScheduler(
      brandCfg.monitoredBrands,
      brandCfg.monitoredKeywords ?? [],
      process.env.TAVILY_API_KEY,
    );
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
