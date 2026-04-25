import { CALBLAY_JSON_MARKER, TOOL_RESULT_MAX_CHARS } from "./config.js";

/**
 * Detecta preguntes d’informe de cost intern / sou / P&L / departaments.
 * El primer pas del bucle pot forçar `costs_imputation_overview` (tool_choice) per evitar una sola eina mal triada.
 */
export function shouldForceCostImputationOverview(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  // Quadrants d'operació (planificació per departament a Firestore), no CSV d'imputació: no forçar cost.
  if (/\bquadrants?\b/.test(s)) {
    const financialContext =
      /\b(imputaci|imputacion|cost\s*salar|n[oó]mina|sou|p\s*[\&\u0026]\s*l|p&l|trimestre|imput\w*.*(cost|salar)|variaci\w*.*(cost|sou))\b/i.test(
        s
      ) || /\b20[2-3]\d\b.*\b(cost|salar|nomina|imput)\b/i.test(s);
    if (!financialContext) return false;
  }
  const costLike =
    /\b(cost|imputaci|salar|nomina|n[oó]mina|departament|recursos\s+humans|personal)\b/i.test(s) ||
    /\bp\s*&\s*l\b/i.test(raw);
  const reportLike =
    /\b(informe|informacio|variacion|compar|trimestre|per[ií]ode)\b/i.test(s) ||
    /\b20[2-3]\d\b/.test(s) ||
    /\bt\s*[1-4]\b/i.test(s) ||
    /\b(1er|primer|1r)\b/.test(s);
  return costLike && reportLike;
}

/**
 * Força eina determinista de cost quan la pregunta ja inclou:
 * - context de cost intern/salarial
 * - pista de departament/centre
 * - pista temporal (YYYY, YYYY-MM, trimestre)
 */
export function shouldForceCostDepartmentPeriod(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  // Evita falsos positius en preguntes de compres/proveïdors.
  if (/\b(compres?|proveidor|factura|p\d{4,})\b/.test(s)) return false;

  const costLike =
    /\b(cost|imputaci|salar|nomina|n[oó]mina|p\s*[\&\u0026]\s*l|p&l)\b/i.test(s) ||
    /\bcost\s+total\b/i.test(s);
  const deptLike =
    /\b(departament|centre|logistica|rh|rrhh|recursos humans|marketing|cuina|sala|operativa)\b/i.test(
      s
    );
  const periodLike =
    /\b20[2-3]\d\b/.test(s) ||
    /\b20[2-3]\d[-/](0[1-9]|1[0-2])\b/.test(s) ||
    /\b(t|q)\s*[1-4]\b/i.test(s) ||
    /\btrimestre\b/i.test(s);

  return costLike && deptLike && periodLike;
}

/**
 * Detecta preguntes que han d'anar contra col·leccions Firestore (allergens/plats/projectes o mòduls no financers).
 * Força una primera passada de descoberta de col·leccions per evitar respostes genèriques sense dades.
 */
export function shouldForceFirestoreCatalog(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  if (/\b(p\d{4,}|proveidor|compres?|cost|factura|vendes?|revenue|marge)\b/.test(s)) return false;
  if (/\b(c\d+)\b/.test(s)) return false; // event_context_by_code ja cobreix aquest cas

  return /\b(alergen|celiac|celiacs|gluten|plats?|menu|menus|projecte|projectes|modul|moduls)\b/.test(
    s
  );
}

