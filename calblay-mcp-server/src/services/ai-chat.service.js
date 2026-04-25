import axios from "axios";
import { buildCostImputationReportCalblay } from "./cost-imputation-report.js";
import { enforceDataBackedAnswerPolicy } from "../core/policies/answer-policy.js";
import { detectQueryIntent } from "../core/semantics/intent-router.js";
import { cacheGet, cacheKey, cacheSet } from "./ai-chat/cache.js";
import { getOpenAiConfig, MAX_TOOL_STEPS } from "./ai-chat/config.js";
import { normalizeReport, shrinkToolPayload, splitNarrativeAndReport } from "./ai-chat/helpers.js";
import { runTool } from "./ai-chat/run-tool.js";
import { buildChatSystemContent } from "./ai-chat/system-prompt.js";
import { buildTools } from "./ai-chat/tools.js";

/**
 * Xat amb OpenAI + function calling. La lògica auxiliar viu a `src/services/ai-chat/`.
 */
export async function chatWithTools({ question, language = "ca", rich = false }) {
  const { apiKey, model } = getOpenAiConfig();
  const tools = buildTools();
  /** sense prou tokens, les tool_calls es truncuen i el bucle falla (errors 500 opacs en producció). */
  const envMax = Number(process.env.OPENAI_MAX_TOKENS || 1200);
  const baseMax = Math.min(4096, Math.max(1024, Number.isFinite(envMax) ? envMax : 1200));
  const maxTokens = rich ? Math.min(4096, baseMax + 512) : baseMax;

  const qNorm = question.trim();
  const intent = detectQueryIntent(qNorm);
  const currentYear = new Date().getFullYear();
  const { systemContent, forceCostOverview, forceCostDepartmentPeriod, forceFirestoreCatalog } = buildChatSystemContent({
    qNorm,
    rich,
    currentYear
  });
  const ck = cacheKey(model, language, qNorm, rich);
  const cached = cacheGet(ck);
  if (cached) {
    const bypassCachedNoTools = forceFirestoreCatalog && Number(cached.toolCallsUsed || 0) === 0;
    if (!bypassCachedNoTools) {
      return { ...cached, cached: true };
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

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const anyToolMessageYet = messages.some((m) => m.role === "tool");
    const toolChoice =
      forceCostDepartmentPeriod && !anyToolMessageYet
        ? { type: "function", function: { name: "costs_by_department_period" } }
        : forceCostOverview && !anyToolMessageYet
        ? { type: "function", function: { name: "costs_imputation_overview" } }
        : forceFirestoreCatalog && !anyToolMessageYet
          ? { type: "function", function: { name: "firestore_collections_catalog" } }
        : "auto";

    const response = await axios.post(
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
        rawAnswer: narrative
      });
      narrative = policy.answer;
      if (rich && serverReportCalblay) {
        report = normalizeReport(serverReportCalblay);
      }
      const out = {
        model,
        answer: narrative,
        report,
        toolCallsUsed: messages.filter((m) => m.role === "tool").length,
        cached: false
      };
      cacheSet(ck, {
        model: out.model,
        answer: out.answer,
        report: out.report,
        toolCallsUsed: out.toolCallsUsed
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
          args = {};
        }
        let raw;
        try {
          raw = await runTool(name, args);
        } catch (toolErr) {
          raw = {
            ok: false,
            toolError: true,
            tool: name,
            message: toolErr instanceof Error ? toolErr.message : String(toolErr)
          };
        }
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
