import {
  extractCostDepartmentPeriodSlots,
  extractDateYmdFromQuestion,
  extractDepartmentFromQuestion,
  extractPlateFromQuestion,
  extractWorkerNameFromQuestion,
  normalizeCostDepartmentContains,
  shouldForceAuditsCount,
  shouldForceCostDepartmentPeriod,
  shouldForceEventsCountByDay,
  shouldForcePersonnelSearch,
  shouldForceVehicleAssignmentsByPlate,
  shouldForceWorkerServicesCount
} from "./ai-chat/helpers.js";

export function buildQueryPlan({ question, currentYear = new Date().getFullYear() } = {}) {
  const q = String(question || "").trim();
  const qNorm = q
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksHeadcount = /\b(quants?|cuantos?|nombre|numero|total)\b/.test(qNorm);
  const asksPeople = /\b(personal|treballadors?|empleats?|staff)\b/.test(qNorm);
  const asksCostLike = /\b(cost|subministr\w*|suministr\w*|imputaci|cexplotaci|c\.?\s*explotaci)\b/.test(
    qNorm
  );
  const plan = {
    plannerVersion: "v1",
    question: q,
    status: "catalog_hit",
    metricId: "",
    confidence: "low",
    slots: {},
    executor: "",
    reasoning: []
  };

  if (shouldForceVehicleAssignmentsByPlate(q)) {
    plan.metricId = "vehicle_assignments_count_by_plate";
    plan.executor = "vehicle_assignments_count_by_plate";
    plan.confidence = "high";
    plan.slots = {
      plate: extractPlateFromQuestion(q) || ""
    };
    if (!plan.slots.plate) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Vehicle assignment intent detected but plate slot is missing.");
    } else {
      plan.reasoning.push("Detected vehicle assignment count intent with plate pattern.");
    }
    return plan;
  }

  if (shouldForceWorkerServicesCount(q)) {
    plan.metricId = "worker_services_count";
    plan.executor = "worker_services_count";
    plan.confidence = "high";
    plan.slots = {
      workerName: extractWorkerNameFromQuestion(q) || ""
    };
    if (!plan.slots.workerName) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Worker service count intent detected but workerName slot is missing.");
    } else {
      plan.reasoning.push("Detected worker service count intent.");
    }
    return plan;
  }

  if (shouldForceEventsCountByDay(q)) {
    plan.metricId = "preventius_planned_count_day";
    plan.executor = "preventius_planned_count_by_day";
    plan.confidence = "high";
    plan.slots = {
      date: extractDateYmdFromQuestion(q, currentYear) || ""
    };
    if (!plan.slots.date) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Planned maintenance daily count intent detected but date slot is missing.");
    } else {
      plan.reasoning.push("Detected planned maintenance daily count intent.");
    }
    return plan;
  }

  if (shouldForcePersonnelSearch(q) || (asksHeadcount && asksPeople)) {
    plan.metricId = "personnel_count_by_department";
    plan.executor = "personnel_search";
    plan.confidence = "high";
    plan.slots = {
      department: extractDepartmentFromQuestion(q) || ""
    };
    if (!plan.slots.department) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Personnel headcount intent detected but department slot is missing.");
    } else {
      plan.reasoning.push("Detected personnel headcount by department intent.");
    }
    return plan;
  }

  if (shouldForceCostDepartmentPeriod(q) || asksCostLike) {
    const slots = extractCostDepartmentPeriodSlots(q) || {};
    plan.metricId = "cost_subministraments_month";
    plan.executor = "costs_by_department_period";
    plan.confidence = "medium";
    plan.slots = {
      departmentContains: normalizeCostDepartmentContains(slots.departmentContains || ""),
      period: slots.period || ""
    };
    if (!plan.slots.departmentContains || !plan.slots.period) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Cost-by-department-period intent detected but key slots are missing.");
    } else {
      plan.reasoning.push("Detected deterministic cost-by-department-period intent.");
    }
    return plan;
  }

  if (shouldForceAuditsCount(q)) {
    plan.metricId = "audits_count";
    plan.executor = "audits_count";
    plan.confidence = "medium";
    plan.reasoning.push("Detected audits count intent.");
    return plan;
  }

  plan.status = "catalog_miss";
  plan.metricId = "unknown";
  plan.executor = "auto";
  plan.reasoning.push("No deterministic metric match. Fallback to tool auto-routing.");
  return plan;
}

