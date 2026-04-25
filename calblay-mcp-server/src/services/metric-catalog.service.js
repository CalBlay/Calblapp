import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function catalogPath() {
  const fromEnv = String(process.env.METRIC_CATALOG_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "config", "metric_catalog.json");
}

export function readMetricCatalog() {
  const p = catalogPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return { ok: true, path: p, catalog: parsed };
  } catch (e) {
    return {
      ok: false,
      path: p,
      error: e instanceof Error ? e.message : String(e),
      catalog: { version: "v1", updatedAt: null, metrics: [] }
    };
  }
}

export function validateMetricCatalog(catalogLike) {
  const catalog = catalogLike && typeof catalogLike === "object" ? catalogLike : {};
  const metrics = Array.isArray(catalog.metrics) ? catalog.metrics : [];
  const errors = [];
  const ids = new Set();
  for (const m of metrics) {
    const id = String(m?.metricId || "").trim();
    if (!id) errors.push("metric without metricId");
    if (id && ids.has(id)) errors.push(`duplicate metricId: ${id}`);
    if (id) ids.add(id);
    if (!m?.domain) errors.push(`metric ${id || "<unknown>"} missing domain`);
    if (!m?.sourceOfTruth) errors.push(`metric ${id || "<unknown>"} missing sourceOfTruth`);
    if (!m?.calculationRule?.executor)
      errors.push(`metric ${id || "<unknown>"} missing calculationRule.executor`);
    if (!Array.isArray(m?.slotSchema))
      errors.push(`metric ${id || "<unknown>"} missing slotSchema[]`);
  }
  return {
    ok: errors.length === 0,
    version: String(catalog.version || "v1"),
    updatedAt: catalog.updatedAt || null,
    metricsCount: metrics.length,
    activeMetricsCount: metrics.filter((m) => m?.active !== false).length,
    errors
  };
}

export function getMetricCatalogStatus() {
  const read = readMetricCatalog();
  const validation = validateMetricCatalog(read.catalog);
  return {
    ok: read.ok && validation.ok,
    path: read.path,
    readOk: read.ok,
    readError: read.ok ? null : read.error,
    validation
  };
}

