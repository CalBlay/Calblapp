function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const DOMAIN_PATTERNS = [
  { domain: "food_safety", re: /\b(alergen|allergen|celiac|celiacs|gluten|intoleranc|ingredient)\b/ },
  { domain: "projects", re: /\b(projecte|projectes|project|milestone|tasca)\b/ },
  { domain: "maintenance", re: /\b(incidenc|ticket|manteniment|avaria)\b/ },
  { domain: "logistics", re: /\b(logistica|vehicle|transport|preparacio)\b/ },
  { domain: "operations", re: /\b(quadrant|personal|treballador|servei|event|esdeveniment)\b/ },
  { domain: "finance", re: /\b(vendes|compres|cost|marge|proveidor|factura|ingres)\b/ }
];

/**
 * Determina domini i estratègia de consulta.
 */
export function detectQueryIntent(question) {
  const q = normalizeText(question);
  const domainHit = DOMAIN_PATTERNS.find((p) => p.re.test(q));
  const domain = domainHit ? domainHit.domain : "unknown";

  const asksSpecificArticle = /\b(aigua|article|producte|plat)\b/.test(q);
  const asksMonth = /\b(gener|febrer|marc|abril|maig|juny|juliol|agost|setembre|octubre|novembre|desembre|\d{4}-\d{2})\b/.test(
    q
  );
  const asksCentre = /\b(nautic|mirador|masia|origens|camp nou|centre|restaurant)\b/.test(q);

  return {
    domain,
    requiresDataTools: domain !== "unknown",
    hints: {
      asksSpecificArticle,
      asksMonth,
      asksCentre
    }
  };
}
