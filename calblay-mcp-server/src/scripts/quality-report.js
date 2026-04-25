import { getControlledEvolutionChecklist, runDodChecks } from "../services/quality-gates.service.js";
import { getGoldenDriftStats, getToolChoiceSourceStats } from "../services/ml-learning.service.js";

function parseNumberEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
}

async function main() {
  const dod = await runDodChecks();
  const evo = await getControlledEvolutionChecklist();
  const statsLimit = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_PLANNER_STATS_LIMIT", 200)));
  const plannerMinPercent = Math.max(0, Math.min(100, parseNumberEnv("QUALITY_PLANNER_MIN_PERCENT", 15)));
  const plannerAlertEnabled =
    String(process.env.QUALITY_PLANNER_ALERT_ENABLED || "").trim() !== ""
      ? String(process.env.QUALITY_PLANNER_ALERT_ENABLED).toLowerCase() !== "0"
      : String(process.env.QUERY_PLANNER_TOOL_CHOICE || "0").trim() === "1";
  const driftTraceLimit = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_TRACE_LIMIT", 300)));
  const driftMaxPercent = Math.max(0, Math.min(100, parseNumberEnv("QUALITY_DRIFT_MAX_MISMATCH_PERCENT", 0)));
  const driftMinMatched = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_MIN_MATCHED", 1)));
  const toolChoiceStats = getToolChoiceSourceStats({ limit: statsLimit });
  const goldenDrift = getGoldenDriftStats({ traceLimit: driftTraceLimit });
  const plannerSharePct = Number(toolChoiceStats?.percentages?.planner || 0);
  const plannerAdoptionAlert = {
    enabled: plannerAlertEnabled,
    minPercent: plannerMinPercent,
    ok: !plannerAlertEnabled || plannerSharePct >= plannerMinPercent,
    observedPercent: plannerSharePct,
    evaluatedOver: Number(toolChoiceStats?.total || 0),
    reason:
      plannerAlertEnabled && plannerSharePct < plannerMinPercent
        ? "Planner usage share is below threshold."
        : ""
  };
  const driftAlert = {
    enabled: true,
    traceLimit: driftTraceLimit,
    minMatched: driftMinMatched,
    maxMismatchPercent: driftMaxPercent,
    matchedGoldenTraces: Number(goldenDrift?.matchedGoldenTraces || 0),
    observedMismatchPercent: Number(goldenDrift?.mismatchRate || 0),
    ok:
      goldenDrift?.ok === true ||
      Number(goldenDrift?.matchedGoldenTraces || 0) < driftMinMatched ||
      Number(goldenDrift?.mismatchRate || 0) <= driftMaxPercent,
    reason:
      goldenDrift?.ok === true
        ? ""
        : Number(goldenDrift?.matchedGoldenTraces || 0) < driftMinMatched
          ? "Not enough overlapping traces to evaluate drift threshold."
          : "Golden drift mismatch percentage is above threshold."
  };
  const report = {
    generatedAt: new Date().toISOString(),
    dod,
    evolution: evo,
    toolChoiceStats,
    goldenDrift,
    alerts: {
      plannerAdoption: plannerAdoptionAlert,
      goldenDrift: driftAlert
    }
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[quality-report] failed", e);
  process.exit(1);
});

