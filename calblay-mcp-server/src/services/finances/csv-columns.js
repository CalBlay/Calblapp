/**
 * Excel/SAP: espais → _; accents NFKD; caràcters estranys (UTF-8 mal llegit) → _.
 * Això fa coincidir "Nom proveïdor" amb nom_proveidor i suporta capçaleres amb �.
 */
export function normalizeHeaderKey(raw) {
  let s = String(raw || "").replace(/^\uFEFF/, "").trim();
  s = s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  s = s.replace(/\uFFFD/g, "_").replace(/\s+/g, "_");
  s = s.replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return s;
}

export function findHeaderIndexFuzzy(headersMap, predicate) {
  for (const [k, idx] of headersMap) {
    if (predicate(k)) return idx;
  }
  return undefined;
}

/** Mapa clau normalitzada → índex de columna (objecte pla per passar a les callbacks). */
export function keyMapFromHeadersMap(headersMap) {
  return Object.fromEntries(headersMap);
}

/**
 * Resol el nom de columna que envia l'usuari/model contra les claus reals del CSV.
 */
/** Àlies per al model / controller: dim1 = LN, dim2 = centre (mateixes columnes que al CSV SAP). */
export const PURCHASE_COLUMN_ALIAS_GROUPS = [
  ["ln", "dim1", "dimensio_1", "dimension_1", "linia_negoci", "linia_de_negoci", "linea_negocio"],
  ["dim2", "dimensio_2", "dimension_2", "centre", "centre_cost", "centre_de_cost", "centro"]
];

export function resolveColumnIndexFromKeyMap(keyMap, requested) {
  if (!requested || !keyMap) return undefined;
  const nk = normalizeHeaderKey(String(requested));
  if (keyMap[nk] !== undefined) return keyMap[nk];

  for (const group of PURCHASE_COLUMN_ALIAS_GROUPS) {
    if (!group.includes(nk)) continue;
    for (const alias of group) {
      if (keyMap[alias] !== undefined) return keyMap[alias];
    }
    const keys = Object.keys(keyMap);
    for (const alias of group) {
      const hit = keys.find((hk) => hk === alias || hk.includes(alias) || alias.includes(hk));
      if (hit !== undefined) return keyMap[hit];
    }
  }

  const keys = Object.keys(keyMap);
  const hits = keys.filter((hk) => hk === nk || hk.includes(nk) || nk.includes(hk));
  if (hits.length === 1) return keyMap[hits[0]];
  if (hits.length > 1) {
    const exact = hits.find((h) => h === nk);
    if (exact !== undefined) return keyMap[exact];
    hits.sort((a, b) => Math.abs(a.length - nk.length) - Math.abs(b.length - nk.length));
    return keyMap[hits[0]];
  }
  return undefined;
}
