import { buildDeterministicExecutionResult } from "../core/contracts/deterministic-executor.js";
import { readMetricCatalog } from "./metric-catalog.service.js";
import { runTool } from "./ai-chat/run-tool.js";
import { normalizeCostDepartmentContains } from "./ai-chat/helpers.js";

function getMetricDefinition(metricId) {
  const read = readMetricCatalog();
  const metrics = Array.isArray(read?.catalog?.metrics) ? read.catalog.metrics : [];
  return metrics.find((m) => m?.metricId === metricId && m?.active !== false) || null;
}

function normalizeSlots(metricId, slots = {}) {
  const s = slots && typeof slots === "object" ? slots : {};
  if (metricId === "cost_subministraments_month") {
    return {
      departmentContains: normalizeCostDepartmentContains(s.departmentContains || "subministr"),
      period: String(s.period || "")
    };
  }
  if (metricId === "cost_personal_month") {
    return {
      departmentContains: normalizeCostDepartmentContains(s.departmentContains || "personal"),
      period: String(s.period || "")
    };
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

  const normalizedSlots = normalizeSlots(id, slots);
  if ((id === "cost_subministraments_month" || id === "cost_personal_month") && metric?.sourceOfTruth?.kind) {
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

