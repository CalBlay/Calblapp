import axios from "axios";
import { buildCostImputationReportCalblay } from "./cost-imputation-report.js";
import { enforceDataBackedAnswerPolicy } from "../core/policies/answer-policy.js";
import {
  buildQueryExecutionPolicy,
  shouldBlockCatalogFallback
} from "../core/policies/query-execution-policy.js";
import { detectQueryIntent } from "../core/semantics/intent-router.js";
import { cacheGet, cacheKey, cacheSet } from "./ai-chat/cache.js";
import { getOpenAiConfig, MAX_TOOL_STEPS } from "./ai-chat/config.js";
import {
  canExtractCostDepartmentPeriodSlots,
  extractPlateFromQuestion,
  extractWorkerNameFromQuestion,
  extractDepartmentFromQuestion,
  extractDateYmdFromQuestion,
  extractYearMonthFromQuestion,
  extractCostDepartmentPeriodSlots,
  normalizeCostDepartmentContains,
  shouldForceAuditsCount,
  shouldForceFinquesCount,
  normalizeReport,
  shrinkToolPayload,
  splitNarrativeAndReport
} from "./ai-chat/helpers.js";
import { runTool } from "./ai-chat/run-tool.js";
import { buildChatSystemContent } from "./ai-chat/system-prompt.js";
import { buildTools } from "./ai-chat/tools.js";
import { createChatTraceId, logChatTrace } from "./ml-learning.service.js";
import { buildQueryPlan } from "./query-planner.service.js";
import { executeDeterministicMetric } from "./deterministic-executor.service.js";

function plannerToolChoiceFromPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  if (plan.status !== "catalog_hit") return null;
  const executor = String(plan.executor || "").trim();
  if (!executor || executor === "auto") return null;
  return { type: "function", function: { name: executor } };
}

function legacyForcedToolName({
  forceFinanceResultByLnMonth,
  forceEventsCountByDay,
  forceIncidentsCountYear,
  forcePersonnelSearch,
  forceVehicleAssignmentsByPlate,
  forceWorkerServicesCount,
  forceAuditsCount,
  forceFinquesCount,
  canForceCostDept,
  forceCostOverview,
  forceFirestoreCatalog
} = {}) {
  if (forceFinanceResultByLnMonth) return "finance_result_by_ln_month";
  if (forceEventsCountByDay) return "preventius_planned_count_by_day";
  if (forceIncidentsCountYear) return "incidents_count_by_year";
  if (forcePersonnelSearch) return "personnel_search";
  if (forceVehicleAssignmentsByPlate) return "vehicle_assignments_count_by_plate";
  if (forceWorkerServicesCount) return "worker_services_count";
  if (forceAuditsCount) return "audits_count";
  if (forceFinquesCount) return "finques_count";
  if (canForceCostDept) return "costs_by_department_period";
  if (forceCostOverview) return "costs_imputation_overview";
  if (forceFirestoreCatalog) return "firestore_collections_catalog";
  return "";
}

