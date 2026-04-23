import { createHash } from "node:crypto";
import axios from "axios";
import { countEventsInYear } from "./webapp.service.js";
import {
  getPurchasesBySupplier,
  getPurchasesSupplierYearSummary,
  listFinanceCsvFiles,
  previewFinanceCsv
} from "./finances.service.js";

/** Model econòmic per defecte (pots sobreescriure amb OPENAI_MODEL). */
function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return { apiKey, model };
}

const TOOL_RESULT_MAX_CHARS = Number(process.env.OPENAI_TOOL_RESULT_MAX_CHARS || 9000);
const CHAT_CACHE_TTL_MS = Number(process.env.OPENAI_CHAT_CACHE_TTL_MS || 120_000);
const CHAT_CACHE_MAX_KEYS = Number(process.env.OPENAI_CHAT_CACHE_MAX_KEYS || 200);
const MAX_TOOL_STEPS = Number(process.env.OPENAI_MAX_TOOL_STEPS || 3);

const responseCache = new Map();

function cacheKey(model, language, question, rich) {
  const q = question.trim().toLowerCase();
  return createHash("sha256")
    .update(`${model}|${language}|${rich ? "1" : "0"}|${q}`)
    .digest("hex");
}

const CALBLAY_JSON_MARKER = "```calblay-json";

function normalizeReport(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  const safeTables = tables.slice(0, 5).map((t) => ({
    title: String(t.title || "Taula"),
    columns: Array.isArray(t.columns) ? t.columns.map(String) : [],
    rows: Array.isArray(t.rows)
      ? t.rows.slice(0, 60).map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : []))
      : []
  }));
  let chart = null;
  if (
    raw.chart &&
    typeof raw.chart === "object" &&
    Array.isArray(raw.chart.data) &&
    raw.chart.data.length
  ) {
    const rows = raw.chart.data
      .slice(0, 24)
      .map((row) => (typeof row === "object" && row !== null ? row : { value: row }));
    chart = {
      type: raw.chart.type === "line" ? "line" : "bar",
      title: String(raw.chart.title || ""),
      xKey: String(raw.chart.xKey || "label"),
      series: Array.isArray(raw.chart.series)
        ? raw.chart.series.slice(0, 4).map((s) => ({
            name: String(s.name || ""),
            dataKey: String(s.dataKey || "value"),
            color: typeof s.color === "string" ? s.color : undefined
          }))
        : [{ name: "Valor", dataKey: "value" }],
      data: rows
    };
  }
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.slice(0, 10).map(String)
    : [];
  return { tables: safeTables, chart, highlights };
}

function splitNarrativeAndReport(fullContent, rich) {
  const text = fullContent || "";
  if (!rich) {
    return { narrative: text.trim(), report: null };
  }
  const idx = text.lastIndexOf(CALBLAY_JSON_MARKER);
  if (idx === -1) {
    return { narrative: text.trim(), report: null };
  }
  const narrative = text.slice(0, idx).trim();
  const after = text.slice(idx + CALBLAY_JSON_MARKER.length);
  const endFence = after.indexOf("```");
  if (endFence === -1) {
    return { narrative: text.trim(), report: null };
  }
  try {
    const parsed = JSON.parse(after.slice(0, endFence).trim());
    return {
      narrative: (narrative || parsed.summary || "").trim(),
      report: normalizeReport(parsed)
    };
  } catch {
    return { narrative: text.trim(), report: null };
  }
}

function cacheGet(key) {
  if (CHAT_CACHE_TTL_MS <= 0) return null;
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload) {
  if (CHAT_CACHE_TTL_MS <= 0) return;
  while (responseCache.size >= CHAT_CACHE_MAX_KEYS) {
    const first = responseCache.keys().next().value;
    responseCache.delete(first);
  }
  responseCache.set(key, { exp: Date.now() + CHAT_CACHE_TTL_MS, payload });
}

