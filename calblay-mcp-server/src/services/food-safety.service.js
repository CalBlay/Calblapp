import { createQueryResult } from "../core/contracts/query-result.js";
import { queryCollectionForChat } from "./firestore.service.js";

function normalizeYesNo(v) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (s === "si" || s === "yes" || s === "true") return true;
  if (s === "no" || s === "false") return false;
  return null;
}

/**
 * Busca plats aptes per celíacs a la col·lecció de plats.
 */
export async function listCeliacSafeDishes({ limit = 25 } = {}) {
  const raw = await queryCollectionForChat({
    collection: "plats",
    filters: [{ field: "allergens.gluten", op: "equals", value: "NO" }],
    fields: ["code", "name.ca", "name.es", "allergens.gluten", "consumption.vegan", "menus"],
    limit: Math.min(Math.max(Number(limit) || 25, 1), 80),
    scanLimit: 1500
  });

  const rows = (raw.rows || []).map((r) => ({
    code: r.code || r.id,
    nom: r?.["name.ca"] || r?.["name.es"] || null,
    gluten: r?.["allergens.gluten"] || null,
    vegan: normalizeYesNo(r?.["consumption.vegan"]),
    menus: Array.isArray(r?.menus) ? r.menus : []
  }));

  return createQueryResult({
    domain: "food_safety",
    sourceSystem: "firestore",
    rows,
    joinRule: "none",
    confidence: "high",
    dataQualityFlags: [],
    meta: {
      collection: "plats",
      filter: "allergens.gluten == NO",
      totalRows: rows.length
    }
  });
}
