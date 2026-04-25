/**
 * Construeix un bloc d’informe (reportCalblay) al servidor a partir del resultat
 * de costs_imputation_overview / costs_imputation_search, perquè la webapp mostri
 * taules i KPIs reals sense dependre del model per generar JSON.
 */

function fmtEu(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

/** @param {object} data — retorn de costs_imputation_overview / costs_imputation_search / costs_by_department_period */
export function buildCostImputationReportCalblay(data) {
  if (!data || typeof data !== "object") return null;
  const rows = data.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const cols = Array.isArray(data.amountColumns) ? data.amountColumns : data.periodColumns;
  if (!Array.isArray(cols) || cols.length === 0) return null;
  const isDeptPeriod = Array.isArray(data.periodColumns) && !Array.isArray(data.amountColumns);

  const tableCols = ["Centre / concepte", ...cols.map((c) => String(c.label || c.key))];
  const tableRows = rows.map((r) => {
    const out = [String(r.label || "—")];
    for (const c of cols) {
      const v =
        r.amounts?.[c.key] ??
        r.valuesByColumn?.find((x) => x?.key === c.key || x?.headerLabel === c.label)?.value;
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
  const nMatch = data.matchCount != null ? Number(data.matchCount) : rows.length;
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
      const a =
        r.amounts?.[c0.key] ??
        r.valuesByColumn?.find((x) => x?.key === c0.key || x?.headerLabel === c0.label)?.value;
      const b =
        r.amounts?.[c1.key] ??
        r.valuesByColumn?.find((x) => x?.key === c1.key || x?.headerLabel === c1.label)?.value;
      t0 += Number(a || 0);
      t1 += Number(b || 0);
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
      const a =
        r.amounts?.[c0.key] ??
        r.valuesByColumn?.find((x) => x?.key === c0.key || x?.headerLabel === c0.label)?.value;
      t0 += Number(a || 0);
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
        const a =
          r.amounts?.[k0] ??
          r.valuesByColumn?.find((x) => x?.key === k0 || x?.headerLabel === cols[0].label)?.value;
        const b =
          r.amounts?.[k1] ??
          r.valuesByColumn?.find((x) => x?.key === k1 || x?.headerLabel === cols[1].label)?.value;
        return {
          label: String(r.label || "").slice(0, 34),
          importA: Math.round(Number(a || 0) * 100) / 100,
          importB: Math.round(Number(b || 0) * 100) / 100,
          absDelta: Math.abs(Number(b || 0) - Number(a || 0))
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
    highlights: [
      ...highlights.slice(0, 9),
      ...(isDeptPeriod ? ["Vista determinista per departament+període (cost intern)."] : [])
    ].slice(0, 10),
    chart
  };
}
