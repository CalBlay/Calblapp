import {
  extractCostDepartmentPeriodSlots,
  extractDateYmdFromQuestion,
  extractDepartmentFromQuestion,
  extractPlateFromQuestion,
  extractWorkerNameFromQuestion,
  extractYearMonthFromQuestion,
  inferLnContains,
  normalizeCostDepartmentContains,
  shouldForceAuditsCount,
  shouldForceFinquesCount,
  shouldForceCostDepartmentPeriod,
  shouldForceEventsCountByDay,
  shouldForceEventsCountYear,
  shouldForceEventsCountLnMonth,
  shouldForceFinanceResultByLnMonth,
  shouldForceIncidentsCountYear,
  shouldForcePersonnelSearch,
  shouldForceSalesArticleCentreMonth,
  shouldForceSalesCentreMonth,
  shouldForceVehicleAssignmentsByPlate,
  shouldForceWorkerServicesCount
} from "./ai-chat/helpers.js";

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
  const asksCostLike =
    /\b(cost|submin\w*|sumin\w*|personal|rh|rrhh|imputaci|cexplotaci|c\.?\s*explotaci)\b/.test(qNorm) ||
    (/\b(compres|compras)\b/.test(qNorm) &&
      !/\b(proveidor|proveedor|factur|P\d{4,})\b/i.test(qNorm));
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

  if (shouldForceSalesArticleCentreMonth(q)) {
    plan.metricId = "sales_article_centre_month";
    plan.executor = "sales_by_article_centre_month";
    plan.confidence = "medium";
    plan.slots = {
      centreContains: /\bnautic\b/.test(qNorm) ? "nautic" : "",
      articleContains: /\baigua\b/.test(qNorm) ? "aigua" : "",
      yearMonth: extractYearMonthFromQuestion(q) || ""
    };
    if (!plan.slots.yearMonth) {
      plan.status = "ambiguous";
      plan.reasoning.push("Sales article-centre-month intent but yearMonth missing.");
    } else {
      plan.reasoning.push("Detected sales by article, centre and month.");
    }
    return plan;
  }

  if (shouldForceSalesCentreMonth(q)) {
    plan.metricId = "sales_centre_month";
    plan.executor = "sales_by_centre_month";
    plan.confidence = "medium";
    plan.slots = { year: extractYearFromQuestion(q, currentYear) };
    plan.reasoning.push("Detected sales by centre/year aggregation.");
    return plan;
  }

  if (shouldForceCostDepartmentPeriod(q) || asksCostLike) {
    const slots = extractCostDepartmentPeriodSlots(q) || {};
    const normalizedDept = normalizeCostDepartmentContains(slots.departmentContains || "");
    const isPersonalCost =
      normalizedDept === "rh" ||
      normalizedDept === "personal" ||
      /\b(cost.*personal|personal.*cost|cost de personal)\b/.test(qNorm);
    const isCompresDept = normalizedDept === "compres";
    const isServeisPro = /\bserveis\s+professional/.test(qNorm) || normalizedDept.includes("serveis professional");
    const isAssegurances = /\bassegur/.test(qNorm) || normalizedDept.includes("assegur");
    plan.metricId = isPersonalCost
      ? "cost_personal_month"
      : isCompresDept
        ? "cost_compres_month"
        : isServeisPro
          ? "cost_serveis_professionals_month"
          : isAssegurances
            ? "cost_assegurances_month"
            : "cost_subministraments_month";
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

  if (shouldForceEventsCountLnMonth(q)) {
    plan.metricId = "events_count_ln_month";
    plan.executor = "events_count_by_ln_month";
    plan.confidence = "medium";
    plan.slots = { yearMonth: extractYearMonthFromQuestion(q) || "" };
    if (!plan.slots.yearMonth) {
      plan.status = "ambiguous";
      plan.reasoning.push("Events LN-month intent but yearMonth missing.");
    } else {
      plan.reasoning.push("Detected events count by LN and month.");
    }
    return plan;
  }

  if (shouldForceEventsCountYear(q)) {
    plan.metricId = "events_count_year";
    plan.executor = "events_count_by_year";
    plan.confidence = "medium";
    plan.slots = { year: extractYearFromQuestion(q, currentYear) };
    plan.reasoning.push("Detected events count by year.");
    return plan;
  }

  if (shouldForceAuditsCount(q)) {
    plan.metricId = "audits_count_period";
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
  const asksIncidentCount =
    shouldForceIncidentsCountYear(q) ||
    /\b(quants?|quantas?|cuantas?|total|nombre|numero|registrat|hem generat)\b/.test(qNorm);
  if (asksIncidents && asksIncidentCount) {
    plan.metricId = "incidents_count_year";
    plan.executor = "incidents_count_by_year";
    plan.confidence = "medium";
    plan.slots = { year: extractYearFromQuestion(q, currentYear) };
    plan.reasoning.push("Detected incidents count intent by year.");
    return plan;
  }

  if (
    /\b(celiac\w*|sense gluten|gluten)\b/.test(qNorm) &&
    /\b(plats?|platos?|menjar|aptes?)\b/.test(qNorm)
  ) {
    plan.metricId = "food_safety_celiac_dishes";
    plan.executor = "food_safety_celiac_dishes";
    plan.confidence = "high";
    plan.slots = {};
    plan.reasoning.push("Detected celiac-safe dishes query.");
    return plan;
  }

  plan.status = "catalog_miss";
  plan.metricId = "unknown";
  plan.executor = "auto";
  plan.reasoning.push("No deterministic metric match. Fallback to tool auto-routing.");
  return plan;
}

