import { normalizeArticleNameForMatch } from "./csv-cells.js";
import { getPurchasesSupplierArticlePeriodSummary } from "./purchases-queries-supplier.js";

/** Inici (inclòs) i fi (inclòs) d'un trimestre natural 1–4 en YYYY-MM-DD. */
function quarterToDateRange(year, quarter) {
  const y = Number(year);
  const q = Number(quarter);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    throw new Error("year invàlid");
  }
  if (!Number.isFinite(q) || q < 1 || q > 4) {
    throw new Error("quarter ha de ser 1–4");
  }
  const firstMonth0 = (q - 1) * 3;
  const lastMonth0 = firstMonth0 + 2;
  const pad = (n) => String(n).padStart(2, "0");
  const dateFrom = `${y}-${pad(firstMonth0 + 1)}-01`;
  const lastDay = new Date(Date.UTC(y, lastMonth0 + 1, 0)).getUTCDate();
  const dateTo = `${y}-${pad(lastMonth0 + 1)}-${pad(lastDay)}`;
  return { dateFrom, dateTo };
}

function mergeKeyArticle(a) {
  const c = a.articleCode && String(a.articleCode).trim().toLowerCase();
  if (c) return `c:${c}`;
  return `n:${normalizeArticleNameForMatch(a.articleName || "")}`;
}

/**
 * Comparació de preus mitjans ponderats per article entre dos trimestres (mateix proveïdor).
 */
