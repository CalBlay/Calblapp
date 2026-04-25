import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function enabled() {
  return String(process.env.ML_LEARNING_ENABLED || "1").toLowerCase() !== "0";
}

function baseDir() {
  const fromEnv = String(process.env.ML_LEARNING_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "data", "ml-learning");
}

function tracesPath() {
  return path.join(baseDir(), "chat-traces.jsonl");
}

function feedbackPath() {
  return path.join(baseDir(), "chat-feedback.jsonl");
}

function ensureDir() {
  const d = baseDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function appendJsonl(filePath, payload) {
  ensureDir();
  const line = `${JSON.stringify(payload)}\n`;
  fs.appendFileSync(filePath, line, "utf8");
}

function readJsonlCount(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return 0;
    return raw.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function readJsonlRows(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((row) => row && typeof row === "object");
  } catch {
    return [];
  }
}

function readGoldenCases() {
  try {
    const fullPath = path.join(projectRoot, "config", "golden_business_cases.json");
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    const cases = Array.isArray(parsed?.cases) ? parsed.cases : [];
    return {
      ok: true,
      path: fullPath,
      version: String(parsed?.version || "v1"),
      updatedAt: parsed?.updatedAt || null,
      cases
    };
  } catch (error) {
    return {
      ok: false,
      path: path.join(projectRoot, "config", "golden_business_cases.json"),
      error: error instanceof Error ? error.message : String(error),
      cases: []
    };
  }
}

function normalizeQuestion(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function createChatTraceId() {
  return crypto.randomUUID();
}

export function logChatTrace({
  traceId,
  question,
  language,
  rich,
  intent,
  queryPlan = null,
  result,
  toolOutcomes = [],
  forcedFlags = {},
  durationMs = null
} = {}) {
  if (!enabled()) return { enabled: false };
  const payload = {
    kind: "chat_trace",
    at: new Date().toISOString(),
    traceId: String(traceId || createChatTraceId()),
    question: String(question || ""),
    language: String(language || "ca"),
    rich: Boolean(rich),
    intent: intent || null,
    queryPlan: queryPlan && typeof queryPlan === "object" ? queryPlan : null,
    result: {
      model: result?.model || null,
      answer: result?.answer || "",
      report: result?.report || null,
      toolCallsUsed: Number(result?.toolCallsUsed || 0),
      cached: Boolean(result?.cached),
      toolChoiceSource: String(result?.toolChoiceSource || "auto")
    },
    toolOutcomes: Array.isArray(toolOutcomes) ? toolOutcomes : [],
    forcedFlags: forcedFlags && typeof forcedFlags === "object" ? forcedFlags : {},
    durationMs: Number.isFinite(durationMs) ? durationMs : null
  };
  appendJsonl(tracesPath(), payload);
  return { enabled: true, traceId: payload.traceId };
}

export function logChatFeedback({
  traceId,
  helpful,
  correctedAnswer = "",
  note = "",
  tags = []
} = {}) {
  if (!enabled()) return { enabled: false };
  const payload = {
    kind: "chat_feedback",
    at: new Date().toISOString(),
    traceId: String(traceId || ""),
    helpful: typeof helpful === "boolean" ? helpful : null,
    correctedAnswer: String(correctedAnswer || ""),
    note: String(note || ""),
    tags: Array.isArray(tags) ? tags.map((t) => String(t)) : []
  };
  appendJsonl(feedbackPath(), payload);
  return { enabled: true, traceId: payload.traceId };
}

export function getMlLearningStatus() {
  return {
    enabled: enabled(),
    dir: baseDir(),
    files: {
      traces: tracesPath(),
      feedback: feedbackPath()
    },
    counts: {
      traces: readJsonlCount(tracesPath()),
      feedback: readJsonlCount(feedbackPath())
    }
  };
}

export function getToolChoiceSourceStats({ limit = 200 } = {}) {
  const cap = Math.max(1, Math.min(5000, Number(limit) || 200));
  const rows = readJsonlRows(tracesPath());
  const recent = rows.slice(-cap);
  const counts = {
    legacy_forced: 0,
    planner: 0,
    auto: 0,
    deterministic_executor: 0,
    deterministic_executor_blocked: 0,
    other: 0
  };
  for (const row of recent) {
    const source = String(row?.result?.toolChoiceSource || "auto");
    if (
      source === "legacy_forced" ||
      source === "planner" ||
      source === "auto" ||
      source === "deterministic_executor" ||
      source === "deterministic_executor_blocked"
    )
      counts[source] += 1;
    else counts.other += 1;
  }
  const total = recent.length || 0;
  const toPct = (n) => (total > 0 ? Number(((n / total) * 100).toFixed(2)) : 0);
  return {
    enabled: enabled(),
    limit: cap,
    total,
    counts,
    percentages: {
      legacy_forced: toPct(counts.legacy_forced),
      planner: toPct(counts.planner),
      auto: toPct(counts.auto),
      deterministic_executor: toPct(counts.deterministic_executor),
      deterministic_executor_blocked: toPct(counts.deterministic_executor_blocked),
      other: toPct(counts.other)
    }
  };
}

export function getGoldenDriftStats({ traceLimit = 200 } = {}) {
  const cap = Math.max(1, Math.min(5000, Number(traceLimit) || 200));
  const traces = readJsonlRows(tracesPath()).slice(-cap);
  const golden = readGoldenCases();
  if (!golden.ok) {
    return {
      enabled: enabled(),
      ok: false,
      reason: "golden_cases_unavailable",
      error: golden.error,
      traceLimit: cap,
      tracesScanned: traces.length,
      matchedGoldenTraces: 0
    };
  }

  const goldenByQuestion = new Map();
  for (const c of golden.cases) {
    const key = normalizeQuestion(c?.question);
    if (!key) continue;
    goldenByQuestion.set(key, c);
  }

  const mismatches = [];
  let matched = 0;
  for (const t of traces) {
    const key = normalizeQuestion(t?.question);
    if (!key || !goldenByQuestion.has(key)) continue;
    matched += 1;
    const goldenCase = goldenByQuestion.get(key);
    const expectedMetricId = String(goldenCase?.expected?.metricId || "");
    const actualMetricId = String(t?.queryPlan?.metricId || "");
    if (expectedMetricId && actualMetricId && expectedMetricId !== actualMetricId) {
      mismatches.push({
        traceId: String(t?.traceId || ""),
        question: String(t?.question || ""),
        type: "metricId",
        expected: expectedMetricId,
        actual: actualMetricId
      });
      continue;
    }

    const expectedPolicySystem = String(goldenCase?.expected?.policySystem || "");
    if (expectedPolicySystem === "csv_finances") {
      const sourceOfTruthSystem = String(t?.result?.report?.calc_details?.sourceOfTruth?.system || "");
      if (sourceOfTruthSystem && sourceOfTruthSystem !== "csv_finances") {
        mismatches.push({
          traceId: String(t?.traceId || ""),
          question: String(t?.question || ""),
          type: "source_system",
          expected: "csv_finances",
          actual: sourceOfTruthSystem
        });
      }
    }
  }

  const mismatchCount = mismatches.length;
  const mismatchRate = matched > 0 ? Number(((mismatchCount / matched) * 100).toFixed(2)) : 0;
  return {
    enabled: enabled(),
    ok: mismatchCount === 0,
    reason: matched === 0 ? "no_overlapping_traces" : "",
    golden: {
      path: golden.path,
      version: golden.version,
      updatedAt: golden.updatedAt
    },
    traceLimit: cap,
    tracesScanned: traces.length,
    matchedGoldenTraces: matched,
    mismatchCount,
    mismatchRate,
    mismatches: mismatches.slice(0, 50)
  };
}

