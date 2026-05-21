import { buildDeterministicExecutionResult } from "../core/contracts/deterministic-executor.js";
import { readMetricCatalog } from "./metric-catalog.service.js";
import { runTool } from "./ai-chat/run-tool.js";
import { normalizeCostDepartmentContains } from "./ai-chat/helpers.js";

const COST_METRIC_IDS = new Set([
  "cost_subministraments_month",
  "cost_personal_month",
  "cost_compres_month",
  "cost_serveis_professionals_month",
  "cost_assegurances_month"
]);

function getMetricDefinition(metricId) {
  const read = readMetricCatalog();
  const metrics = Array.isArray(read?.catalog?.metrics) ? read.catalog.metrics : [];
  return metrics.find((m) => m?.metricId === metricId && m?.active !== false) || null;
}

function normalizeCostMetricSlots(metric, slots = {}) {
  const fromRule = String(metric?.calculationRule?.departmentContains || "").trim();
  const fromSlots = normalizeCostDepartmentContains(
    slots.departmentContains || slots.department || fromRule || "subministr"
  );
  return {
    departmentContains: fromSlots,
    period: String(slots.period || slots.yearMonth || "")
  };
}

function normalizeSlots(metricId, slots = {}, metric = null) {
  const s = slots && typeof slots === "object" ? slots : {};
  const m = metric || getMetricDefinition(metricId);

  if (COST_METRIC_IDS.has(metricId) || m?.calculationRule?.executor === "costs_by_department_period") {
    return normalizeCostMetricSlots(m, s);
  }
  if (metricId === "preventius_planned_count_day") {
    return { date: String(s.date || "") };
  }
  if (metricId === "personnel_count_by_department") {
    const department = String(s.department || s.departmentContains || "");
    return { department, departmentContains: department };
  }
  if (metricId === "vehicle_assignments_count_by_plate") {
    return { plate: String(s.plate || "").toUpperCase() };
  }
  if (metricId === "worker_services_count") {
    return { workerName: String(s.workerName || "") };
  }
  if (metricId === "finance_result_ln_month") {
    return {
      yearMonth: String(s.yearMonth || ""),
      lnContains: String(s.lnContains || s.ln || "")
    };
  }
  if (metricId === "incidents_count_year" || metricId === "events_count_year") {
    const year = Number(s.year);
    return {
      year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : undefined,
      limit: s.limit != null ? Number(s.limit) : undefined
    };
  }
  if (metricId === "events_count_ln_month") {
    return { yearMonth: String(s.yearMonth || "") };
  }
  if (metricId === "event_context_by_code") {
    return { code: String(s.code || "").trim() };
  }
  if (metricId === "sales_centre_month") {
    const year = Number(s.year);
    return {
      year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : undefined,
      file: s.file ? String(s.file) : undefined
    };
  }
  if (metricId === "sales_article_centre_month") {
    return {
      centreContains: String(s.centreContains || ""),
      articleContains: String(s.articleContains || ""),
      yearMonth: String(s.yearMonth || ""),
      file: s.file ? String(s.file) : undefined
    };
  }
  if (metricId === "purchases_ln_centre_period") {
    return {
      dateFrom: String(s.dateFrom || ""),
      dateTo: String(s.dateTo || ""),
      supplierCode: s.supplierCode ? String(s.supplierCode) : undefined,
      supplierName: s.supplierName ? String(s.supplierName) : undefined
    };
  }
  if (metricId === "purchases_top_articles_amount") {
    return {
      yearMonth: String(s.yearMonth || s.period || "").slice(0, 7),
      dateFrom: s.dateFrom ? String(s.dateFrom) : undefined,
      dateTo: s.dateTo ? String(s.dateTo) : undefined,
      topN: s.topN != null ? Number(s.topN) : undefined,
      metric: s.metric ? String(s.metric) : undefined
    };
  }
  if (metricId === "purchases_supplier_year") {
    const year = Number(s.year);
    return {
      year: Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear(),
      supplierCode: s.supplierCode ? String(s.supplierCode) : undefined,
      supplierName: s.supplierName ? String(s.supplierName) : undefined
    };
  }
  if (metricId === "purchases_supplier_article_period") {
    return {
      supplierCode: s.supplierCode ? String(s.supplierCode) : undefined,
      supplierName: s.supplierName ? String(s.supplierName) : undefined,
      yearMonth: String(s.yearMonth || s.period || "").slice(0, 7),
      articleContains: s.articleContains ? String(s.articleContains) : undefined
    };
  }
  if (metricId === "audits_count_period") {
    return {
      yearMonth: s.yearMonth ? String(s.yearMonth) : undefined,
      year: s.year != null ? Number(s.year) : undefined,
      department: s.department ? String(s.department) : undefined,
      status: s.status ? String(s.status) : undefined,
      limit: s.limit != null ? Number(s.limit) : undefined
    };
  }
  if (metricId === "finques_count") {
    return { limit: s.limit != null ? Number(s.limit) : undefined };
  }
  if (metricId === "food_safety_celiac_dishes") {
    return {};
  }
  return s;
}

function validateRequiredSlots(metric, slots) {
  const required = Array.isArray(metric?.slotSchema) ? metric.slotSchema : [];
  const missing = [];
  for (const slotName of required) {
    const key = String(slotName || "");
    if (!key || key.endsWith("_optional")) continue;
    const v = slots[key];
    if (v == null || String(v).trim() === "") missing.push(key);
  }
  return missing;
}

export async function executeDeterministicMetric({ metricId, slots = {}, runner = runTool } = {}) {
  const id = String(metricId || "").trim();
  if (!id) throw new Error("Missing metricId");
  const metric = getMetricDefinition(id);
  if (!metric) throw new Error(`Metric not found or inactive: ${id}`);

  const executor = String(metric?.calculationRule?.executor || "").trim();
  if (!executor) throw new Error(`Metric ${id} has no executor`);

  const normalizedSlots = normalizeSlots(id, slots, metric);
  if (metric?.sourceOfTruth?.kind && executor === "costs_by_department_period") {
    normalizedSlots.financeKindPreferred = String(metric.sourceOfTruth.kind);
  }
  const missing = validateRequiredSlots(metric, normalizedSlots);
  if (missing.length) {
    return {
      ok: false,
      metricId: id,
      executor,
      error: "Missing required slots",
      missingSlots: missing,
      slotsUsed: normalizedSlots
    };
  }

  const raw = await runner(executor, normalizedSlots);
  return buildDeterministicExecutionResult({
    metricId: id,
    executor,
    slotsUsed: normalizedSlots,
    raw,
    sourceOfTruth: metric?.sourceOfTruth || null,
    aggregation: metric?.calculationRule?.aggregation || "",
    confidence: metric?.outputContract?.confidence || "medium"
  });
}