export function normalizeReport(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  const safeTables = tables.slice(0, 5).map((t) => ({
    title: String(t.title || "Taula"),
    columns: Array.isArray(t.columns) ? t.columns.map(String) : [],
    rows: Array.isArray(t.rows)
      ? t.rows.slice(0, 80).map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : []))
      : []
  }));
  let chart = null;
  if (
    raw.chart &&
    typeof raw.chart === "object" &&
    Array.isArray(raw.chart.data) &&
    raw.chart.data.length
  ) {
    const rows = raw.chart.data
      .slice(0, 24)
      .map((row) => (typeof row === "object" && row !== null ? row : { value: row }));
    chart = {
      type: raw.chart.type === "line" ? "line" : "bar",
      title: String(raw.chart.title || ""),
      xKey: String(raw.chart.xKey || "label"),
      series: Array.isArray(raw.chart.series)
        ? raw.chart.series.slice(0, 4).map((s) => ({
            name: String(s.name || ""),
            dataKey: String(s.dataKey || "value"),
            color: typeof s.color === "string" ? s.color : undefined
          }))
        : [{ name: "Valor", dataKey: "value" }],
      data: rows
    };
  }
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.slice(0, 10).map(String)
    : [];
  const kpis = Array.isArray(raw.kpis)
    ? raw.kpis.slice(0, 12).map((k, i) => {
        const fmt = String(k?.format || "text").toLowerCase();
        const format =
          fmt === "eur" || fmt === "qty" || fmt === "count" || fmt === "text" ? fmt : "text";
        return {
          id: String(k?.id || `kpi_${i}`).slice(0, 64),
          label: String(k?.label || "").slice(0, 140),
          periodALabel: String(k?.periodALabel || "").slice(0, 36),
          periodBLabel: String(k?.periodBLabel || "").slice(0, 36),
          valueA: String(k?.valueA ?? "—").slice(0, 72),
          valueB: String(k?.valueB ?? "—").slice(0, 72),
          delta:
            k?.delta !== undefined && k?.delta !== null ? String(k.delta).slice(0, 72) : undefined,
          deltaPct:
            k?.deltaPct !== undefined && k?.deltaPct !== null
              ? String(k.deltaPct).slice(0, 36)
              : undefined,
          format
        };
      })
    : [];
  return { tables: safeTables, chart, highlights, kpis };
}

export function splitNarrativeAndReport(fullContent, rich) {
  const text = fullContent || "";
  if (!rich) {
    return { narrative: text.trim(), report: null };
  }
  const idx = text.lastIndexOf(CALBLAY_JSON_MARKER);
  if (idx === -1) {
    return { narrative: text.trim(), report: null };
  }
  const narrative = text.slice(0, idx).trim();
  const after = text.slice(idx + CALBLAY_JSON_MARKER.length);
  const endFence = after.indexOf("```");
  if (endFence === -1) {
    return { narrative: text.trim(), report: null };
  }
  try {
    const parsed = JSON.parse(after.slice(0, endFence).trim());
    return {
      narrative: (narrative || parsed.summary || "").trim(),
      report: normalizeReport(parsed)
    };
  } catch {
    return { narrative: text.trim(), report: null };
  }
}

