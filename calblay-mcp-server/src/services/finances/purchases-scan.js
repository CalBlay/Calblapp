import readline from "node:readline";
import {
  findHeaderIndexFuzzy,
  keyMapFromHeadersMap,
  normalizeHeaderKey
} from "./csv-columns.js";
import {
  normalizeArticleNameCompact,
  normalizeArticleNameForMatch,
  parseAmountLike,
  stripCsvCell
} from "./csv-cells.js";
import { normalizeCsvLineDelimited } from "./csv-lines.js";
import { openPurchasesCsvStream } from "./purchases-io.js";

export function compareDateRange(dateStr, from, to) {
  const d = stripCsvCell(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return !(from || to);
  }
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function rowYearFromDate(dateStr) {
  const s = String(dateStr || "").trim().replace(/^"|"$/g, "");
  if (s.length >= 4 && s[4] === "-") {
    const y = Number(s.slice(0, 4));
    return Number.isFinite(y) ? y : null;
  }
  return null;
}

/** Retorna "YYYY-MM" si la data ve com a ISO o comença per YYYY-MM-DD. */
export function rowYearMonthFromDate(dateStr) {
  const s = String(dateStr || "").trim().replace(/^"|"$/g, "");
  if (s.length >= 7 && s[4] === "-" && s[6] !== undefined) {
    const ym = s.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) return ym;
  }
  return null;
}

function cellContainsHayNeedle(hay, needle) {
  const h = normalizeArticleNameForMatch(hay);
  const n = normalizeArticleNameForMatch(needle);
  if (n.length > 0 && h.includes(n)) return true;
  const hc = normalizeArticleNameCompact(hay);
  const nc = normalizeArticleNameCompact(needle);
  return nc.length >= 2 && hc.includes(nc);
}

function normalizeCellTight(v) {
  return stripCsvCell(v).toLowerCase().replace(/\s+/g, "");
}

/**
 * mode: contains | equals | starts_with | gte | lte (gte/lte amb parseAmountLike per import/quantitat).
 */
export function evaluateSearchCondition(cellValue, mode, needle) {
  const m = String(mode || "contains").toLowerCase();
  const cell = stripCsvCell(cellValue);
  if (m === "equals" || m === "eq") {
    return (
      normalizeArticleNameForMatch(cell) === normalizeArticleNameForMatch(needle) ||
      cell.trim().toLowerCase() === String(needle).trim().toLowerCase() ||
      normalizeCellTight(cell) === normalizeCellTight(needle) ||
      normalizeArticleNameCompact(cell) === normalizeArticleNameCompact(needle)
    );
  }
  if (m === "starts_with" || m === "starts") {
    const a = normalizeArticleNameForMatch(cell);
    const b = normalizeArticleNameForMatch(needle);
    if (a.startsWith(b)) return true;
    return normalizeArticleNameCompact(cell).startsWith(normalizeArticleNameCompact(needle));
  }
  if (m === "gte" || m === ">=") {
    return parseAmountLike(cell) >= parseAmountLike(needle);
  }
  if (m === "lte" || m === "<=") {
    return parseAmountLike(cell) <= parseAmountLike(needle);
  }
  return cellContainsHayNeedle(cell, needle);
}

/**
 * Recorre el CSV de compres línia a línia (sense carregar el fitxer sencer a memòria).
 */
