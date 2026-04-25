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
    /\b(cost|imputaci|salar|nomina|n[oó]mina|p\s*[\&\u0026]\s*l|p&l|subministr|suministr|cexplotaci|c\.?\s*explotaci)\b/i.test(
      s
    ) ||
    /\bcost\s+total\b/i.test(s);
  const deptLike =
    /\b(departament|centre|logistica|rh|rrhh|recursos humans|marketing|cuina|sala|operativa|subministr\w*|suministr\w*)\b/i.test(
      s
    );
  const periodLike =
    /\b20[2-3]\d\b/.test(s) ||
    /\b20[2-3]\d[-/](0[1-9]|1[0-2])\b/.test(s) ||
    /\b(0[1-9]|1[0-2])[-/](20[2-3]\d|\d{2})\b/.test(s) ||
    /\b(t|q)\s*[1-4]\b/i.test(s) ||
    /\btrimestre\b/i.test(s);

  return costLike && deptLike && periodLike;
}

/**
 * Guard adicional: només forçar costs_by_department_period si podem inferir mínim:
 * - una pista de departament
 * - una pista temporal sòlida
 */
export function canExtractCostDepartmentPeriodSlots(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const hasDepartment =
    /\b(marketing|logistica|rrhh|rh|recursos humans|recursos humanos|transport|compres|compras|produccio|produccion|operativa|cuina|sala|subministr\w*|suministr\w*)\b/.test(
      s
    );
  const hasPeriod =
    /\b20[2-3]\d[-/](0[1-9]|1[0-2])\b/.test(s) ||
    /\b(0[1-9]|1[0-2])[-/](20[2-3]\d|\d{2})\b/.test(s) ||
    /\b20[2-3]\d[-_ ]?(t|q)[1-4]\b/i.test(s) ||
    /\b(t|q)\s*[1-4]\s*(de)?\s*20[2-3]\d\b/i.test(s) ||
    /\b(primer|segon|segundo|tercer|quart|cuarto)\s+trimestre\s+de?\s*20[2-3]\d\b/i.test(s) ||
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\s+de?\s*20[2-3]\d\b/i.test(
      s
    );

  return hasDepartment && hasPeriod;
}

/**
 * Extracció tolerant de slots per costs_by_department_period.
 * Retorna null si no pot inferir departament+període amb mínima confiança.
 */
export function extractCostDepartmentPeriodSlots(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const deptMatch = s.match(
    /\b(marketing|logistica|rrhh|rh|recursos humans|recursos humanos|transport|compres|compras|produccio|produccion|operativa|cuina|sala|subministr\w*|suministr\w*)\b/
  );
  let departmentContains = deptMatch ? deptMatch[1] : "";
  if (departmentContains && /\b(subministr|suministr)/.test(departmentContains)) {
    departmentContains = "subministr";
  }

  const periodPatterns = [
    /\b20[2-3]\d[-/](0[1-9]|1[0-2])\b/i,
    /\b(0[1-9]|1[0-2])[-/](20[2-3]\d|\d{2})\b/i,
    /\b20[2-3]\d[-_ ]?(?:t|q)[1-4]\b/i,
    /\b(?:t|q)\s*[1-4]\s*(?:de)?\s*20[2-3]\d\b/i,
    /\b(?:primer|segon|segundo|tercer|quart|cuarto)\s+trimestre\s+(?:de)?\s*20[2-3]\d\b/i,
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\s+(?:de)?\s*20[2-3]\d\b/i
  ];
  let period = "";
  for (const re of periodPatterns) {
    const m = s.match(re);
    if (m && m[0]) {
      period = m[0].trim();
      break;
    }
  }

  // Normalitza MM-YY / MM-YYYY cap a YYYY-MM.
  const mMonthYear = period.match(/\b(0[1-9]|1[0-2])[-/](20[2-3]\d|\d{2})\b/i);
  if (mMonthYear) {
    const mm = mMonthYear[1];
    const yRaw = mMonthYear[2];
    const yy = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    period = `${yy}-${mm}`;
  }

  if (!departmentContains || !period) return null;
  return { departmentContains, period };
}

