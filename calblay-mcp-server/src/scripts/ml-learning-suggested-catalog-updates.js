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

function datasetPath() {
  return path.join(baseDir(), "datasets", "training-dataset.jsonl");
}

function outputPath() {
  return path.join(baseDir(), "datasets", "suggested-catalog-updates.json");
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

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function tokenizeQuestion(question) {
  return normalize(question)
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));
}

function topTokens(rows, max = 12) {
  const counts = new Map();
  for (const row of rows) {
    const toks = tokenizeQuestion(row?.question);
    for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token, count]) => ({ token, count }));
}

function buildSuggestions(dataset) {
  const unknownOrMiss = dataset.filter(
    (r) => normalize(r?.queryPlan?.metricId) === "unknown" || normalize(r?.queryPlan?.status) === "catalog_miss"
  );
  const ambiguous = dataset.filter((r) => normalize(r?.queryPlan?.status) === "ambiguous");
  const blocked = dataset.filter((r) => normalize(r?.toolChoiceSource) === "deterministic_executor_blocked");

  const byMetric = new Map();
  for (const row of ambiguous) {
    const metricId = normalize(row?.queryPlan?.metricId);
    if (!metricId || metricId === "unknown") continue;
    if (!byMetric.has(metricId)) byMetric.set(metricId, []);
    byMetric.get(metricId).push(row);
  }

  const suggestions = [];

  if (unknownOrMiss.length > 0) {
    suggestions.push({
      type: "new_alias_candidates",
      priority: "high",
      reason: "Questions unresolved by catalog (metricId=unknown/catalog_miss).",
      affectedRows: unknownOrMiss.length,
      tokenHints: topTokens(unknownOrMiss),
      examples: unknownOrMiss.slice(0, 10).map((r) => ({
        traceId: String(r?.traceId || ""),
        question: String(r?.question || "")
      })),
      action: "Review token hints and map to existing metric synonyms or add new metric candidates."
    });
  }

  for (const [metricId, rows] of byMetric.entries()) {
    suggestions.push({
      type: "slot_extraction_improvement",
      priority: rows.length >= 3 ? "high" : "medium",
      metricId,
      reason: "Ambiguous planner outputs for known metric; likely slot extraction gaps.",
      affectedRows: rows.length,
      tokenHints: topTokens(rows),
      examples: rows.slice(0, 8).map((r) => ({
        traceId: String(r?.traceId || ""),
        question: String(r?.question || ""),
        slotsSeen: r?.queryPlan?.slots || {}
      })),
      action: "Add slot aliases/regex patterns in helper extractors for this metric."
    });
  }

  if (blocked.length > 0) {
    suggestions.push({
      type: "deterministic_blocked_review",
      priority: "high",
      reason: "Deterministic executor blocked fallback in strict mode.",
      affectedRows: blocked.length,
      tokenHints: topTokens(blocked),
      examples: blocked.slice(0, 10).map((r) => ({
        traceId: String(r?.traceId || ""),
        question: String(r?.question || ""),
        metricId: String(r?.queryPlan?.metricId || ""),
        slotsSeen: r?.queryPlan?.slots || {}
      })),
      action: "Investigate missing required slots and improve planner/slot completion."
    });
  }

  return suggestions;
}

async function main() {
  const dataset = readJsonlRows(datasetPath());
  const suggestions = buildSuggestions(dataset);
  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      datasetPath: datasetPath(),
      totalRows: dataset.length
    },
    policy: {
      autoMerge: false,
      note: "Suggestions only. Manual review required before catalog changes."
    },
    summary: {
      totalSuggestions: suggestions.length
    },
    suggestions
  };
  fs.writeFileSync(outputPath(), `${JSON.stringify(out, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[ml-learning-suggested-catalog-updates] failed", e);
  process.exit(1);
});
