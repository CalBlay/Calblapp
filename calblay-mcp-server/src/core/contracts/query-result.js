/**
 * Contracte canònic per resultats de consulta, independent de la font.
 */
export function createQueryResult({
  domain,
  sourceSystem,
  rows = [],
  joinRule = "none",
  confidence = "medium",
  dataQualityFlags = [],
  meta = {}
} = {}) {
  return {
    ok: true,
    domain: String(domain || "unknown"),
    source_system: String(sourceSystem || "unknown"),
    join_rule: String(joinRule || "none"),
    confidence: normalizeConfidence(confidence),
    row_count: Array.isArray(rows) ? rows.length : 0,
    rows: Array.isArray(rows) ? rows : [],
    data_quality_flags: Array.isArray(dataQualityFlags) ? dataQualityFlags : [],
    meta: meta && typeof meta === "object" ? meta : {}
  };
}

export function createQueryError({
  domain,
  sourceSystem,
  message,
  code = "query_error",
  meta = {}
} = {}) {
  return {
    ok: false,
    domain: String(domain || "unknown"),
    source_system: String(sourceSystem || "unknown"),
    error: {
      code: String(code || "query_error"),
      message: String(message || "Unknown query error")
    },
    meta: meta && typeof meta === "object" ? meta : {}
  };
}

function normalizeConfidence(v) {
  const c = String(v || "medium").toLowerCase();
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}
