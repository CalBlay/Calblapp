import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

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
  const traces = safeReadJsonlRows(tracesPath());
  const feedback = safeReadJsonlRows(feedbackPath());
  const feedbackByTraceId = buildFeedbackIndex(feedback);

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
      tracesPath: tracesPath(),
      feedbackPath: feedbackPath()
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
