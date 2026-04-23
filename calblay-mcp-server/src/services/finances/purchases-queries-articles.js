import { resolveColumnIndexFromKeyMap } from "./csv-columns.js";
import {
  normalizeArticleNameForMatch,
  parseAmountLike,
  parseQtyLike,
  stripCsvCell
} from "./csv-cells.js";
import {
  compareDateRange,
  evaluateSearchCondition,
  rowYearMonthFromDate,
  scanPurchasesLines
} from "./purchases-scan.js";

function articleRowMatches({ codeTerm, nameTerm, nomArt, codiArt }) {
  const codeHit = codeTerm && codiArt === codeTerm;
  if (codeHit) return true;
  if (!nameTerm) return false;
  const n = normalizeArticleNameForMatch(nomArt);
  if (!n) return false;
  if (n.includes(nameTerm)) return true;
  const tokens = nameTerm.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every((t) => n.includes(t));
}

/**
 * Línies de compra filtrades per article (codi exacte o nom parcial, sense accents).
 * yearMonth opcional "YYYY-MM" (es filtra per data_comptable / data_document).
 */
export async function getPurchasesByArticle({
  articleCode,
  articleName,
  yearMonth,
  limit = 40
}) {
  const codeTerm = articleCode
    ? normalizeArticleNameForMatch(stripCsvCell(articleCode)).replace(/\s/g, "")
    : "";
  const nameTerm = articleName
    ? normalizeArticleNameForMatch(stripCsvCell(articleName))
    : "";
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal articleCode o articleName");
  }
  const cap = Math.min(200, Math.max(1, Number(limit || 40)));
  const ym =
    yearMonth && String(yearMonth).trim()
      ? String(yearMonth).trim().slice(0, 7)
      : null;
  if (ym && !/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error("yearMonth ha de ser YYYY-MM");
  }

  let idxMeta = null;
  const rows = [];
  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;
    const nomArt =
      m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArt =
      m.idxArticleCode !== undefined
        ? stripCsvCell(f[m.idxArticleCode]).toLowerCase()
        : "";

    if (
      !articleRowMatches({
        codeTerm,
        nameTerm,
        nomArt,
        codiArt
      })
    ) {
      return true;
    }

    if (ym) {
      const ds = m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "";
      if (rowYearMonthFromDate(ds) !== ym) return true;
    }

    rows.push({
      date: m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "",
      supplier: m.idxSupplier !== undefined ? stripCsvCell(f[m.idxSupplier]) : "",
      supplierCode: m.idxCode !== undefined ? stripCsvCell(f[m.idxCode]) : "",
      articleCode: m.idxArticleCode !== undefined ? stripCsvCell(f[m.idxArticleCode]) : "",
      articleName: nomArt,
      quantity: m.idxQty !== undefined ? stripCsvCell(f[m.idxQty]) : "",
      unitPrice:
        m.idxPreuUnitari !== undefined ? stripCsvCell(f[m.idxPreuUnitari]) : "",
      amount: m.idxAmount !== undefined ? stripCsvCell(f[m.idxAmount]) : ""
    });
    return rows.length < cap;
  });

  return {
    articleCode: articleCode || null,
    articleName: articleName || null,
    yearMonth: ym,
    count: rows.length,
    rows
  };
}

/**
 * Resum d’un mes per article: línies, quantitat, import, preu mig ponderat (i min/max si hi ha preu unitari).
 */
