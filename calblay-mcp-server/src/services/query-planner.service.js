import {
  extractCostDepartmentPeriodSlots,
  extractDateYmdFromQuestion,
  extractDepartmentFromQuestion,
  extractPlateFromQuestion,
  extractWorkerNameFromQuestion,
  extractYearMonthFromQuestion,
  normalizeCostDepartmentContains,
  shouldForceAuditsCount,
  shouldForceFinquesCount,
  shouldForceCostDepartmentPeriod,
  shouldForceEventsCountByDay,
  shouldForceFinanceResultByLnMonth,
  shouldForcePersonnelSearch,
  shouldForceVehicleAssignmentsByPlate,
  shouldForceWorkerServicesCount
} from "./ai-chat/helpers.js";

function inferLnContains(question) {
  const qNorm = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (/\bfoodlovers?\b/.test(qNorm)) return "LN0005";
  if (/\bfires?|festivals?\b/.test(qNorm)) return "fires";
  if (/\bempresa\b/.test(qNorm)) return "empresa";
  if (/\brestaurants?\b/.test(qNorm)) return "restaurants";
  if (/\bcasaments?\b/.test(qNorm)) return "casaments";
  if (/\bprecuinats?|menjar preparat\b/.test(qNorm)) return "precuinats";
  return "";
}

function extractYearFromQuestion(question, fallbackYear = new Date().getFullYear()) {
  const qNorm = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const m = qNorm.match(/\b(20\d{2}|19\d{2})\b/);
  if (m?.[1]) return Number(m[1]);
  return Number(fallbackYear);
}

export function buildQueryPlan({ question, currentYear = new Date().getFullYear() } = {}) {
  const q = String(question || "").trim();
  const qNorm = q
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksHeadcount = /\b(quants?|cuantos?|nombre|numero|total)\b/.test(qNorm);
  const asksPeople = /\b(personal|treballadors?|empleats?|staff)\b/.test(qNorm);
  const asksCostLike = /\b(cost|submin\w*|sumin\w*|personal|rh|rrhh|imputaci|cexplotaci|c\.?\s*explotaci)\b/.test(
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
    const normalizedDept = normalizeCostDepartmentContains(slots.departmentContains || "");
    const isPersonalCost =
      normalizedDept === "rh" ||
      normalizedDept === "personal" ||
      /\b(cost.*personal|personal.*cost|cost de personal)\b/.test(qNorm);
    plan.metricId = isPersonalCost ? "cost_personal_month" : "cost_subministraments_month";
    plan.executor = "costs_by_department_period";
    plan.confidence = "medium";
    plan.slots = {
      departmentContains: normalizedDept || (isPersonalCost ? "personal" : ""),
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

  if (shouldForceFinanceResultByLnMonth(q) || /\b(facturacio|facturacion|vendes totals|vendes)\b/.test(qNorm)) {
    plan.metricId = "finance_result_ln_month";
    plan.executor = "finance_result_by_ln_month";
    plan.confidence = "medium";
    plan.slots = {
      yearMonth: extractYearMonthFromQuestion(q) || "",
      lnContains: inferLnContains(q)
    };
    if (!plan.slots.yearMonth || !plan.slots.lnContains) {
      plan.status = "ambiguous";
      plan.confidence = "low";
      plan.reasoning.push("Finance LN-month intent detected but key slots are missing.");
    } else {
      plan.reasoning.push("Detected finance result by LN/month intent.");
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

  if (shouldForceFinquesCount(q)) {
    plan.metricId = "finques_count";
    plan.executor = "finques_count";
    plan.confidence = "medium";
    plan.reasoning.push("Detected finques count intent.");
    return plan;
  }

  const asksIncidents = /\b(inciden\w*|incident\w*)\b/.test(qNorm);
  const asksIncidentCount = /\b(quants?|quantas?|cuantas?|total|nombre|numero|registrat|hem generat)\b/.test(
    qNorm
  );
  if (asksIncidents && asksIncidentCount) {
    plan.metricId = "incidents_count_year";
    plan.executor = "incidents_count_by_year";
    plan.confidence = "medium";
    plan.slots = { year: extractYearFromQuestion(q, currentYear) };
    plan.reasoning.push("Detected incidents count intent by year.");
    return plan;
  }

  plan.status = "catalog_miss";
  plan.metricId = "unknown";
  plan.executor = "auto";
  plan.reasoning.push("No deterministic metric match. Fallback to tool auto-routing.");
  return plan;
}

