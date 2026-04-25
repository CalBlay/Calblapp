import { readMetricCatalog } from "../../services/metric-catalog.service.js";

function getMetricById(metricId) {
  const id = String(metricId || "").trim();
  if (!id) return null;
  const read = readMetricCatalog();
  const metrics = Array.isArray(read?.catalog?.metrics) ? read.catalog.metrics : [];
  return metrics.find((m) => m?.metricId === id && m?.active !== false) || null;
}

export function buildQueryExecutionPolicy({ queryPlan, deterministicExecutorEnabled = false } = {}) {
  const metric = getMetricById(queryPlan?.metricId);
  const status = String(queryPlan?.status || "catalog_miss");
  const hasMetric = Boolean(metric);
  const deterministicPreferred =
    Boolean(deterministicExecutorEnabled) &&
    hasMetric &&
    (status === "catalog_hit" || status === "ambiguous");

  const sourceLocks = {
    system: String(metric?.sourceOfTruth?.system || ""),
    financeKind: String(metric?.sourceOfTruth?.kind || ""),
    dataset: String(metric?.sourceOfTruth?.dataset || "")
  };

  return {
    version: "v1",
    status,
    metricId: String(queryPlan?.metricId || ""),
    deterministicPreferred,
    failClosedOnWarning: String(metric?.domain || "").startsWith("finance"),
    sourceLocks
  };
}

export function shouldBlockCatalogFallback(executionPolicy, strictCatalogExecutor = true) {
  const strict = Boolean(strictCatalogExecutor);
  if (!strict) return false;
  const p = executionPolicy && typeof executionPolicy === "object" ? executionPolicy : {};
  const status = String(p.status || "");
  const metricId = String(p.metricId || "");
  const hasCatalogMetric = status !== "catalog_miss" && metricId && metricId !== "unknown";
  return hasCatalogMetric;
}