export async function getPurchasesArticleMonthSummary({
  articleCode,
  articleName,
  yearMonth
}) {
  const ym = String(yearMonth || "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error("yearMonth obligatori (YYYY-MM)");
  }
  const codeTerm = articleCode
    ? normalizeArticleNameForMatch(stripCsvCell(articleCode)).replace(/\s/g, "")
    : "";
  const nameTerm = articleName
    ? normalizeArticleNameForMatch(stripCsvCell(articleName))
    : "";
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal articleCode o articleName");
  }

  let idxMeta = null;
  let lines = 0;
  let totalQty = 0;
  let totalAmount = 0;
  let sumPriceQty = 0;
  let minP = Infinity;
  let maxP = -Infinity;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;
    const nomArt =
      m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArt =
      m.idxArticleCode !== undefined
        ? stripCsvCell(f[m.idxArticleCode]).toLowerCase()
        : "";

    if (
      !articleRowMatches({
        codeTerm,
        nameTerm,
        nomArt,
        codiArt
      })
    ) {
      return true;
    }

    const ds = m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "";
    if (rowYearMonthFromDate(ds) !== ym) return true;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);
    let pu = parseAmountLike(m.idxPreuUnitari !== undefined ? f[m.idxPreuUnitari] : 0);
    if (pu <= 0 && qty > 0 && amt > 0) pu = amt / qty;

    lines += 1;
    totalQty += qty;
    totalAmount += amt;
    if (qty > 0 && pu > 0) {
      sumPriceQty += pu * qty;
      minP = Math.min(minP, pu);
      maxP = Math.max(maxP, pu);
    }
    return true;
  });

  const avgUnit =
    totalQty > 0 && sumPriceQty > 0 ? sumPriceQty / totalQty : totalQty > 0 && totalAmount > 0
      ? totalAmount / totalQty
      : 0;

  return {
    yearMonth: ym,
    articleCode: articleCode || null,
    articleName: articleName || null,
    invoiceLinesMatched: lines,
    totalQuantity: Math.round(totalQty * 10000) / 10000,
    totalAmount: Math.round(totalAmount * 100) / 100,
    avgUnitPrice: Math.round(avgUnit * 10000) / 10000,
    minUnitPrice: minP === Infinity ? null : Math.round(minP * 10000) / 10000,
    maxUnitPrice: maxP === -Infinity ? null : Math.round(maxP * 10000) / 10000
  };
}

/**
 * Agregació per **Dimensió 1** (línia de negoci / LN) i **Dimensió 2** (centre), en una passada sobre el CSV de compres.
 * Opcionalment filtra per proveïdor (codi P###### o nom).
 */
export async function aggregatePurchasesByBusinessLineAndCentre({
  dateFrom,
  dateTo,
  supplierCode,
  supplierName
}) {
  const df = dateFrom ? String(dateFrom).trim().slice(0, 10) : "";
  const dt = dateTo ? String(dateTo).trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
    throw new Error("Cal dateFrom i dateTo (YYYY-MM-DD)");
  }
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();

  let idxMeta = null;
  let dim1Detected = false;
  let dim2Detected = false;
  const map = new Map();

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      dim1Detected = row.idx.idxDim1 !== undefined;
      dim2Detected = row.idx.idxDim2 !== undefined;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;

    const dateStr = m.idxDate !== undefined ? String(f[m.idxDate] || "") : "";
    if (!compareDateRange(dateStr, df, dt)) return true;

    if (codeTerm || nameTerm) {
      const sup = String(f[m.idxSupplier] || "");
      const code = m.idxCode !== undefined ? String(f[m.idxCode] || "").trim().toLowerCase() : "";
      const codeHit = codeTerm && code === codeTerm;
      const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
      if (!codeHit && !nameHit) return true;
    }

    const d1 = m.idxDim1 !== undefined ? stripCsvCell(f[m.idxDim1]) : "";
    const d2 = m.idxDim2 !== undefined ? stripCsvCell(f[m.idxDim2]) : "";
    const k1 = d1 || "(sense dimensió 1)";
    const k2 = d2 || "(sense dimensió 2)";
    const key = `${k1}\t${k2}`;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);

    let rec = map.get(key);
    if (!rec) {
      rec = {
        lineOfBusiness: k1,
        centre: k2,
        invoiceLines: 0,
        totalQuantity: 0,
        totalAmount: 0
      };
      map.set(key, rec);
    }
    rec.invoiceLines += 1;
    rec.totalQuantity += qty;
    rec.totalAmount += amt;
    return true;
  });

  const byLnCentre = [...map.values()]
    .map((r) => ({
      lineOfBusiness: r.lineOfBusiness,
      centre: r.centre,
      invoiceLines: r.invoiceLines,
      totalQuantity: Math.round(r.totalQuantity * 10000) / 10000,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
      avgUnitPrice:
        r.totalQuantity > 0 && r.totalAmount !== 0
          ? Math.round((r.totalAmount / r.totalQuantity) * 10000) / 10000
          : 0
    }))
    .sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  const totals = byLnCentre.reduce(
    (acc, r) => {
      acc.invoiceLines += r.invoiceLines;
      acc.totalQuantity += r.totalQuantity;
      acc.totalAmount += r.totalAmount;
      return acc;
    },
    { invoiceLines: 0, totalQuantity: 0, totalAmount: 0 }
  );

  return {
    dateFrom: df,
    dateTo: dt,
    supplierCode: supplierCode ? String(supplierCode).trim() : null,
    supplierName: supplierName ? String(supplierName).trim() : null,
    dimension1Description:
      "Dimensió 1 = línia de negoci (equivalent a LN en altres informes, segons export SAP)",
    dimension2Description: "Dimensió 2 = centre",
    columnsDetected: { dimension1: dim1Detected, dimension2: dim2Detected },
    summary: {
      invoiceLines: totals.invoiceLines,
      totalQuantity: Math.round(totals.totalQuantity * 10000) / 10000,
      totalAmount: Math.round(totals.totalAmount * 100) / 100
    },
    rowCount: byLnCentre.length,
    byLnCentre,
    note:
      (!dim1Detected || !dim2Detected
        ? "Algun dimensió no s'ha detectat; revisa capçaleres del CSV o variables FINANCE_PURCHASES_DIM1_COLUMN / FINANCE_PURCHASES_DIM2_COLUMN (text de capçalera). "
        : "") + "Sense filtre de proveïdor s'inclouen totes les línies de l'interval."
  };
}

