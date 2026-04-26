import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

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

function outputDir() {
  return path.join(baseDir(), "datasets");
}

function safeReadJsonlRows(filePath) {
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

function normalizeText(v) {
  return String(v || "").trim();
}

function firestoreValueToPlain(v) {
  if (v == null) return v;
  if (typeof v !== "object") return v;
  if (typeof v.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return v.map(firestoreValueToPlain);
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    o[k] = firestoreValueToPlain(val);
  }
  return o;
}

function tracesFirestoreCollection() {
  const c = String(process.env.ML_LEARNING_FIRESTORE_TRACES_COLLECTION || "mcp_ml_traces").trim();
  return c || "mcp_ml_traces";
}

function feedbackFirestoreCollection() {
  const c = String(process.env.ML_LEARNING_FIRESTORE_FEEDBACK_COLLECTION || "mcp_ml_feedback").trim();
  return c || "mcp_ml_feedback";
}

async function loadFromFirestore() {
  const { getDb } = await import("../services/firestore.service.js");
  const db = getDb();
  const limit = Math.max(1, Math.min(50_000, Number(process.env.ML_LEARNING_ETL_FIRESTORE_LIMIT) || 10_000));

  const tracesSnap = await db
    .collection(tracesFirestoreCollection())
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  const traces = [];
  tracesSnap.forEach((doc) => {
    const plain = firestoreValueToPlain(doc.data());
    plain.traceId = normalizeText(plain.traceId) || doc.id;
    traces.push(plain);
  });

  const feedbackSnap = await db
    .collection(feedbackFirestoreCollection())
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  const feedbackRows = [];
  feedbackSnap.forEach((doc) => {
    const plain = firestoreValueToPlain(doc.data());
    feedbackRows.push(plain);
  });

  return { traces, feedbackRows };
}

function mergeTracesByTraceId(primary, secondary) {
  const m = new Map();
  for (const t of [...primary, ...secondary]) {
    const id = normalizeText(t?.traceId);
    if (!id) continue;
    const prev = m.get(id);
    if (!prev) {
      m.set(id, t);
      continue;
    }
    const pa = Date.parse(String(prev?.at || "")) || 0;
    const ca = Date.parse(String(t?.at || "")) || 0;
    if (ca >= pa) m.set(id, t);
  }
  return [...m.values()];
}

function ensureOutputDir() {
  const d = outputDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function buildFeedbackIndex(rows) {
  const byTraceId = new Map();
  for (const row of rows) {
    const traceId = normalizeText(row?.traceId);
    if (!traceId) continue;
    const prev = byTraceId.get(traceId);
    if (!prev) {
      byTraceId.set(traceId, row);
      continue;
    }
    const prevAt = Date.parse(String(prev?.at || "")) || 0;
    const curAt = Date.parse(String(row?.at || "")) || 0;
    if (curAt >= prevAt) byTraceId.set(traceId, row);
  }
  return byTraceId;
}

function buildDatasetRow(trace, feedbackRow) {
  const traceId = normalizeText(trace?.traceId);
  const question = normalizeText(trace?.question);
  const answer = normalizeText(trace?.result?.answer);
  const correctedAnswer = normalizeText(feedbackRow?.correctedAnswer);
  const tags = Array.isArray(feedbackRow?.tags) ? feedbackRow.tags.map((t) => String(t)) : [];

  return {
    traceId,
    at: String(trace?.at || ""),
    language: normalizeText(trace?.language || "ca"),
    question,
    answer,
    correctedAnswer,
    trainingTarget: correctedAnswer || answer,
    helpful: typeof feedbackRow?.helpful === "boolean" ? feedbackRow.helpful : null,
    note: normalizeText(feedbackRow?.note),
    tags,
    toolChoiceSource: normalizeText(trace?.result?.toolChoiceSource || "auto"),
    model: normalizeText(trace?.result?.model),
    durationMs: Number.isFinite(Number(trace?.durationMs)) ? Number(trace.durationMs) : null,
    queryPlan: trace?.queryPlan || null,
    intent: trace?.intent || null,
    forcedFlags: trace?.forcedFlags || {},
    toolCallsUsed: Number(trace?.result?.toolCallsUsed || 0),
    hasFeedback: Boolean(feedbackRow)
  };
}

function summarize(rows) {
  const out = {
    totalRows: rows.length,
    withFeedback: 0,
    helpfulTrue: 0,
    helpfulFalse: 0,
    byToolChoiceSource: {}
  };
  for (const r of rows) {
    if (r.hasFeedback) out.withFeedback += 1;
    if (r.helpful === true) out.helpfulTrue += 1;
    if (r.helpful === false) out.helpfulFalse += 1;
    const key = normalizeText(r.toolChoiceSource || "auto");
    out.byToolChoiceSource[key] = (out.byToolChoiceSource[key] || 0) + 1;
  }
  return out;
}

async function main() {
  const source = String(process.env.ML_LEARNING_ETL_SOURCE || "file").toLowerCase();
  const merge = String(process.env.ML_LEARNING_ETL_MERGE || "").toLowerCase() === "1";

  let traces = [];
  let feedbackRows = [];

  if (source === "firestore" || merge) {
    const fromFs = await loadFromFirestore();
    traces = fromFs.traces;
    feedbackRows = fromFs.feedbackRows;
  }

  if (source === "file" || merge) {
    const fileTraces = safeReadJsonlRows(tracesPath());
    const fileFeedback = safeReadJsonlRows(feedbackPath());
    if (merge) {
      traces = mergeTracesByTraceId(traces, fileTraces);
      feedbackRows = [...feedbackRows, ...fileFeedback];
    } else if (source === "file") {
      traces = fileTraces;
      feedbackRows = fileFeedback;
    }
  }

  const feedbackByTraceId = buildFeedbackIndex(feedbackRows);

  const dataset = [];
  for (const trace of traces) {
    const traceId = normalizeText(trace?.traceId);
    if (!traceId) continue;
    const row = buildDatasetRow(trace, feedbackByTraceId.get(traceId) || null);
    dataset.push(row);
  }

  const outDir = ensureOutputDir();
  const datasetPath = path.join(outDir, "training-dataset.jsonl");
  const summaryPath = path.join(outDir, "training-dataset-summary.json");

  const datasetJsonl = dataset.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(datasetPath, `${datasetJsonl}${datasetJsonl ? "\n" : ""}`, "utf8");

  const summary = {
    generatedAt: new Date().toISOString(),
    source: {
      mode: merge ? "merge" : source,
      tracesPath: tracesPath(),
      feedbackPath: feedbackPath(),
      firestore:
        source === "firestore" || merge
          ? {
              tracesCollection: tracesFirestoreCollection(),
              feedbackCollection: feedbackFirestoreCollection(),
              limit: Math.max(1, Math.min(50_000, Number(process.env.ML_LEARNING_ETL_FIRESTORE_LIMIT) || 10_000))
            }
          : null
    },
    output: {
      datasetPath,
      summaryPath
    },
    stats: summarize(dataset)
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[ml-learning-etl] failed", e);
  process.exit(1);
});
