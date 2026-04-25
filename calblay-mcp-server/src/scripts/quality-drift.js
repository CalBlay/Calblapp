import { getGoldenDriftStats } from "../services/ml-learning.service.js";

function parseNumberEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
}

async function main() {
  const traceLimit = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_TRACE_LIMIT", 300)));
  const minMatched = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_MIN_MATCHED", 1)));
  const maxMismatchPercent = Math.max(
    0,
    Math.min(100, parseNumberEnv("QUALITY_DRIFT_MAX_MISMATCH_PERCENT", 0))
  );
  const drift = getGoldenDriftStats({ traceLimit });
  const matched = Number(drift?.matchedGoldenTraces || 0);
  const mismatchRate = Number(drift?.mismatchRate || 0);
  const thresholdEvaluated = matched >= minMatched;
  const ok = drift?.ok === true || !thresholdEvaluated || mismatchRate <= maxMismatchPercent;

  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      traceLimit,
      minMatched,
      maxMismatchPercent
    },
    thresholdEvaluated,
    ok,
    drift
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[quality-drift] failed", e);
  process.exit(1);
});
