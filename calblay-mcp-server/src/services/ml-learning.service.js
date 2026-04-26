import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function enabled() {
  return String(process.env.ML_LEARNING_ENABLED || "1").toLowerCase() !== "0";
}

/**
 * Escriure traces/feedback també a Firestore (col·leccions mcp_ml_*).
 * - ML_LEARNING_USE_FIRESTORE=1|true|on → sí
 * - ML_LEARNING_USE_FIRESTORE=0|false|off → no
 * - Sense definir: sí si hi ha credencials Firebase Admin (mateixes que la resta del MCP);
 *   així Cloud Run amb FIREBASE_* crea la col·lecció sense pas manual d’env extra.
 */
export function isMlLearningFirestoreSinkEnabled() {
  const raw = String(process.env.ML_LEARNING_USE_FIRESTORE ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  const projectId = String(
    process.env.FIREBASE_PROJECT_ID || process.env.ID_PROJECTE_FIREBASE || ""
  ).trim();
  const clientEmail = String(
    process.env.FIREBASE_CLIENT_EMAIL || process.env.CORREU_ELECTRONIC_DE_CLIENT_DE_FIREBASE || ""
  ).trim();
  const privateKey = String(
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_CLAU || ""
  ).trim();
  return Boolean(projectId && clientEmail && privateKey);
}

function firestoreLearningEnabled() {
  return isMlLearningFirestoreSinkEnabled();
}

function tracesFirestoreCollection() {
  const c = String(process.env.ML_LEARNING_FIRESTORE_TRACES_COLLECTION || "mcp_ml_traces").trim();
  return c || "mcp_ml_traces";
}

function feedbackFirestoreCollection() {
  const c = String(process.env.ML_LEARNING_FIRESTORE_FEEDBACK_COLLECTION || "mcp_ml_feedback").trim();
  return c || "mcp_ml_feedback";
}

function stripUndefinedDeep(v) {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    return v.map(stripUndefinedDeep).filter((x) => x !== undefined);
  }
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined) continue;
    const x = stripUndefinedDeep(val);
    if (x === undefined) continue;
    o[k] = x;
  }
  return o;
}

function schedulePersistChatTraceToFirestore(payload) {
  if (!firestoreLearningEnabled()) return;
  const traceId = String(payload?.traceId || "");
  if (!traceId) return;
  setImmediate(() => {
    (async () => {
      try {
        const { getDb } = await import("./firestore.service.js");
        const { Timestamp } = await import("firebase-admin/firestore");
        const db = getDb();
        const atTs = payload.at ? Timestamp.fromDate(new Date(String(payload.at))) : Timestamp.now();
        const doc = stripUndefinedDeep({
          kind: payload.kind,
          traceId: payload.traceId,
          at: atTs,
          question: payload.question,
          language: payload.language,
          rich: payload.rich,
          intent: payload.intent,
          queryPlan: payload.queryPlan,
          result: payload.result,
          toolOutcomes: payload.toolOutcomes,
          forcedFlags: payload.forcedFlags,
          durationMs: payload.durationMs,
          storedAt: Timestamp.now()
        });
        await db.collection(tracesFirestoreCollection()).doc(traceId).set(doc);
      } catch (e) {
        console.error("[ml-learning] Firestore trace write failed:", e?.message || e);
      }
    })();
  });
}

function schedulePersistChatFeedbackToFirestore(payload) {
  if (!firestoreLearningEnabled()) return;
  const traceId = String(payload?.traceId || "");
  if (!traceId) return;
  setImmediate(() => {
    (async () => {
      try {
        const { getDb } = await import("./firestore.service.js");
        const { Timestamp } = await import("firebase-admin/firestore");
        const db = getDb();
        const atTs = payload.at ? Timestamp.fromDate(new Date(String(payload.at))) : Timestamp.now();
        const doc = stripUndefinedDeep({
          kind: payload.kind,
          traceId: payload.traceId,
          at: atTs,
          helpful: payload.helpful,
          correctedAnswer: payload.correctedAnswer,
          note: payload.note,
          tags: payload.tags,
          storedAt: Timestamp.now()
        });
        await db.collection(feedbackFirestoreCollection()).add(doc);
      } catch (e) {
        console.error("[ml-learning] Firestore feedback write failed:", e?.message || e);
      }
    })();
  });
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
  schedulePersistChatTraceToFirestore(payload);
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
  schedulePersistChatFeedbackToFirestore(payload);
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
    },
    firestore: {
      enabled: firestoreLearningEnabled(),
      tracesCollection: tracesFirestoreCollection(),
      feedbackCollection: feedbackFirestoreCollection()
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

