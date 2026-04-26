import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import { validateCanonicalDictionary } from "./services/finances/canonical-dictionary.js";
import {
  getFinanceSource,
  getGcsFinanceBase,
  getGcsPrefix,
  isFinanceSubfolderLayout
} from "./services/finances/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
const isProduction = nodeEnv === "production";
if (!isProduction) {
  dotenv.config({ path: path.join(projectRoot, ".env.example") });
  dotenv.config({ path: path.join(projectRoot, "..", ".env.local") });
}
dotenv.config({ path: path.join(projectRoot, ".env"), override: true });
import express from "express";
import { requestLog } from "./middleware/request-log.js";
import { isMlLearningFirestoreSinkEnabled } from "./services/ml-learning.service.js";

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection", reason);
});

function isPlaceholderApiKey(v) {
  const s = String(v || "").trim().toLowerCase();
  return !s || s.includes("replace_with_secure_key") || s.includes("la_teva") || s.includes("your_");
}

function validateStartupConfig() {
  const apiKey = process.env.MCP_API_KEY;
  if (isPlaceholderApiKey(apiKey)) {
    throw new Error("MCP_API_KEY absent o placeholder. Configura una clau real abans d'arrencar.");
  }

  const financeSource = getFinanceSource();
  if (!["local", "gcs"].includes(financeSource)) {
    throw new Error(`FINANCE_SOURCE invàlid: "${financeSource}". Valors permesos: local|gcs.`);
  }
  if (financeSource === "gcs" && !String(process.env.GCS_BUCKET || "").trim()) {
    throw new Error("FINANCE_SOURCE=gcs requereix GCS_BUCKET definit.");
  }

  const fbase = getGcsFinanceBase();
  const fprefix = getGcsPrefix();
  if (financeSource === "gcs" && isFinanceSubfolderLayout() && !fbase) {
    throw new Error("FINANCE_SUBFOLDERS=true requereix GCS_FINANCE_BASE no buit.");
  }
  if (financeSource === "gcs" && !isFinanceSubfolderLayout() && !fprefix) {
    throw new Error("FINANCE_SUBFOLDERS=false requereix GCS_FINANCE_PREFIX no buit.");
  }

  console.log(
    `[startup] config: env=${nodeEnv || "undefined"} financeSource=${financeSource} ` +
      `subfolders=${isFinanceSubfolderLayout() ? "1" : "0"} gcsBase=${fbase || "-"} gcsPrefix=${fprefix || "-"}`
  );
}

validateStartupConfig();

const app = express();
const canonicalDictionary = validateCanonicalDictionary();
app.locals.canonicalDictionary = canonicalDictionary;
app.locals.routesReady = false;
if (!canonicalDictionary.ok) {
  const joined = canonicalDictionary.missingFiles.join(", ");
  const msg =
    `[startup] Canonical dictionary incomplete at "${canonicalDictionary.dir}". ` +
    `Missing: ${joined}`;
  if (canonicalDictionary.required) {
    throw new Error(msg);
  }
  console.warn(`${msg} (continuing because CANONICAL_DICTIONARY_REQUIRED=0)`);
} else {
  console.log(
    `[startup] Canonical dictionary loaded from "${canonicalDictionary.dir}" (${canonicalDictionary.missingFiles.length} missing)`
  );
}

const mlLearningOn = String(process.env.ML_LEARNING_ENABLED || "1").toLowerCase() !== "0";
const mlFirestoreSink = isMlLearningFirestoreSinkEnabled();
const mlFsExplicit = String(process.env.ML_LEARNING_USE_FIRESTORE ?? "").trim();
console.log(
  `[startup] ML learning traces: enabled=${mlLearningOn}, firestore_sink=${mlFirestoreSink}` +
    (mlFirestoreSink ? " (col·leccions mcp_ml_traces / mcp_ml_feedback)" : "") +
    (mlLearningOn && !mlFsExplicit
      ? " [firestore_sink=auto: credencials Firebase]"
      : mlFsExplicit
        ? ` [ML_LEARNING_USE_FIRESTORE=${mlFsExplicit}]`
        : "")
);

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

console.log("Loading API routes (Firestore, finances, …)…");
const { registerRoutes } = await import("./routes.js");
registerRoutes(app);
app.locals.routesReady = true;
console.log("API routes registered.");

const { startFirestoreMappingNightlyScheduler } = await import(
  "./services/firestore-mapping-delta.service.js"
);
const nightlyScheduler = startFirestoreMappingNightlyScheduler();
console.log("[startup] firestore mapping nightly scheduler:", nightlyScheduler);

const server = app.listen(port, host, () => {
  console.log(`MCP server listening on ${host}:${port}`);
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