function buildDeterministicCostNarrative(question, toolOutcomes, language = "ca") {
  const qn = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (!/\bsubmin|suministr|cost|cexplotaci|c\.?\s*explotaci\b/.test(qn)) return "";
  const costOut = [...(Array.isArray(toolOutcomes) ? toolOutcomes : [])]
    .reverse()
    .find((o) => o && typeof o === "object" && o.departmentContains != null && o.period != null && o.totalAmount != null);
  if (!costOut) return "";

  const period = String(costOut.period || "");
  const total = Number(costOut.totalAmount || 0);
  const warning = String(costOut.warning || "").trim();
  const hasMatches = Number(costOut.matchCount || 0) > 0;
  const eur = new Intl.NumberFormat(language.startsWith("es") ? "es-ES" : "ca-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(total);

  if (warning) {
    return (
      `No s'ha trobat una fila de costos que coincideixi amb el filtre per ${period}. ` +
      `${warning}`
    );
  }
  if (!hasMatches) {
    return (
      `No s'han trobat files de cost per al filtre indicat (${period}). ` +
      "Recomano revisar els labels amb costs_imputation_overview."
    );
  }
  return `El cost de subministraments per al període ${period} és ${eur} segons c.explotació (finances).`;
}

function buildAnswerFromDeterministicResult(execOut, language = "ca") {
  if (!execOut || execOut.ok !== true) return "";
  const metricId = String(execOut.metricId || "");
  if (metricId === "preventius_planned_count_day") {
    const date = String(execOut?.slotsUsed?.date || "");
    const count = Number(execOut?.result?.total || execOut?.result?.count || 0);
    return `Tenim ${count} preventius planificats el ${date}.`;
  }
  if (metricId === "vehicle_assignments_count_by_plate") {
    const plate = String(execOut?.slotsUsed?.plate || "");
    const count = Number(execOut?.result?.totalAssignments || execOut?.result?.count || 0);
    return `La matrícula ${plate} s'ha assignat ${count} cops.`;
  }
  if (metricId === "worker_services_count") {
    const worker = String(execOut?.slotsUsed?.workerName || "");
    const count = Number(execOut?.result?.totalServices || execOut?.result?.count || 0);
    return `${worker} ha anat a ${count} serveis.`;
  }
  if (metricId === "personnel_count_by_department") {
    const dept = String(execOut?.slotsUsed?.department || execOut?.slotsUsed?.departmentContains || "");
    const count =
      Number(execOut?.result?.count || 0) || Number(execOut?.result?.total || 0) || 0;
    return `Hi ha ${count} persones al departament ${dept}.`;
  }
  if (metricId === "cost_subministraments_month") {
    const warning = String(execOut?.result?.warning || "").trim();
    if (warning) {
      return `No s'ha pogut calcular el cost de subministraments de forma fiable: ${warning}`;
    }
    const period = String(execOut?.slotsUsed?.period || "");
    const total = Number(execOut?.result?.totalAmount || 0);
    const eur = new Intl.NumberFormat(language.startsWith("es") ? "es-ES" : "ca-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2
    }).format(total);
    return `El cost de subministraments per al període ${period} és ${eur}.`;
  }
  if (metricId === "cost_personal_month") {
    const warning = String(execOut?.result?.warning || "").trim();
    if (warning) {
      return `No s'ha pogut calcular el cost de personal de forma fiable: ${warning}`;
    }
    const period = String(execOut?.slotsUsed?.period || "");
    const total = Number(execOut?.result?.totalAmount || 0);
    const eur = new Intl.NumberFormat(language.startsWith("es") ? "es-ES" : "ca-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2
    }).format(total);
    return `El cost de personal per al període ${period} és ${eur}.`;
  }
  return "";
}

function enrichDeterministicSlots(metricId, baseSlots, question, currentYear) {
  const slots = baseSlots && typeof baseSlots === "object" ? { ...baseSlots } : {};
  if (metricId === "preventius_planned_count_day" && !String(slots.date || "").trim()) {
    const d = extractDateYmdFromQuestion(question, currentYear);
    if (d) slots.date = d;
  }
  if (metricId === "vehicle_assignments_count_by_plate" && !String(slots.plate || "").trim()) {
    const plate = extractPlateFromQuestion(question);
    if (plate) slots.plate = plate;
  }
  if (metricId === "worker_services_count" && !String(slots.workerName || "").trim()) {
    const worker = extractWorkerNameFromQuestion(question);
    if (worker) slots.workerName = worker;
  }
  if (
    metricId === "personnel_count_by_department" &&
    !String(slots.department || slots.departmentContains || "").trim()
  ) {
    const department = extractDepartmentFromQuestion(question);
    if (department) {
      slots.department = department;
      slots.departmentContains = department;
    }
  }
  if (metricId === "cost_subministraments_month" || metricId === "cost_personal_month") {
    const inferred = extractCostDepartmentPeriodSlots(question) || {};
    if (!String(slots.departmentContains || "").trim()) {
      slots.departmentContains = normalizeCostDepartmentContains(String(inferred.departmentContains || ""));
      if (!slots.departmentContains) {
        slots.departmentContains = metricId === "cost_personal_month" ? "personal" : "subministr";
      }
    }
    if (!String(slots.period || "").trim()) {
      slots.period = String(inferred.period || "");
    }
  }
  return slots;
}

