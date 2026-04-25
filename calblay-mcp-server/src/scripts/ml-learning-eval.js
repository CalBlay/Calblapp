import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQueryPlan } from "../services/query-planner.service.js";

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
  return path.join(baseDir(), "datasets", "training-eval-summary.json");
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

function normalize(v) {
  return String(v || "").trim();
}

function toPct(n, d) {
  return d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0;
}

function parseNumberEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
}

function parseDateEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function filterRowsForEval(rows) {
  const fromTs = parseDateEnv("LEARNING_EVAL_FROM");
  const limit = Math.max(1, Math.min(100000, parseNumberEnv("LEARNING_EVAL_LIMIT", rows.length || 1)));
  let selected = Array.isArray(rows) ? [...rows] : [];
  if (fromTs != null) {
    selected = selected.filter((r) => {
      const ts = Date.parse(String(r?.at || ""));
      return Number.isFinite(ts) && ts >= fromTs;
    });
  }
  if (selected.length > limit) selected = selected.slice(-limit);
  return { selected, fromTs, limit };
}

function slotMatchForMetric(metricId, expectedSlots, predictedSlots) {
  const checksByMetric = {
    cost_subministraments_month: ["departmentContains", "period"],
    personnel_count_by_department: ["department", "departmentContains"],
    preventius_planned_count_day: ["date"],
    vehicle_assignments_count_by_plate: ["plate"],
    worker_services_count: ["workerName"]
  };
  const keys = checksByMetric[metricId] || [];
  if (!keys.length) return { comparable: false, matches: 0, total: 0 };
  let total = 0;
  let matches = 0;
  for (const k of keys) {
    const exp = normalize(expectedSlots?.[k]);
    if (!exp) continue;
    total += 1;
    const got = normalize(predictedSlots?.[k]);
    if (exp === got) matches += 1;
  }
  return {
    comparable: total > 0,
    matches,
    total
  };
}

async function main() {
  const rows = safeReadJsonlRows(datasetPath());
  const { selected, fromTs, limit } = filterRowsForEval(rows);
  const total = selected.length;
  let metricComparable = 0;
  let metricExactMatch = 0;
  let upgradedFromUnknown = 0;
  let slotComparableRows = 0;
  let slotPerfectRows = 0;
  let slotComparedFields = 0;
  let slotMatchedFields = 0;

  const mismatches = [];
  for (const row of selected) {
    const question = normalize(row?.question);
    if (!question) continue;
    const expectedPlan = row?.queryPlan && typeof row.queryPlan === "object" ? row.queryPlan : null;
    const predictedPlan = buildQueryPlan({ question, currentYear: new Date().getFullYear() });
    const expectedMetric = normalize(expectedPlan?.metricId);
    const predictedMetric = normalize(predictedPlan?.metricId);

    if (expectedMetric) {
      metricComparable += 1;
      if (expectedMetric === predictedMetric) metricExactMatch += 1;
      else if (expectedMetric === "unknown" && predictedMetric && predictedMetric !== "unknown") {
        upgradedFromUnknown += 1;
      }
    }

    const slotEval = slotMatchForMetric(expectedMetric, expectedPlan?.slots || {}, predictedPlan?.slots || {});
    if (slotEval.comparable) {
      slotComparableRows += 1;
      slotComparedFields += slotEval.total;
      slotMatchedFields += slotEval.matches;
      if (slotEval.matches === slotEval.total) slotPerfectRows += 1;
    }

    if (
      expectedMetric &&
      expectedMetric !== predictedMetric &&
      !(expectedMetric === "unknown" && predictedMetric && predictedMetric !== "unknown") &&
      mismatches.length < 50
    ) {
      mismatches.push({
        traceId: normalize(row?.traceId),
        question,
        expectedMetricId: expectedMetric,
        predictedMetricId: predictedMetric
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: {
      datasetPath: datasetPath(),
      totalRows: rows.length,
      evaluatedRows: total,
      filters: {
        from: fromTs != null ? new Date(fromTs).toISOString() : null,
        limit
      }
    },
    metrics: {
      metricId: {
        comparableRows: metricComparable,
        exactMatches: metricExactMatch,
        exactMatchPercent: toPct(metricExactMatch, metricComparable),
        upgradedFromUnknownCount: upgradedFromUnknown,
        effectiveCoveragePercent: toPct(metricExactMatch + upgradedFromUnknown, metricComparable)
      },
      slots: {
        comparableRows: slotComparableRows,
        perfectRows: slotPerfectRows,
        perfectRowPercent: toPct(slotPerfectRows, slotComparableRows),
        comparedFields: slotComparedFields,
        matchedFields: slotMatchedFields,
        fieldMatchPercent: toPct(slotMatchedFields, slotComparedFields)
      }
    },
    samples: {
      metricMismatches: mismatches
    }
  };

  fs.writeFileSync(outputPath(), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[ml-learning-eval] failed", e);
  process.exit(1);
});