export async function comparePurchasesSupplierQuarters({
  supplierCode,
  supplierName,
  yearA,
  quarterA,
  yearB,
  quarterB
}) {
  const rA = quarterToDateRange(yearA, quarterA);
  const rB = quarterToDateRange(yearB, quarterB);
  const [sumA, sumB] = await Promise.all([
    getPurchasesSupplierArticlePeriodSummary({
      supplierCode,
      supplierName,
      dateFrom: rA.dateFrom,
      dateTo: rA.dateTo
    }),
    getPurchasesSupplierArticlePeriodSummary({
      supplierCode,
      supplierName,
      dateFrom: rB.dateFrom,
      dateTo: rB.dateTo
    })
  ]);

  const label = (y, q) => `${y}-Q${q}`;
  const pick = (x) =>
    x
      ? {
          invoiceLines: x.invoiceLines,
          totalQuantity: x.totalQuantity,
          totalAmount: x.totalAmount,
          avgUnitPrice: x.avgUnitPrice
        }
      : null;

  const keys = new Set([
    ...sumA.articles.map(mergeKeyArticle),
    ...sumB.articles.map(mergeKeyArticle)
  ]);
  const comparison = [];
  for (const k of keys) {
    const a = sumA.articles.find((x) => mergeKeyArticle(x) === k);
    const b = sumB.articles.find((x) => mergeKeyArticle(x) === k);
    const avgA = a?.avgUnitPrice;
    const avgB = b?.avgUnitPrice;
    let avgUnitPriceDelta = null;
    let avgUnitPriceDeltaPct = null;
    if (avgA != null && avgB != null && Number.isFinite(avgA) && Number.isFinite(avgB)) {
      avgUnitPriceDelta = Math.round((avgB - avgA) * 10000) / 10000;
      if (avgA !== 0) {
        avgUnitPriceDeltaPct = Math.round(((avgB - avgA) / avgA) * 10000) / 100;
      }
    }

    const qtyA = a?.totalQuantity;
    const qtyB = b?.totalQuantity;
    let quantityDelta = null;
    let quantityDeltaPct = null;
    if (
      qtyA != null &&
      qtyB != null &&
      Number.isFinite(qtyA) &&
      Number.isFinite(qtyB)
    ) {
      quantityDelta = Math.round((qtyB - qtyA) * 10000) / 10000;
      if (qtyA !== 0) {
        quantityDeltaPct = Math.round(((qtyB - qtyA) / qtyA) * 10000) / 100;
      }
    }

    const amtA = a?.totalAmount;
    const amtB = b?.totalAmount;
    let totalAmountDelta = null;
    let totalAmountDeltaPct = null;
    if (
      amtA != null &&
      amtB != null &&
      Number.isFinite(amtA) &&
      Number.isFinite(amtB)
    ) {
      totalAmountDelta = Math.round((amtB - amtA) * 100) / 100;
      if (amtA !== 0) {
        totalAmountDeltaPct = Math.round(((amtB - amtA) / amtA) * 10000) / 100;
      }
    }

    comparison.push({
      articleCode: a?.articleCode || b?.articleCode || null,
      articleName: a?.articleName || b?.articleName || null,
      periodA: pick(a),
      periodB: pick(b),
      avgUnitPriceDelta,
      avgUnitPriceDeltaPct,
      quantityDelta,
      quantityDeltaPct,
      totalAmountDelta,
      totalAmountDeltaPct
    });
  }
  comparison.sort((x, y) => {
    const maxX = Math.max(x.periodA?.totalAmount || 0, x.periodB?.totalAmount || 0);
    const maxY = Math.max(y.periodA?.totalAmount || 0, y.periodB?.totalAmount || 0);
    return maxY - maxX;
  });

  const la = label(yearA, quarterA);
  const lb = label(yearB, quarterB);
  const supLabel =
    (sumA.supplierCode || sumB.supplierCode || sumA.supplierName || sumB.supplierName || "")
      .toString()
      .trim() || "Proveïdor";

  const dash = "—";
  /** Cel·les per informe controller: buit = em dash; imports 2 decimals. */
  const cellQty = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 10000) / 10000).toFixed(4).replace(/\.?0+$/, "");
  const cellEu = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 100) / 100).toFixed(2);
  const cellDeltaEu = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 100) / 100).toFixed(2);
  const cellPct = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : `${(Math.round(Number(n) * 100) / 100).toFixed(2)}%`;

  const reportTable = {
    title: `Comparativa compres · ${supLabel} · ${la} vs ${lb}`,
    columns: [
      "Codi article",
      "Article",
      `Unitats (${la})`,
      `Unitats (${lb})`,
      "Δ Unitats (B−A)",
      "% var. unitats",
      `Preu mig EUR (${la})`,
      `Preu mig EUR (${lb})`,
      "Δ Preu mig (EUR)",
      "% var. preu mig",
      `Import EUR (${la})`,
      `Import EUR (${lb})`,
      "Δ Import (EUR)",
      "% var. import"
    ],
    rows: comparison.map((row) => [
      row.articleCode ?? "",
      row.articleName ?? "",
      cellQty(row.periodA?.totalQuantity),
      cellQty(row.periodB?.totalQuantity),
      cellQty(row.quantityDelta),
      cellPct(row.quantityDeltaPct),
      cellEu(row.periodA?.avgUnitPrice),
      cellEu(row.periodB?.avgUnitPrice),
      cellDeltaEu(row.avgUnitPriceDelta),
      cellPct(row.avgUnitPriceDeltaPct),
      cellEu(row.periodA?.totalAmount),
      cellEu(row.periodB?.totalAmount),
      cellDeltaEu(row.totalAmountDelta),
      cellPct(row.totalAmountDeltaPct)
    ])
  };

  const sumArticles = (arts) =>
    arts.reduce(
      (acc, x) => {
        acc.invoiceLines += x.invoiceLines || 0;
        acc.totalQuantity += x.totalQuantity || 0;
        acc.totalAmount += x.totalAmount || 0;
        return acc;
      },
      { invoiceLines: 0, totalQuantity: 0, totalAmount: 0 }
    );
  const aggA = sumArticles(sumA.articles);
  const aggB = sumArticles(sumB.articles);
  const aggQtyDelta =
    Math.round((aggB.totalQuantity - aggA.totalQuantity) * 10000) / 10000;
  const aggQtyPct =
    aggA.totalQuantity !== 0
      ? Math.round(((aggB.totalQuantity - aggA.totalQuantity) / aggA.totalQuantity) * 10000) /
        100
      : null;
  const aggAmtDelta = Math.round((aggB.totalAmount - aggA.totalAmount) * 100) / 100;
  const aggAmtPct =
    aggA.totalAmount !== 0
      ? Math.round(((aggB.totalAmount - aggA.totalAmount) / aggA.totalAmount) * 10000) / 100
      : null;

  const reportTotalsTable = {
    title: `Totals agregats (totes les línies d'article) · ${la} vs ${lb}`,
    columns: ["Mètrica", `Valor (${la})`, `Valor (${lb})`, "Δ (B−A)", "% variació"],
    rows: [
      [
        "Línies de factura",
        String(aggA.invoiceLines),
        String(aggB.invoiceLines),
        String(aggB.invoiceLines - aggA.invoiceLines),
        aggA.invoiceLines !== 0
          ? cellPct(((aggB.invoiceLines - aggA.invoiceLines) / aggA.invoiceLines) * 100)
          : dash
      ],
      [
        "Unitats comprades",
        cellQty(aggA.totalQuantity),
        cellQty(aggB.totalQuantity),
        cellQty(aggQtyDelta),
        cellPct(aggQtyPct)
      ],
      [
        "Import total (EUR)",
        cellEu(aggA.totalAmount),
        cellEu(aggB.totalAmount),
        cellDeltaEu(aggAmtDelta),
        cellPct(aggAmtPct)
      ]
    ]
  };

  const onlyInB = comparison.filter((c) => !c.periodA && c.periodB);
  const onlyInA = comparison.filter((c) => c.periodA && !c.periodB);
  const topImportSwing = [...comparison].sort(
    (a, b) => Math.abs(b.totalAmountDelta ?? 0) - Math.abs(a.totalAmountDelta ?? 0)
  );

  const highlights = [];
  highlights.push(
    `Origen: agregació de línies de compra (CSV). Període base ${la}, període comparat ${lb}. Proveïdor ${supLabel}.`
  );
  highlights.push(
    `Totals: ${cellQty(aggA.totalQuantity)} → ${cellQty(aggB.totalQuantity)} unitats; import ${cellEu(aggA.totalAmount)} → ${cellEu(aggB.totalAmount)} EUR (var. ${cellPct(aggAmtPct)} sobre base).`
  );
  if (onlyInB.length) {
    highlights.push(
      `Articles amb compra només a ${lb} (${onlyInB.length}): ${onlyInB
        .slice(0, 5)
        .map((c) => c.articleName || c.articleCode)
        .join("; ")}${onlyInB.length > 5 ? "…" : ""}.`
    );
  }
  if (onlyInA.length) {
    highlights.push(
      `Sense compra a ${lb} respecte ${la} (${onlyInA.length} referències): ${onlyInA
        .slice(0, 5)
        .map((c) => c.articleName || c.articleCode)
        .join("; ")}${onlyInA.length > 5 ? "…" : ""}.`
    );
  }
  for (const c of topImportSwing.slice(0, 3)) {
    if (
      c.periodA &&
      c.periodB &&
      c.avgUnitPriceDeltaPct != null &&
      Math.abs(c.avgUnitPriceDeltaPct) >= 25 &&
      (c.quantityDeltaPct == null || Math.abs(c.quantityDeltaPct) >= 15)
    ) {
      highlights.push(
        `${c.articleName || c.articleCode}: variació preu mig ${cellPct(c.avgUnitPriceDeltaPct)} i volum ${cellPct(c.quantityDeltaPct)}; interpretar conjuntament (possible mix de línies de factura o condicions comercials).`
      );
    }
  }
  highlights.push(
    "El preu mig ponderat és import total / quantitat total del període; no equival sempre al preu unitari d’una sola factura."
  );

  const chartArticles = [...comparison]
    .sort(
      (x, y) =>
        Math.max(y.periodA?.totalAmount ?? 0, y.periodB?.totalAmount ?? 0) -
        Math.max(x.periodA?.totalAmount ?? 0, x.periodB?.totalAmount ?? 0)
    )
    .slice(0, 12);

  const avgBlendA =
    aggA.totalQuantity > 0 ? aggA.totalAmount / aggA.totalQuantity : null;
  const avgBlendB =
    aggB.totalQuantity > 0 ? aggB.totalAmount / aggB.totalQuantity : null;
  let avgBlendDelta = null;
  let avgBlendDeltaPct = null;
  if (
    avgBlendA != null &&
    avgBlendB != null &&
    Number.isFinite(avgBlendA) &&
    Number.isFinite(avgBlendB)
  ) {
    avgBlendDelta = Math.round((avgBlendB - avgBlendA) * 10000) / 10000;
    if (avgBlendA !== 0) {
      avgBlendDeltaPct = Math.round(((avgBlendB - avgBlendA) / avgBlendA) * 10000) / 100;
    }
  }

  const kpis = [
    {
      id: "import_total",
      label: "Import total (EUR)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellEu(aggA.totalAmount),
      valueB: cellEu(aggB.totalAmount),
      delta: cellDeltaEu(aggAmtDelta),
      deltaPct: cellPct(aggAmtPct),
      format: "eur"
    },
    {
      id: "volume_units",
      label: "Volum (unitats)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellQty(aggA.totalQuantity),
      valueB: cellQty(aggB.totalQuantity),
      delta: cellQty(aggQtyDelta),
      deltaPct: cellPct(aggQtyPct),
      format: "qty"
    },
    {
      id: "invoice_lines",
      label: "Línies de factura",
      periodALabel: la,
      periodBLabel: lb,
      valueA: String(aggA.invoiceLines),
      valueB: String(aggB.invoiceLines),
      delta: String(aggB.invoiceLines - aggA.invoiceLines),
      deltaPct:
        aggA.invoiceLines !== 0
          ? cellPct(((aggB.invoiceLines - aggA.invoiceLines) / aggA.invoiceLines) * 100)
          : dash,
      format: "count"
    },
    {
      id: "sku_count",
      label: "Referències d’article (comptades)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: String(sumA.articleCount),
      valueB: String(sumB.articleCount),
      delta: String(sumB.articleCount - sumA.articleCount),
      deltaPct:
        sumA.articleCount !== 0
          ? cellPct(((sumB.articleCount - sumA.articleCount) / sumA.articleCount) * 100)
          : dash,
      format: "count"
    },
    {
      id: "avg_price_blended",
      label: "Preu mig ponderat global (EUR/unitat)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellEu(avgBlendA),
      valueB: cellEu(avgBlendB),
      delta: cellDeltaEu(avgBlendDelta),
      deltaPct: cellPct(avgBlendDeltaPct),
      format: "eur"
    }
  ];

  const reportCalblay = {
    kpis,
    tables: [
      { title: reportTable.title, columns: reportTable.columns, rows: reportTable.rows },
      { title: reportTotalsTable.title, columns: reportTotalsTable.columns, rows: reportTotalsTable.rows }
    ],
    highlights: highlights.slice(0, 10),
    chart: {
      type: "bar",
      title: `Import total per article (EUR) · ${la} vs ${lb}`,
      xKey: "article",
      series: [
        { name: `Import ${la}`, dataKey: "importA" },
        { name: `Import ${lb}`, dataKey: "importB" }
      ],
      data: chartArticles.map((c) => ({
        article: String(c.articleCode || c.articleName || "—").slice(0, 28),
        importA: Number((c.periodA?.totalAmount ?? 0).toFixed(2)),
        importB: Number((c.periodB?.totalAmount ?? 0).toFixed(2))
      }))
    }
  };

  return {
    supplierCode: sumA.supplierCode || sumB.supplierCode,
    supplierName: sumA.supplierName || sumB.supplierName,
    periodA: {
      label: la,
      dateFrom: rA.dateFrom,
      dateTo: rA.dateTo,
      articleCount: sumA.articleCount,
      ...aggA,
      totalAmount: Math.round(aggA.totalAmount * 100) / 100,
      totalQuantity: Math.round(aggA.totalQuantity * 10000) / 10000
    },
    periodB: {
      label: lb,
      dateFrom: rB.dateFrom,
      dateTo: rB.dateTo,
      articleCount: sumB.articleCount,
      ...aggB,
      totalAmount: Math.round(aggB.totalAmount * 100) / 100,
      totalQuantity: Math.round(aggB.totalQuantity * 10000) / 10000
    },
    consolidated: {
      quantityDelta: aggQtyDelta,
      quantityDeltaPct: aggQtyPct,
      totalAmountDelta: aggAmtDelta,
      totalAmountDeltaPct: aggAmtPct
    },
    comparison,
    reportTable,
    reportTotalsTable,
    reportCalblay,
    note:
      "Preu mig ponderat = import total / quantitat total del període. B és el segon període (quarterB/yearB). " +
      "reportCalblay = bloc d’informe (taules + highlights + gràfic) generat al servidor; en mode informe la webapp el fusiona per evitar errors de transcripció."
  };
}