/**
 * Xat amb OpenAI + function calling. La lògica auxiliar viu a `src/services/ai-chat/`.
 */
export async function chatWithTools({ question, language = "ca", rich = false }) {
  const startedAt = Date.now();
  const traceId = createChatTraceId();
  const { apiKey, model } = getOpenAiConfig();
  const tools = buildTools();
  /** sense prou tokens, les tool_calls es truncuen i el bucle falla (errors 500 opacs en producció). */
  const envMax = Number(process.env.OPENAI_MAX_TOKENS || 1200);
  const baseMax = Math.min(4096, Math.max(1024, Number.isFinite(envMax) ? envMax : 1200));
  const maxTokens = rich ? Math.min(4096, baseMax + 512) : baseMax;

  const qNorm = question.trim();
  const intent = detectQueryIntent(qNorm);
  const currentYear = new Date().getFullYear();
  const queryPlan = buildQueryPlan({ question: qNorm, currentYear });
  const { systemContent, forceCostOverview, forceCostDepartmentPeriod, forceFinanceResultByLnMonth, forceEventsCountByDay, forceIncidentsCountYear, forcePersonnelSearch, forceVehicleAssignmentsByPlate, forceWorkerServicesCount, forceAuditsCount, forceFinquesCount, forceFirestoreCatalog } = buildChatSystemContent({
    qNorm,
    rich,
    currentYear
  });
  const plannerToolChoiceEnabled = String(process.env.QUERY_PLANNER_TOOL_CHOICE || "0").trim() === "1";
  const deterministicExecutorEnabled =
    String(process.env.QUERY_PLANNER_DETERMINISTIC_EXECUTOR || "0").trim() === "1";
  const strictCatalogExecutor =
    String(process.env.QUERY_PLANNER_STRICT_CATALOG_EXECUTOR || "1").trim() !== "0";
  const cacheVersion =
    process.env.OPENAI_CACHE_VERSION ||
    `v26|costDept=${forceCostDepartmentPeriod ? 1 : 0}|costOv=${forceCostOverview ? 1 : 0}|pnlLn=${forceFinanceResultByLnMonth ? 1 : 0}|eventsDay=${forceEventsCountByDay ? 1 : 0}|personnel=${forcePersonnelSearch ? 1 : 0}|vehicleAssign=${forceVehicleAssignmentsByPlate ? 1 : 0}|workerServices=${forceWorkerServicesCount ? 1 : 0}|audits=${forceAuditsCount ? 1 : 0}|finques=${forceFinquesCount ? 1 : 0}|fsCat=${forceFirestoreCatalog ? 1 : 0}|qpStatus=${queryPlan.status || "na"}|policy=v1|strictCatalog=${strictCatalogExecutor ? 1 : 0}`;
  const ck = cacheKey(model, language, qNorm, rich, cacheVersion);
  const cached = cacheGet(ck);
  const executionPolicy = buildQueryExecutionPolicy({
    queryPlan,
    deterministicExecutorEnabled
  });
  if (cached) {
    const bypassCachedNoTools = forceFirestoreCatalog && Number(cached.toolCallsUsed || 0) === 0;
    if (!bypassCachedNoTools) {
      const outCached = {
        ...cached,
        cached: true,
        traceId,
        queryPlan,
        executionPolicy,
        toolChoiceSource: String(cached.toolChoiceSource || "auto")
      };
      logChatTrace({
        traceId,
        question: qNorm,
        language,
        rich,
        intent,
        queryPlan,
        result: outCached,
        toolOutcomes: [],
        forcedFlags: {
          forceCostOverview,
          forceCostDepartmentPeriod,
          forceFinanceResultByLnMonth,
          forceEventsCountByDay,
          forcePersonnelSearch,
          forceVehicleAssignmentsByPlate,
          forceWorkerServicesCount,
          forceAuditsCount,
          forceFinquesCount,
          forceFirestoreCatalog
        },
        durationMs: Date.now() - startedAt
      });
      return outCached;
    }
  }

  const messages = [
    {
      role: "system",
      content: systemContent
    },
    {
      role: "user",
      content: `language=${language}\nquestion=${qNorm}`
    }
  ];

  /** Informe estructurat generat al servidor (evita JSON mal format al mode informe). */
  let serverReportCalblay = null;
  /** Resultats crus de tools (per política data-backed estricta). */
  const toolOutcomes = [];

  if (
    executionPolicy.deterministicPreferred &&
    (queryPlan?.status === "catalog_hit" || queryPlan?.status === "ambiguous") &&
    queryPlan?.metricId &&
    queryPlan?.metricId !== "unknown"
  ) {
    try {
      const execSlots = enrichDeterministicSlots(
        String(queryPlan.metricId),
        queryPlan.slots || {},
        qNorm,
        currentYear
      );
      const execOut = await executeDeterministicMetric({
        metricId: String(queryPlan.metricId),
        slots: execSlots
      });
      if (execOut?.ok) {
        const warning = String(execOut?.result?.warning || "").trim();
        const failClosedAnswer =
          executionPolicy.failClosedOnWarning && warning
            ? `No s'ha pogut calcular aquesta consulta amb fiabilitat: ${warning}`
            : "";
        const deterministicAnswer = failClosedAnswer || buildAnswerFromDeterministicResult(execOut, language);
        const out = {
          model,
          answer: deterministicAnswer || "Consulta executada de forma determinista.",
          report: rich
            ? {
                calc_details: execOut.calc_details,
                slotsUsed: execOut.slotsUsed,
                metricId: execOut.metricId,
                executor: execOut.executor
              }
            : null,
          toolCallsUsed: 1,
          cached: false,
          traceId,
          queryPlan,
          executionPolicy,
          toolChoiceSource: "deterministic_executor",
          calc_details: execOut.calc_details
        };
        toolOutcomes.push(execOut.result);
        logChatTrace({
          traceId,
          question: qNorm,
          language,
          rich,
          intent,
          queryPlan,
          result: out,
          toolOutcomes,
          forcedFlags: {
            forceCostOverview,
            forceCostDepartmentPeriod,
            forceFinanceResultByLnMonth,
            forceEventsCountByDay,
            forcePersonnelSearch,
            forceVehicleAssignmentsByPlate,
            forceWorkerServicesCount,
            forceAuditsCount,
            forceFinquesCount,
            forceFirestoreCatalog
          },
          durationMs: Date.now() - startedAt
        });
        cacheSet(ck, {
          model: out.model,
          answer: out.answer,
          report: out.report,
          toolCallsUsed: out.toolCallsUsed,
          toolChoiceSource: out.toolChoiceSource,
          calc_details: out.calc_details,
          executionPolicy: out.executionPolicy
        });
        return out;
      }
      if (shouldBlockCatalogFallback(executionPolicy, strictCatalogExecutor)) {
        const blockedMsg =
          execOut?.error === "Missing required slots"
            ? `No puc executar aquesta mètrica amb qualitat perquè falten paràmetres obligatoris: ${(execOut?.missingSlots || []).join(", ")}.`
            : "No s'ha pogut executar la mètrica de catàleg de forma fiable; bloquejo fallback automàtic per evitar barreges.";
        const out = {
          model,
          answer: blockedMsg,
          report: rich
            ? {
                calc_details: null,
                slotsUsed: execOut?.slotsUsed || execSlots,
                metricId: String(queryPlan.metricId || ""),
                executor: String(queryPlan.executor || ""),
                blocked: true
              }
            : null,
          toolCallsUsed: 1,
          cached: false,
          traceId,
          queryPlan,
          executionPolicy,
          toolChoiceSource: "deterministic_executor_blocked",
          calc_details: null
        };
        toolOutcomes.push(execOut || { ok: false, error: "deterministic_executor_failed" });
        logChatTrace({
          traceId,
          question: qNorm,
          language,
          rich,
          intent,
          queryPlan,
          result: out,
          toolOutcomes,
          forcedFlags: {
            forceCostOverview,
            forceCostDepartmentPeriod,
            forceFinanceResultByLnMonth,
            forceEventsCountByDay,
            forcePersonnelSearch,
            forceVehicleAssignmentsByPlate,
            forceWorkerServicesCount,
            forceAuditsCount,
            forceFinquesCount,
            forceFirestoreCatalog
          },
          durationMs: Date.now() - startedAt
        });
        cacheSet(ck, {
          model: out.model,
          answer: out.answer,
          report: out.report,
          toolCallsUsed: out.toolCallsUsed,
          toolChoiceSource: out.toolChoiceSource,
          calc_details: out.calc_details,
          executionPolicy: out.executionPolicy
        });
        return out;
      }
    } catch {
      if (shouldBlockCatalogFallback(executionPolicy, strictCatalogExecutor)) {
        const out = {
          model,
          answer:
            "No s'ha pogut executar la mètrica de catàleg de forma fiable (error intern controlat). Bloquejo fallback automàtic per evitar respostes barrejades.",
          report: rich
            ? {
                calc_details: null,
                slotsUsed: queryPlan?.slots || {},
                metricId: String(queryPlan?.metricId || ""),
                executor: String(queryPlan?.executor || ""),
                blocked: true
              }
            : null,
          toolCallsUsed: 1,
          cached: false,
          traceId,
          queryPlan,
          executionPolicy,
          toolChoiceSource: "deterministic_executor_blocked",
          calc_details: null
        };
        logChatTrace({
          traceId,
          question: qNorm,
          language,
          rich,
          intent,
          queryPlan,
          result: out,
          toolOutcomes: [{ ok: false, error: "deterministic_executor_exception" }],
          forcedFlags: {
            forceCostOverview,
            forceCostDepartmentPeriod,
            forceFinanceResultByLnMonth,
            forceEventsCountByDay,
            forcePersonnelSearch,
            forceVehicleAssignmentsByPlate,
            forceWorkerServicesCount,
            forceAuditsCount,
            forceFinquesCount,
            forceFirestoreCatalog
          },
          durationMs: Date.now() - startedAt
        });
        return out;
      }
    }
  }

  let toolChoiceSource = "auto";
  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const anyToolMessageYet = messages.some((m) => m.role === "tool");
    const canForceCostDept = forceCostDepartmentPeriod && canExtractCostDepartmentPeriodSlots(qNorm);
    const hasLegacyForcedChoice =
      forceFinanceResultByLnMonth ||
      forceEventsCountByDay ||
      forceIncidentsCountYear ||
      forcePersonnelSearch ||
      forceVehicleAssignmentsByPlate ||
      forceWorkerServicesCount ||
      forceAuditsCount ||
      forceFinquesCount ||
      canForceCostDept ||
      forceCostOverview ||
      forceFirestoreCatalog;
    const forcedToolName = legacyForcedToolName({
      forceFinanceResultByLnMonth,
      forceEventsCountByDay,
      forceIncidentsCountYear,
      forcePersonnelSearch,
      forceVehicleAssignmentsByPlate,
      forceWorkerServicesCount,
      forceAuditsCount,
      forceFinquesCount,
      canForceCostDept,
      forceCostOverview,
      forceFirestoreCatalog
    });
    const plannerToolChoice =
      plannerToolChoiceEnabled && !anyToolMessageYet ? plannerToolChoiceFromPlan(queryPlan) : null;
    const plannerExecutorName = String(queryPlan?.executor || "").trim();
    const plannerEquivalentForced =
      plannerToolChoiceEnabled &&
      !anyToolMessageYet &&
      hasLegacyForcedChoice &&
      forcedToolName &&
      plannerExecutorName &&
      plannerExecutorName !== "auto" &&
      forcedToolName === plannerExecutorName;
    if (!anyToolMessageYet) {
      toolChoiceSource = plannerEquivalentForced
        ? "planner"
        : plannerToolChoice
          ? "planner"
        : hasLegacyForcedChoice
          ? "legacy_forced"
          : "auto";
    }
    const toolChoice =
      plannerToolChoice
        ? plannerToolChoice
      : forceFinanceResultByLnMonth && !anyToolMessageYet
        ? { type: "function", function: { name: "finance_result_by_ln_month" } }
        : forceEventsCountByDay && !anyToolMessageYet
          ? { type: "function", function: { name: "preventius_planned_count_by_day" } }
        : forceIncidentsCountYear && !anyToolMessageYet
          ? { type: "function", function: { name: "incidents_count_by_year" } }
        : forcePersonnelSearch && !anyToolMessageYet
          ? { type: "function", function: { name: "personnel_search" } }
        : forceVehicleAssignmentsByPlate && !anyToolMessageYet
          ? { type: "function", function: { name: "vehicle_assignments_count_by_plate" } }
        : forceWorkerServicesCount && !anyToolMessageYet
          ? { type: "function", function: { name: "worker_services_count" } }
        : forceAuditsCount && !anyToolMessageYet
          ? { type: "function", function: { name: "audits_count" } }
        : forceFinquesCount && !anyToolMessageYet
          ? { type: "function", function: { name: "finques_count" } }
        : canForceCostDept && !anyToolMessageYet
        ? { type: "function", function: { name: "costs_by_department_period" } }
        : forceCostOverview && !anyToolMessageYet
        ? { type: "function", function: { name: "costs_imputation_overview" } }
        : forceFirestoreCatalog && !anyToolMessageYet
          ? { type: "function", function: { name: "firestore_collections_catalog" } }
        : "auto";

    let response;
    try {
      response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model,
          messages,
          tools,
          tool_choice: toolChoice,
          temperature: 0,
          max_tokens: maxTokens
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 90000
        }
      );
    } catch (err) {
      const detail =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error?.type ||
        err?.message ||
        "OpenAI request failed";
      const e = new Error(`OpenAI /chat/completions error: ${detail}`);
      e.status = Number(err?.response?.status) || 502;
      throw e;
    }

    const choice = response.data?.choices?.[0]?.message;
    if (!choice) throw new Error("No response from OpenAI");

    messages.push(choice);

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      const rawContent = choice.content || "";
      let { narrative, report } = splitNarrativeAndReport(rawContent, rich);
      const policy = enforceDataBackedAnswerPolicy({
        intent,
        toolCallsUsed: messages.filter((m) => m.role === "tool").length,
        toolOutcomes,
        rawAnswer: narrative
      });
      narrative = policy.answer;
      const deterministicCostNarrative = buildDeterministicCostNarrative(qNorm, toolOutcomes, language);
      if (deterministicCostNarrative) {
        narrative = deterministicCostNarrative;
      }
      if (rich && serverReportCalblay) {
        report = normalizeReport(serverReportCalblay);
      }
      const out = {
        model,
        answer: narrative,
        report,
        toolCallsUsed: messages.filter((m) => m.role === "tool").length,
        cached: false,
        traceId,
        queryPlan,
        executionPolicy,
        toolChoiceSource
      };
      logChatTrace({
        traceId,
        question: qNorm,
        language,
        rich,
        intent,
        queryPlan,
        result: out,
        toolOutcomes,
        forcedFlags: {
          forceCostOverview,
          forceCostDepartmentPeriod,
          forceFinanceResultByLnMonth,
          forceEventsCountByDay,
          forcePersonnelSearch,
          forceVehicleAssignmentsByPlate,
          forceWorkerServicesCount,
          forceAuditsCount,
          forceFinquesCount,
          forceFirestoreCatalog
        },
        durationMs: Date.now() - startedAt
      });
      cacheSet(ck, {
        model: out.model,
        answer: out.answer,
        report: out.report,
        toolCallsUsed: out.toolCallsUsed,
        toolChoiceSource: out.toolChoiceSource,
        executionPolicy: out.executionPolicy
      });
      return out;
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const name = tc.function?.name;
        let args = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = { __invalidArgsJson: true };
        }
        if (name === "costs_by_department_period") {
          const fallbackSlots = extractCostDepartmentPeriodSlots(qNorm);
          if (fallbackSlots) {
            const dept = String(args?.departmentContains || "").trim();
            const per = String(args?.period || "").trim();
            args = {
              ...args,
              departmentContains: normalizeCostDepartmentContains(
                dept || fallbackSlots.departmentContains
              ),
              period: per || fallbackSlots.period
            };
            if (args.__invalidArgsJson) {
              delete args.__invalidArgsJson;
            }
          } else if (args?.departmentContains != null) {
            args = {
              ...args,
              departmentContains: normalizeCostDepartmentContains(args.departmentContains)
            };
          }
          // Guard rail explícit: subministraments sempre a categoria de costos interns.
          if (/\bsubmin|sumin/.test(qNorm)) {
            args = {
              ...args,
              departmentContains: "subministr"
            };
          }
        }
        if (name === "finance_result_by_ln_month") {
          const ym = String(args?.yearMonth || "").trim();
          if (!ym) {
            const inferred = extractYearMonthFromQuestion(qNorm);
            if (inferred) args = { ...args, yearMonth: inferred };
          }
          const qn = qNorm
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase();
          if (!String(args?.lnContains || "").trim()) {
            if (/\bempresa\b/.test(qn)) args = { ...args, lnContains: "empresa" };
            else if (/\brestaurants?\b/.test(qn)) args = { ...args, lnContains: "restaurants" };
            else if (/\bcasaments?\b/.test(qn)) args = { ...args, lnContains: "casaments" };
            else if (/\bfires?|festivals?\b/.test(qn)) args = { ...args, lnContains: "fires" };
            else if (/\bprecuinats?|menjar preparat\b/.test(qn)) args = { ...args, lnContains: "precuinats" };
            else if (/\bfoodlovers?\b/.test(qn)) args = { ...args, lnContains: "LN0005" };
          }
        }
        if (name === "events_count_by_day" || name === "preventius_planned_count_by_day") {
          const d = String(args?.date || "").trim();
          if (!d) {
            const inferred = extractDateYmdFromQuestion(qNorm, currentYear);
            if (inferred) args = { ...args, date: inferred };
          }
        }
        if (name === "personnel_search") {
          const dep = String(args?.departmentContains || "").trim();
          if (!dep) {
            const inferred = extractDepartmentFromQuestion(qNorm);
            if (inferred) args = { ...args, departmentContains: inferred };
          }
        }
        if (name === "vehicle_assignments_count_by_plate") {
          const plate = String(args?.plate || "").trim();
          if (!plate) {
            const inferred = extractPlateFromQuestion(qNorm);
            if (inferred) args = { ...args, plate: inferred };
          }
        }
        if (name === "worker_services_count") {
          const wn = String(args?.workerName || "").trim();
          if (!wn) {
            const inferred = extractWorkerNameFromQuestion(question);
            if (inferred) args = { ...args, workerName: inferred };
          }
        }
        let raw;
        try {
          if (args.__invalidArgsJson) {
            throw new Error("Arguments JSON invàlids a la tool call.");
          }
          raw = await runTool(name, args);
        } catch (toolErr) {
          raw = {
            ok: false,
            toolError: true,
            tool: name,
            message: toolErr instanceof Error ? toolErr.message : String(toolErr)
          };
        }
        toolOutcomes.push(raw);
        if (name === "purchases_supplier_quarter_article_compare" && raw?.reportCalblay) {
          serverReportCalblay = raw.reportCalblay;
        }
        if (
          rich &&
          (name === "costs_imputation_overview" ||
            name === "costs_imputation_search" ||
            name === "costs_by_department_period")
        ) {
          const built = buildCostImputationReportCalblay(raw);
          if (built) serverReportCalblay = built;
        }
        const result = shrinkToolPayload(raw);
        if (result && typeof result === "object" && result.reportCalblay) {
          delete result.reportCalblay;
        }
        return { tc, result };
      })
    );
    for (const { tc, result } of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: JSON.stringify(result)
      });
    }
  }

  throw new Error("Tool loop exceeded maximum steps");
}
