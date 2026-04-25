export function buildDeterministicExecutionResult({
  metricId,
  executor,
  slotsUsed = {},
  raw = null,
  sourceOfTruth = null,
  aggregation = "",
  confidence = "medium"
} = {}) {
  return {
    ok: true,
    metricId: String(metricId || ""),
    executor: String(executor || ""),
    slotsUsed: slotsUsed && typeof slotsUsed === "object" ? slotsUsed : {},
    result: raw,
    calc_details: {
      aggregation: String(aggregation || ""),
      sourceOfTruth: sourceOfTruth && typeof sourceOfTruth === "object" ? sourceOfTruth : null,
      confidence: String(confidence || "medium")
    }
  };
}

