import {
  normalizeArticleNameForMatch,
  parseAmountLike,
  parseQtyLike,
  stripCsvCell
} from "./csv-cells.js";
import { compareDateRange, rowYearFromDate, scanPurchasesLines } from "./purchases-scan.js";

export async function getPurchasesBySupplier(supplierName, limit = 200) {
  const term = String(supplierName || "").trim().toLowerCase();
  if (!term) throw new Error("Missing supplierName");

  const cap = Number(limit || 200);
  const matched = [];
  let idxMeta = null;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const {
      idxSupplier,
      idxCode,
      idxArticle,
      idxAmount,
      idxQty,
      idxDate
    } = idxMeta;
    const supplier = String(f[idxSupplier] || "");
    const code = idxCode !== undefined ? String(f[idxCode] || "").trim().toLowerCase() : "";
    const hit =
      supplier.toLowerCase().includes(term) || (term && code === term);
    if (!hit) return true;
    matched.push({
      supplier,
      supplierCode: idxCode !== undefined ? String(f[idxCode] || "") : "",
      article: idxArticle !== undefined ? String(f[idxArticle] || "") : "",
      amount: idxAmount !== undefined ? String(f[idxAmount] || "") : "",
      quantity: idxQty !== undefined ? String(f[idxQty] || "") : "",
      date: idxDate !== undefined ? String(f[idxDate] || "") : ""
    });
    return matched.length < cap;
  });

  return {
    supplierQuery: supplierName,
    count: matched.length,
    rows: matched
  };
}

/**
 * Agregació ràpida (una passada): quantitat i import totals per proveïdor i any.
 * Accepta codi (ex. P003004) o text al nom.
 */
export async function getPurchasesSupplierYearSummary({
  year,
  supplierCode,
  supplierName
}) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    throw new Error("year invàlid");
  }
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal supplierCode o supplierName");
  }

  let idxMeta = null;
  let totalQty = 0;
  let totalAmount = 0;
  let lines = 0;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const { idxSupplier, idxCode, idxAmount, idxQty, idxDate } = idxMeta;
    const dateStr = idxDate !== undefined ? String(f[idxDate] || "") : "";
    if (rowYearFromDate(dateStr) !== y) return true;

    const sup = String(f[idxSupplier] || "");
    const code = idxCode !== undefined ? String(f[idxCode] || "").trim().toLowerCase() : "";

    const codeHit = codeTerm && code === codeTerm;
    const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
    if (!codeHit && !nameHit) return true;

    totalQty += parseQtyLike(idxQty !== undefined ? f[idxQty] : 0);
    totalAmount += parseAmountLike(idxAmount !== undefined ? f[idxAmount] : 0);
    lines += 1;
    return true;
  });

  return {
    year: y,
    supplierCode: supplierCode || null,
    supplierName: supplierName || null,
    invoiceLinesMatched: lines,
    totalQuantity: Math.round(totalQty * 10000) / 10000,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

/**
 * Agregació per article (preu mig ponderat = import total / quantitat total) per proveïdor i interval de dates.
 */
export async function getPurchasesSupplierArticlePeriodSummary({
  supplierCode,
  supplierName,
  dateFrom,
  dateTo
}) {
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal supplierCode (ex. P003004) o supplierName");
  }
  const df = dateFrom ? String(dateFrom).trim().slice(0, 10) : "";
  const dt = dateTo ? String(dateTo).trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
    throw new Error("dateFrom i dateTo han de ser YYYY-MM-DD");
  }

  let idxMeta = null;
  /** @type {Map<string, { articleCode: string, articleName: string, lines: number, totalQty: number, totalAmount: number }>} */
  const byArt = new Map();

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;

    const dateStr = m.idxDate !== undefined ? String(f[m.idxDate] || "") : "";
    if (!compareDateRange(dateStr, df, dt)) return true;

    const sup = String(f[m.idxSupplier] || "");
    const code = m.idxCode !== undefined ? String(f[m.idxCode] || "").trim().toLowerCase() : "";
    const codeHit = codeTerm && code === codeTerm;
    const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
    if (!codeHit && !nameHit) return true;

    const nomArt = m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArtRaw = m.idxArticleCode !== undefined ? stripCsvCell(f[m.idxArticleCode]) : "";
    const codiArt = codiArtRaw ? codiArtRaw.toLowerCase() : "";
    const artKey = codiArt ? `c:${codiArt}` : `n:${normalizeArticleNameForMatch(nomArt)}`;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);

    let rec = byArt.get(artKey);
    if (!rec) {
      rec = {
        articleCode: codiArtRaw || null,
        articleName: nomArt || null,
        lines: 0,
        totalQty: 0,
        totalAmount: 0
      };
      byArt.set(artKey, rec);
    }
    rec.lines += 1;
    rec.totalQty += qty;
    rec.totalAmount += amt;
    return true;
  });

  const articles = [...byArt.values()].map((r) => {
    const avg = r.totalQty > 0 && r.totalAmount !== 0 ? r.totalAmount / r.totalQty : 0;
    return {
      articleCode: r.articleCode,
      articleName: r.articleName,
      invoiceLines: r.lines,
      totalQuantity: Math.round(r.totalQty * 10000) / 10000,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
      avgUnitPrice: Math.round(avg * 10000) / 10000
    };
  });
  articles.sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  return {
    supplierCode: supplierCode ? String(supplierCode).trim() : null,
    supplierName: supplierName ? String(supplierName).trim() : null,
    dateFrom: df,
    dateTo: dt,
    articleCount: articles.length,
    articles
  };
}
