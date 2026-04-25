/**
 * Política: en consultes de dades no es permet resposta "genèrica" sense eines.
 */
export function enforceDataBackedAnswerPolicy({ intent, toolCallsUsed, rawAnswer }) {
  const used = Number(toolCallsUsed || 0);
  const text = String(rawAnswer || "").trim();
  if (!intent?.requiresDataTools) return { allowed: true, answer: text };
  if (used > 0) return { allowed: true, answer: text };

  return {
    allowed: false,
    answer:
      "No puc respondre aquesta consulta amb qualitat sense consultar dades reals. " +
      "Reformula indicant col·lecció o context (centre, període, producte) i executaré consulta directa a Firestore/finances."
  };
}