function shrinkToolPayload(result) {
  if (result == null) return result;
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(result)
      : JSON.parse(JSON.stringify(result));

  if (clone.files && Array.isArray(clone.files) && clone.files.length > 40) {
    const total = clone.files.length;
    clone.files = clone.files.slice(0, 40);
    clone._truncatedFiles = total - 40;
  }
  if (clone.rows && Array.isArray(clone.rows) && clone.rows.length > 30) {
    const total = clone.rows.length;
    clone.rows = clone.rows.slice(0, 30);
    clone._truncatedRows = total - 30;
  }

  let s = JSON.stringify(clone);
  if (s.length > TOOL_RESULT_MAX_CHARS) {
    return {
      _truncated: true,
      preview: s.slice(0, TOOL_RESULT_MAX_CHARS),
      note: "Resultat tallat per reduir cost de tokens."
    };
  }
  return clone;
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "events_count_by_year",
        description: "Count calendar events in a year (cheap aggregate).",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 2000, maximum: 2100 }
          },
          required: ["year"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_list_files",
        description: "List finance CSV file names (only if user needs file names).",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_preview_file",
        description: "Preview top rows of one CSV. Keep rows small (<=12).",
        parameters: {
          type: "object",
          properties: {
            file: { type: "string" },
            rows: { type: "integer", minimum: 1, maximum: 15 }
          },
          required: ["file"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_by_supplier",
        description:
          "Sample lines only. For yearly totals use purchases_supplier_year_summary. Max ~20 lines.",
        parameters: {
          type: "object",
          properties: {
            supplierName: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 25 }
          },
          required: ["supplierName"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_supplier_year_summary",
        description:
          "CHEAPEST for purchase totals: one pass. Use supplierCode (e.g. P003004) when given.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 2000, maximum: 2100 },
            supplierCode: { type: "string" },
            supplierName: { type: "string" }
          },
          required: ["year"]
        }
      }
    }
  ];
}

async function runTool(toolName, args) {
  if (toolName === "events_count_by_year") {
    return countEventsInYear(Number(args?.year));
  }
  if (toolName === "finances_list_files") {
    const files = await listFinanceCsvFiles();
    return { count: files.length, files };
  }
  if (toolName === "finances_preview_file") {
    const rows = Math.min(15, Math.max(1, Number(args?.rows || 8)));
    return previewFinanceCsv(String(args?.file || ""), rows);
  }
  if (toolName === "purchases_by_supplier") {
    const lim = Math.min(25, Math.max(1, Number(args?.limit || 15)));
    return getPurchasesBySupplier(String(args?.supplierName || ""), lim);
  }
  if (toolName === "purchases_supplier_year_summary") {
    return getPurchasesSupplierYearSummary({
      year: Number(args?.year),
      supplierCode: args?.supplierCode ? String(args.supplierCode) : undefined,
      supplierName: args?.supplierName ? String(args.supplierName) : undefined
    });
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

export async function chatWithTools({ question, language = "ca", rich = false }) {
  const { apiKey, model } = getOpenAiConfig();
  const tools = buildTools();
  const baseMax = Math.min(800, Math.max(64, Number(process.env.OPENAI_MAX_TOKENS || 320)));
  const maxTokens = rich ? Math.min(900, baseMax + 320) : baseMax;

  const qNorm = question.trim();
  const ck = cacheKey(model, language, qNorm, rich);
  const cached = cacheGet(ck);
  if (cached) {
    return { ...cached, cached: true };
  }

  const systemBase =
    "Cal Blay. Tools = facts only. For yearly purchase quantity/amount: ALWAYS purchases_supplier_year_summary first. " +
    "For event counts: events_count_by_year. Avoid finances_preview unless necessary; use <=10 rows. " +
    "Reply in user language; use EUR for money.";

  const systemRich =
    systemBase +
    " For informe / resum financer / taula / gràfic / comparativa, or when tool data benefits a visual: " +
    "first a short executive narrative (max 6 sentences), then ONE fenced block " +
    CALBLAY_JSON_MARKER +
    " ... ``` containing ONE JSON object: { tables: [{title, columns, rows}], chart: null OR {type, title, xKey, series, data}, highlights: string[] }. " +
    "chart.type is bar or line; series items have name and dataKey; data rows are objects (e.g. {mes, import}). " +
    "Use ONLY numbers from tools; chart.data max 24 points; highlights 3-6 bullets; strictly valid JSON.";

  const messages = [
    {
      role: "system",
      content: rich ? systemRich : systemBase + " Max 4 short sentences."
    },
    {
      role: "user",
      content: `language=${language}\nquestion=${qNorm}`
    }
  ];

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages,
        tools,
        tool_choice: "auto",
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
      const { narrative, report } = splitNarrativeAndReport(rawContent, rich);
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
        const raw = await runTool(name, args);
        const result = shrinkToolPayload(raw);
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