export function shrinkToolPayload(result) {
  if (result == null) return result;
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(result)
      : JSON.parse(JSON.stringify(result));

  if (clone.files && Array.isArray(clone.files) && clone.files.length > 40) {
    const total = clone.files.length;
    clone.files = clone.files.slice(0, 40);
    clone._truncatedFiles = total - 40;
  }
  if (clone.rows && Array.isArray(clone.rows) && clone.rows.length > 30) {
    const total = clone.rows.length;
    clone.rows = clone.rows.slice(0, 30);
    clone._truncatedRows = total - 30;
  }
  if (clone.byLn && Array.isArray(clone.byLn) && clone.byLn.length > 45) {
    const total = clone.byLn.length;
    clone.byLn = clone.byLn.slice(0, 45);
    clone._truncatedByLn = total - 45;
  }
  if (clone.comparison && Array.isArray(clone.comparison) && clone.comparison.length > 50) {
    const total = clone.comparison.length;
    clone.comparison = clone.comparison.slice(0, 50);
    clone._truncatedComparison = total - 50;
  }
  if (clone.reportTable && Array.isArray(clone.reportTable.rows)) {
    const nComp = clone.comparison ? clone.comparison.length : null;
    const cap = nComp != null ? Math.min(50, nComp) : 50;
    if (clone.reportTable.rows.length > cap) {
      const total = clone.reportTable.rows.length;
      clone.reportTable = { ...clone.reportTable, rows: clone.reportTable.rows.slice(0, cap) };
      clone._truncatedReportTableRows = total - cap;
    }
  }
  if (clone.articles && Array.isArray(clone.articles) && clone.articles.length > 45) {
    const total = clone.articles.length;
    clone.articles = clone.articles.slice(0, 45);
    clone._truncatedArticles = total - 45;
  }
  if (clone.byLnCentre && Array.isArray(clone.byLnCentre) && clone.byLnCentre.length > 45) {
    const total = clone.byLnCentre.length;
    clone.byLnCentre = clone.byLnCentre.slice(0, 45);
    clone._truncatedByLnCentre = total - 45;
  }
  if (clone.rows && Array.isArray(clone.rows) && clone.kind === "vendes" && clone.rows.length > 80) {
    const total = clone.rows.length;
    clone.rows = clone.rows.slice(0, 80);
    clone._truncatedSalesRows = total - 80;
  }
  if (
    clone.kind === "vendes" &&
    clone.byCentre &&
    Array.isArray(clone.byCentre) &&
    clone.byCentre.length > 40
  ) {
    const total = clone.byCentre.length;
    clone.byCentre = clone.byCentre.slice(0, 40);
    clone._truncatedByCentre = total - 40;
  }
  if (
    clone.kind === "vendes" &&
    clone.byMonth &&
    Array.isArray(clone.byMonth) &&
    clone.byMonth.length > 36
  ) {
    const total = clone.byMonth.length;
    clone.byMonth = clone.byMonth.slice(0, 36);
    clone._truncatedByMonth = total - 36;
  }
  if (
    clone.kind === "vendes" &&
    clone.fileErrors &&
    Array.isArray(clone.fileErrors) &&
    clone.fileErrors.length > 8
  ) {
    const total = clone.fileErrors.length;
    clone.fileErrors = clone.fileErrors.slice(0, 8);
    clone._truncatedFileErrors = total - 8;
  }
  if (
    clone.kind === "vendes" &&
    clone.ranking === "top_articles_by_establishment" &&
    Array.isArray(clone.top) &&
    clone.top.length > 35
  ) {
    const total = clone.top.length;
    clone.top = clone.top.slice(0, 35);
    clone._truncatedTopArticles = total - 35;
  }
  if (clone.personnel && Array.isArray(clone.personnel) && clone.personnel.length > 50) {
    const total = clone.personnel.length;
    clone.personnel = clone.personnel.slice(0, 50);
    clone._truncatedPersonnel = total - 50;
  }
  if (clone.finques && Array.isArray(clone.finques) && clone.finques.length > 30) {
    const total = clone.finques.length;
    clone.finques = clone.finques.slice(0, 30);
    clone._truncatedFinques = total - 30;
  }
  if (clone.events && Array.isArray(clone.events) && clone.events.length > 40) {
    const total = clone.events.length;
    clone.events = clone.events.slice(0, 40);
    clone._truncatedEvents = total - 40;
  }
  if (clone.kind === "quadrants_dept" && Array.isArray(clone.items) && clone.items.length > 35) {
    const total = clone.items.length;
    clone.items = clone.items.slice(0, 35);
    clone._truncatedQuadrantItems = total - 35;
  }
  if (
    clone.kind === "comercials_by_ln" &&
    Array.isArray(clone.comercials) &&
    clone.comercials.length > 80
  ) {
    const total = clone.comercials.length;
    clone.comercials = clone.comercials.slice(0, 80);
    clone._truncatedComercials = total - 80;
  }
  if (clone.vehicles && Array.isArray(clone.vehicles) && clone.vehicles.length > 80) {
    const total = clone.vehicles.length;
    clone.vehicles = clone.vehicles.slice(0, 80);
    clone._truncatedVehicles = total - 80;
  }
  if (clone.quadrants && Array.isArray(clone.quadrants) && clone.quadrants.length > 25) {
    const total = clone.quadrants.length;
    clone.quadrants = clone.quadrants.slice(0, 25);
    clone._truncatedQuadrants = total - 25;
  }
  if (clone.incidents && Array.isArray(clone.incidents) && clone.incidents.length > 25) {
    const total = clone.incidents.length;
    clone.incidents = clone.incidents.slice(0, 25);
    clone._truncatedIncidents = total - 25;
  }

  const s = JSON.stringify(clone);
  if (s.length > TOOL_RESULT_MAX_CHARS) {
    return {
      _truncated: true,
      preview: s.slice(0, TOOL_RESULT_MAX_CHARS),
      note: "Resultat tallat per reduir cost de tokens."
    };
  }
  return clone;
}
