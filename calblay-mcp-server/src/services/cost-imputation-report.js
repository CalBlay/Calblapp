/**
 * Construeix un bloc d’informe (reportCalblay) al servidor a partir del resultat
 * de costs_imputation_overview / costs_imputation_search, perquè la webapp mostri
 * taules i KPIs reals sense dependre del model per generar JSON.
 */

function fmtEu(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

/** @param {object} data — retorn de costs_imputation_overview / costs_imputation_search */
export function buildCostImputationReportCalblay(data) {
  if (!data || typeof data !== "object") return null;
  const rows = data.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const cols = data.amountColumns;
  if (!Array.isArray(cols) || cols.length === 0) return null;

  const tableCols = ["Centre / concepte", ...cols.map((c) => String(c.label || c.key))];
  const tableRows = rows.map((r) => {
    const out = [String(r.label || "—")];
    for (const c of cols) {
      const v = r.amounts?.[c.key];
      out.push(fmtEu(v));
    }
    return out;
  });

  const highlights = [];
  if (Array.isArray(data.metaLines)) {
    for (const line of data.metaLines.slice(0, 4)) {
      if (line) highlights.push(String(line));
    }
  }
  const file = data.file ? String(data.file) : "";
  if (file) highlights.push(`Origen dades: ${file}`);
  const nMatch =
    data.matchCount != null ? Number(data.matchCount) : rows.length;
  highlights.push(
    `Files al resultat: ${rows.length}${nMatch > rows.length ? ` (de ${nMatch} coincidències)` : ""}.`
  );
  if (data.truncatedList) highlights.push("La llista de centres està truncada; afegeix cerca per departament si cal més detall.");

  /** @type {object[]} */
  const kpis = [];
  if (cols.length >= 2) {
    const c0 = cols[0];
    const c1 = cols[1];
    let t0 = 0;
    let t1 = 0;
    for (const r of rows) {
      t0 += Number(r.amounts?.[c0.key] || 0);
      t1 += Number(r.amounts?.[c1.key] || 0);
    }
    const d = t1 - t0;
    const pct = t0 !== 0 ? (d / t0) * 100 : null;
    kpis.push({
      id: "cost_imputation_column_totals",
      label: "Suma imports (files mostrades)",
      periodALabel: String(c0.label || c0.key).slice(0, 28),
      periodBLabel: String(c1.label || c1.key).slice(0, 28),
      valueA: fmtEu(t0),
      valueB: fmtEu(t1),
      delta: fmtEu(d),
      deltaPct: pct != null ? `${(Math.round(pct * 100) / 100).toFixed(2)}%` : "—",
      format: "eur"
    });
  } else if (cols.length === 1) {
    const c0 = cols[0];
    let t0 = 0;
    for (const r of rows) {
      t0 += Number(r.amounts?.[c0.key] || 0);
    }
    kpis.push({
      id: "cost_imputation_single_total",
      label: `Total ${String(c0.label || c0.key).slice(0, 40)}`,
      periodALabel: "—",
      periodBLabel: "—",
      valueA: fmtEu(t0),
      valueB: "—",
      format: "eur"
    });
  }

  let chart = null;
  if (cols.length >= 2) {
    const k0 = cols[0].key;
    const k1 = cols[1].key;
    const ranked = rows
      .map((r) => {
        const a = Number(r.amounts?.[k0] || 0);
        const b = Number(r.amounts?.[k1] || 0);
        return {
          label: String(r.label || "").slice(0, 34),
          importA: Math.round(a * 100) / 100,
          importB: Math.round(b * 100) / 100,
          absDelta: Math.abs(b - a)
        };
      })
      .sort((x, y) => y.absDelta - x.absDelta)
      .slice(0, 12);
    if (ranked.length) {
      chart = {
        type: "bar",
        title: `Comparativa imports per centre (màx. variació)`,
        xKey: "label",
        series: [
          { name: String(cols[0].label || "Període A").slice(0, 22), dataKey: "importA" },
          { name: String(cols[1].label || "Període B").slice(0, 22), dataKey: "importB" }
        ],
        data: ranked
      };
    }
  }

  return {
    kpis,
    tables: [
      {
        title: "Imputació de costos (dades del CSV)",
        columns: tableCols,
        rows: tableRows.slice(0, 80)
      }
    ],
    highlights: highlights.slice(0, 10),
    chart
  };
}
