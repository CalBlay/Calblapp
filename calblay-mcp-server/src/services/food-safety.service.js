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
    filters: [{ field: "alergeno.gluten", op: "equals", value: "NO" }],
    fields: ["code", "menus.ca", "menus.es", "alergeno.gluten", "consumption.vegan"],
    limit: Math.min(Math.max(Number(limit) || 25, 1), 80),
    scanLimit: 1500
  });

  const rows = (raw.rows || []).map((r) => ({
    code: r.code || r.id,
    nom: r?.["menus.ca"] || r?.["menus.es"] || null,
    gluten: r?.["alergeno.gluten"] || null,
    vegan: normalizeYesNo(r?.["consumption.vegan"])
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
      filter: "alergeno.gluten == NO",
      totalRows: rows.length
    }
  });
}