export async function scanPurchasesLines(onRow) {
  const input = openPurchasesCsvStream();
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headerLine = null;
  let csvDelimiter = ",";
  try {
    for await (const line of rl) {
      if (!line || line.length === 0) continue;
      if (!headerLine) {
        headerLine = line.replace(/^\uFEFF/, "");
        let headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        if (headers.length <= 1 && headerLine.includes(";")) {
          csvDelimiter = ";";
          headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        }
        const headersMap = new Map(
          headers.map((h, idx) => [normalizeHeaderKey(h), idx])
        );
        /** SAP / export sovint usa proveidor sense ï; altres fitxers amb català correcte usen proveïdor. */
        const pickIdx = (candidates) => {
          for (const key of candidates) {
            const idx = headersMap.get(key);
            if (idx !== undefined) return idx;
          }
          return undefined;
        };
        const idxSupplier =
          pickIdx([
            "nom_proveïdor",
            "nom_proveidor",
            "nom_de_proveïdor",
            "nom_de_proveidor",
            "proveïdor",
            "proveidor",
            "nom_prove_dor",
            "nom_provedor"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("nom_") && k.includes("prove") && k.endsWith("dor")
          );
        const idxCode =
          pickIdx([
            "codi_proveïdor",
            "codi_proveidor",
            "codi_de_proveïdor",
            "codi_de_proveidor",
            "codi_prove_dor",
            "codi_provedor"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("codi_") && k.includes("prove") && k.endsWith("dor")
          );
        const idxArticle = pickIdx([
          "nom_article",
          "article",
          "descripció",
          "descripcio",
          "descripcion",
          "nom_articulo"
        ]);
        const idxArticleCode =
          pickIdx([
            "codi_article",
            "codi_articulo",
            "article_code",
            "codi_art",
            "sku"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("codi_") && k.includes("article")
          );
        const idxPreuUnitari =
          pickIdx([
            "preu_unitari",
            "preu_unitari_eur",
            "precio_unitario",
            "pvp_unitari"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.includes("preu") && k.includes("unit")
          );
        const idxAmount = pickIdx(["import", "import_eur", "import_total"]);
        const idxQty = pickIdx(["quantitat", "qty", "unitats"]);
        const idxDate = pickIdx([
          "data_comptable",
          "data_document",
          "data",
          "data_factura",
          "data_doc"
        ]);
        const dim1Override = process.env.FINANCE_PURCHASES_DIM1_COLUMN?.trim();
        const dim2Override = process.env.FINANCE_PURCHASES_DIM2_COLUMN?.trim();
        const idxDim1 =
          (dim1Override ? pickIdx([normalizeHeaderKey(dim1Override)]) : undefined) ??
          pickIdx([
            "dimensio_1",
            "dimension_1",
            "dimensio1",
            "dimension1",
            "dim_1",
            "dim1"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) =>
              k.includes("dimensio_1") ||
              k.includes("dimension_1") ||
              (k.includes("linia") && k.includes("negoci")) ||
              (k.includes("linea") && k.includes("negocio"))
          );
        const idxDim2 =
          (dim2Override ? pickIdx([normalizeHeaderKey(dim2Override)]) : undefined) ??
          pickIdx([
            "dimensio_2",
            "dimension_2",
            "dimensio2",
            "dimension2",
            "dim_2",
            "dim2"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) =>
              k.includes("dimensio_2") ||
              k.includes("dimension_2") ||
              k === "centre" ||
              (k.startsWith("centre_") && !k.includes("prove")) ||
              k === "center"
          );
        if (idxSupplier === undefined) {
          const found = headers.filter(Boolean).slice(0, 40);
          throw new Error(
            `CSV sense columna reconeixible de nom de proveïdor (esperat p.ex. nom_proveïdor / "Nom proveïdor"). Capçaleres: ${found.join(" | ")}`
          );
        }
        const cont = await onRow({
          phase: "header",
          headers,
          idx: {
            idxSupplier,
            idxCode,
            idxArticle,
            idxArticleCode,
            idxPreuUnitari,
            idxAmount,
            idxQty,
            idxDate,
            idxDim1,
            idxDim2,
            columnIndexByKey: keyMapFromHeadersMap(headersMap)
          }
        });
        if (cont === false) break;
        continue;
      }
      const fields = normalizeCsvLineDelimited(line, csvDelimiter);
      const cont = await onRow({ phase: "data", fields });
      if (cont === false) break;
    }
  } finally {
    rl.close();
  }
}