export function normalizeCostDepartmentContains(rawValue) {
  const s = String(rawValue || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (!s) return "";
  if (/\bsubmin|sumin/.test(s)) return "subministr";
  if (/\blogist/.test(s)) return "logistica";
  if (/\brrhh|\brh\b|recursos humans|recursos humanos/.test(s)) return "rh";
  return s;
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

export function shouldForceFinanceResultByLnMonth(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksFinanceResult =
    /\b(resultat financer|p&l|p\s*&\s*l|ebitda|resultat abans d'impostos)\b/.test(s);
  const asksLn =
    /\b(linia de negoci|ln\d{5}|per ln|per linia)\b/.test(s) ||
    /\b(foodlovers?|empresa|restaurants?|casaments?|fires?|precuinats?)\b/.test(s);
  const asksPeriod =
    /\b20[2-3]\d[-/](0[1-9]|1[0-2])\b/.test(s) ||
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\b.*\b20[2-3]\d\b/.test(
      s
    );
  return asksFinanceResult && asksLn && asksPeriod;
}

export function extractYearMonthFromQuestion(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const mIso = s.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;
  const monthMap = {
    gener: "01",
    enero: "01",
    febrer: "02",
    febrero: "02",
    marc: "03",
    marzo: "03",
    abril: "04",
    maig: "05",
    mayo: "05",
    juny: "06",
    junio: "06",
    juliol: "07",
    julio: "07",
    agost: "08",
    agosto: "08",
    setembre: "09",
    septiembre: "09",
    octubre: "10",
    novembre: "11",
    noviembre: "11",
    desembre: "12",
    diciembre: "12"
  };
  const mName = s.match(
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\b.*\b(20\d{2})\b/
  );
  if (!mName) return "";
  const mm = monthMap[mName[1]] || "";
  return mm ? `${mName[2]}-${mm}` : "";
}

export function shouldForceEventsCountByDay(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksPreventive = /\b(prevenit\w*|preventiu|preventius|preventive|planificat|planificats)\b/.test(
    s
  );
  const hasDayMonthNumeric =
    /\b([0-2]?\d|3[01])[-/.]([0]?\d|1[0-2])[-/.]((?:19|20)\d{2}|\d{2})\b/.test(s) ||
    /\b([0-2]?\d|3[01])[-/.]([0]?\d|1[0-2])\b/.test(s) ||
    /\b(20\d{2}|19\d{2})[-/.]([0]?\d|1[0-2])[-/.]([0-2]?\d|3[01])\b/.test(s);
  const hasDayMonthText =
    /\b([0-2]?\d|3[01])\s+(de\s+)?(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)(\s+de?\s*((?:19|20)\d{2}|\d{2}))?\b/.test(
      s
    );
  return asksPreventive && (hasDayMonthNumeric || hasDayMonthText);
}

export function extractDateYmdFromQuestion(question, fallbackYear = new Date().getFullYear()) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const pad2 = (v) => String(v).padStart(2, "0");

  /** Any explícit de 4 xifres, o 2 xifres (pivot 69/70 → 19xx/20xx). */
  const expandYearToken = (tok) => {
    const raw = String(tok || "").trim();
    if (!raw) return String(fallbackYear);
    if (/^(?:19|20)\d{2}$/.test(raw)) return raw;
    if (/^\d{2}$/.test(raw)) {
      const n = Number(raw);
      return String(n <= 69 ? 2000 + n : 1900 + n);
    }
    return String(fallbackYear);
  };

  // ISO YYYY-MM-DD (prioritari sobre DD-MM per evitar ambigüitat).
  const iso = s.match(/\b(20\d{2}|19\d{2})[-/.]([0]?\d|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  // DD-MM-YYYY o DD-MM-YY (format local; ex. 04-05-26 → 2026-05-04).
  const dmyFull = s.match(
    /\b([0-2]?\d|3[01])[-/.]([0]?\d|1[0-2])[-/.]((?:19|20)\d{2}|\d{2})\b/
  );
  if (dmyFull) {
    const year = expandYearToken(dmyFull[3]);
    return `${year}-${pad2(dmyFull[2])}-${pad2(dmyFull[1])}`;
  }

  // DD-MM sense any → any d'inferència (normalment any natural actual del servidor).
  const dm = s.match(/\b([0-2]?\d|3[01])[-/.]([0]?\d|1[0-2])\b/);
  if (dm) {
    const year = String(fallbackYear);
    return `${year}-${pad2(dm[2])}-${pad2(dm[1])}`;
  }

  const monthMap = {
    gener: "01",
    enero: "01",
    febrer: "02",
    febrero: "02",
    marc: "03",
    marzo: "03",
    abril: "04",
    maig: "05",
    mayo: "05",
    juny: "06",
    junio: "06",
    juliol: "07",
    julio: "07",
    agost: "08",
    agosto: "08",
    setembre: "09",
    septiembre: "09",
    octubre: "10",
    novembre: "11",
    noviembre: "11",
    desembre: "12",
    diciembre: "12"
  };
  const dayText = s.match(
    /\b([0-2]?\d|3[01])\s+(?:de\s+)?(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)(?:\s+(?:de\s+)?((?:19|20)\d{2}|\d{2}))?\b/
  );
  if (!dayText) return "";
  const mm = monthMap[dayText[2]];
  if (!mm) return "";
  const yy = dayText[3] ? expandYearToken(dayText[3]) : String(fallbackYear);
  return `${yy}-${mm}-${pad2(dayText[1])}`;
}

export function shouldForceFinquesCount(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksFinques = /\b(finca|finques)\b/.test(s);
  const asksHowMany = /\b(quantes?|cuantas?|nombre|n[úu]mero|total)\b/.test(s);
  const asksClassification =
    /\b(classif\w*|tipus|tipologia|agrupa\w*|desglossa\w*|distribucio\w*)\b/.test(s);
  return asksFinques && (asksHowMany || asksClassification);
}

export function shouldForceAuditsCount(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksAudit = /\b(auditor\w*|auditoria\w*|audit_runs|audits?)\b/.test(s);
  const asksCount = /\b(quantes?|cuantas?|nombre|n[úu]mero|total|hem fet)\b/.test(s);
  return asksAudit && asksCount;
}

export function shouldForcePersonnelSearch(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksHeadcount = /\b(quants?|cuantos?|nombre|numero|total)\b/.test(s);
  const asksPeople = /\b(personal|treballadors?|empleats?|staff)\b/.test(s);
  const hasDepartment = /\b(departament|departamento|logistica|cuina|sala|serveis|rrhh|rh)\b/.test(s);
  return asksHeadcount && asksPeople && hasDepartment;
}

export function extractDepartmentFromQuestion(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const m = s.match(/\b(logistica|cuina|sala|serveis|rrhh|rh|recursos humans|recursos humanos)\b/);
  return m?.[1] || "";
}

export function shouldForceVehicleAssignmentsByPlate(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksAssignedCount =
    /\b(quants?\s+cops?|cuantas?\s+veces|vegades|assignat|assignada|asignad[oa])\b/.test(s) &&
    /\b(furgoneta|vehicle|matricula|placa)\b/.test(s);
  const hasPlateLike = /\b\d{3,4}[- ]?[a-z]{2,4}\b/i.test(String(question || ""));
  return asksAssignedCount && hasPlateLike;
}

export function extractPlateFromQuestion(question) {
  const raw = String(question || "");
  const m = raw.match(/\b(\d{3,4}[- ]?[A-Za-z]{2,4})\b/);
  return m ? m[1].replace(/\s+/g, "-").toUpperCase() : "";
}

export function shouldForceWorkerServicesCount(question) {
  const s = String(question || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const asksCount = /\b(quants?|cuantos?|nombre|numero|total)\b/.test(s);
  const asksServices = /\b(serveis?|servicios?)\b/.test(s);
  const asksAttendance = /\b(ha anat|ha ido|fet|ha fet|hizo)\b/.test(s);
  const hasLikelyPerson = /\b(el|la)\s+[a-z]+\s+[a-z]+\b/.test(s) || /\b[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú][a-zà-ú]+\b/.test(String(question || ""));
  return asksCount && asksServices && (asksAttendance || hasLikelyPerson);
}

export function extractWorkerNameFromQuestion(question) {
  const raw = String(question || "").trim();
  const m1 = raw.match(/\b(?:ha anat|ha ido|ha fet|hizo)\s+(?:el|la)?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,2})/);
  if (m1?.[1]) return m1[1].trim();
  const m2 = raw.match(/\b(?:el|la)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,2})/);
  if (m2?.[1]) return m2[1].trim();
  const m3 = raw.match(/\b([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){1,2})\b/);
  return m3?.[1] ? m3[1].trim() : "";
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