/**
 * Cerca genèrica sobre el CSV de compres: qualsevol columna (clau normalitzada: nom_article, codi_proveidor, import, data_comptable…).
 * conditions: [{ column, value, mode? }] on mode és contains (defecte), equals, starts_with, gte, lte.
 * dateFrom / dateTo: YYYY-MM-DD (inclosos) sobre la columna dateField (defecte data_comptable).
 */
export async function searchPurchases({
  conditions = [],
  dateFrom,
  dateTo,
  dateField = "data_comptable",
  limit = 80
}) {
  const lim = Math.min(300, Math.max(1, Number(limit || 80)));
  const rawConds = Array.isArray(conditions) ? conditions : [];
  const parsedDateFrom = dateFrom ? String(dateFrom).trim().slice(0, 10) : null;
  const parsedDateTo = dateTo ? String(dateTo).trim().slice(0, 10) : null;

  if (rawConds.length === 0 && !parsedDateFrom && !parsedDateTo) {
    throw new Error(
      "Cal almenys una condició { column, value } o bé dateFrom / dateTo (YYYY-MM-DD)"
    );
  }

  /** @type {{ idx: number, mode: string, value: string }[] | null} */
  let resolved = null;
  let resolvedDateIdx = null;
  /** @type {Record<string, number> | null} */
  let keyMap = null;

  const rows = [];

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      keyMap = row.idx.columnIndexByKey;
      if (!keyMap || Object.keys(keyMap).length === 0) {
        throw new Error("CSV sense mapa de columnes");
      }
      resolved = rawConds.map((c, i) => {
        const col = String(c.column ?? "").trim();
        if (!col) {
          throw new Error(`Condició #${i + 1}: falta "column"`);
        }
        const idx = resolveColumnIndexFromKeyMap(keyMap, col);
        if (idx === undefined) {
          throw new Error(
            `Columna "${col}" no trobada. Claus del fitxer: ${Object.keys(keyMap).slice(0, 40).join(", ")}`
          );
        }
        return {
          idx,
          mode: String(c.mode || "contains").toLowerCase(),
          value: String(c.value ?? "")
        };
      });
      if (parsedDateFrom || parsedDateTo) {
        const df = String(dateField || "data_comptable").trim();
        resolvedDateIdx = resolveColumnIndexFromKeyMap(keyMap, df);
        if (resolvedDateIdx === undefined) {
          throw new Error(
            `Columna de data "${df}" no trobada. Prova data_comptable, data_document… Claus: ${Object.keys(keyMap).join(", ")}`
          );
        }
      }
      return true;
    }

    const f = row.fields;
    if (resolvedDateIdx !== null) {
      const ds = f[resolvedDateIdx] ?? "";
      if (!compareDateRange(ds, parsedDateFrom, parsedDateTo)) return true;
    }
    for (const { idx, mode, value } of resolved) {
      if (!evaluateSearchCondition(f[idx], mode, value)) return true;
    }

    const obj = {};
    for (const [k, ix] of Object.entries(keyMap)) {
      obj[k] = stripCsvCell(f[ix] ?? "");
    }
    rows.push(obj);
    return rows.length < lim;
  });

  return {
    count: rows.length,
    limit: lim,
    columns: keyMap ? Object.keys(keyMap) : [],
    rows
  };
}
