import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env.example") });
dotenv.config({ path: path.join(projectRoot, ".env"), override: true });
import express from "express";
import { requestLog } from "./middleware/request-log.js";

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection", reason);
});

const app = express();
/** Darrere de Cloud Run / balancejador: X-Forwarded-* fiables. Desactiva amb TRUST_PROXY=0. */
if (String(process.env.TRUST_PROXY || "1").toLowerCase() !== "0") {
  app.set("trust proxy", 1);
}

app.use(cors());
const jsonLimit = process.env.JSON_BODY_LIMIT || "512kb";
app.use(express.json({ limit: jsonLimit }));
app.use(requestLog);

/** Liveness: el procés respon (startup probe Cloud Run). */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "calblay-mcp-server",
    at: new Date().toISOString()
  });
});

/**
 * Readiness: rutes registrades (Firestore, finances, …).
 * Probe separada: falla amb 503 fins que `registerRoutes` acabi.
 */
app.get("/health/ready", (req, res) => {
  const ready = Boolean(req.app.locals.routesReady);
  if (!ready) {
    return res.status(503).json({
      ok: false,
      ready: false,
      service: "calblay-mcp-server",
      at: new Date().toISOString()
    });
  }
  res.json({
    ok: true,
    ready: true,
    service: "calblay-mcp-server",
    at: new Date().toISOString()
  });
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

const server = app.listen(port, host, () => {
  console.log(`MCP server listening on ${host}:${port}`);
  console.log("Loading API routes (Firestore, finances, …)…");
  import("./routes.js")
    .then(({ registerRoutes }) => {
      registerRoutes(app);
      console.log("API routes registered.");
    })
    .catch((err) => {
      console.error("[fatal] Failed to register routes", err);
      process.exit(1);
    });
});

function shutdown(signal) {
  console.log(`[shutdown] ${signal}, closing HTTP…`);
  server.close(() => {
    console.log("[shutdown] HTTP closed");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[shutdown] timeout, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
