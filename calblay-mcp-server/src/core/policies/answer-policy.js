/**
 * Política: en consultes de dades no es permet resposta "genèrica" sense eines.
 */
export function enforceDataBackedAnswerPolicy({ intent, toolCallsUsed, toolOutcomes = [], rawAnswer }) {
  const used = Number(toolCallsUsed || 0);
  const text = String(rawAnswer || "").trim();
  if (!intent?.requiresDataTools) return { allowed: true, answer: text };

  const outcomes = Array.isArray(toolOutcomes) ? toolOutcomes : [];
  const hasUsefulOutcome = outcomes.some((o) => {
    if (!o || typeof o !== "object") return false;
    if (o.ok === false) return false;
    if (o.toolError) return false;
    const keys = ["rows", "top", "byMonth", "byCentre", "comparison", "articles", "kpis", "byLn", "finques"];
    const hasNonEmptyArray = keys.some((k) => Array.isArray(o[k]) && o[k].length > 0);
    const hasPositiveCount =
      Number.isFinite(Number(o.count)) && Number(o.count) > 0
        ? true
        : Number.isFinite(Number(o.matchCount)) && Number(o.matchCount) > 0
          ? true
          : Number.isFinite(Number(o.totalCount)) && Number(o.totalCount) >= 0;
    const hasNumericTotal = Number.isFinite(Number(o.totalAmount)) || Number.isFinite(Number(o.total));
    return hasNonEmptyArray || hasPositiveCount || hasNumericTotal;
  });
  if (used > 0 && hasUsefulOutcome) return { allowed: true, answer: text };

  return {
    allowed: false,
    answer:
      "No puc respondre aquesta consulta amb qualitat perquè no tinc cap resultat de dades vàlid per fonamentar la resposta. " +
      "Indica context (centre, període, producte/proveïdor) i ho recalculo amb consulta directa a Firestore/finances."
  };
}
