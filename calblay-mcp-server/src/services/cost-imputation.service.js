import {
  listFinanceCsvFilesForKind,
  normalizeArticleNameForMatch,
  normalizeCsvLine,
  parseAmountLike,
  readCsvText,
  stripCsvCell
} from "./finances.service.js";

/** Evita tornar a escanejar el directori en cada crida d'eina. */
let resolvedCostReportFileName = null;
/** Subcarpeta/origen on viu el fitxer (costos | rh), p.ex. RRHH amb cost salarial. */
let resolvedCostReportKind = null;

function costReportCacheDisabled() {
  return String(process.env.FINANCE_COST_REPORT_CACHE_DISABLED || "").match(/^(1|true|yes)$/i);
}

/**
 * Nom del CSV d'imputació: FINANCE_COST_CSV si està definit; si no, el primer fitxer vàlid
 * a les carpetes costos i rh (RRHH / recursos_humans) que parsegi com a informe (fila Importe bruto / Import brut).
 */
export async function resolveCostReportFileName() {
  if (resolvedCostReportFileName && resolvedCostReportKind && !costReportCacheDisabled()) {
    return resolvedCostReportFileName;
  }

  const explicit = process.env.FINANCE_COST_CSV?.trim();
  if (explicit) {
    const forcedKind = process.env.FINANCE_COST_CSV_KIND?.trim().toLowerCase();
    if (forcedKind === "rh" || forcedKind === "costos") {
      const raw = await readCsvText(explicit, forcedKind);
      parseCostImputationCsv(raw);
      resolvedCostReportFileName = explicit;
      resolvedCostReportKind = forcedKind;
      return explicit;
    }
    for (const kind of ["costos", "rh"]) {
      try {
        const raw = await readCsvText(explicit, kind);
        parseCostImputationCsv(raw);
        resolvedCostReportFileName = explicit;
        resolvedCostReportKind = kind;
        return explicit;
      } catch {
        /* següent carpeta */
      }
    }
    throw new Error(
      `FINANCE_COST_CSV=${explicit} no es pot llegir com a informe d'imputació dins costos ni rh. ` +
        "Comprova el nom (inclou extensió .csv si escau) o posa FINANCE_COST_CSV_KIND=costos o rh."
    );
  }

  const kinds = String(process.env.FINANCE_COST_IMPUTATION_KINDS || "costos,rh")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((k) => k === "costos" || k === "rh");

  /** @type {{ name: string, kind: string }[]} */
  const candidates = [];
  for (const kind of kinds) {
    const names = await listFinanceCsvFilesForKind(kind);
    for (const name of names) {
      candidates.push({ name, kind });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      "No hi ha cap fitxer de dades a les carpetes d'imputació (costos ni rh/RRHH). " +
        "Revisa FINANCE_CSV_DIR, FINANCE_SUBFOLDERS, FINANCE_PATH_COSTOS, FINANCE_PATH_RH i que el desplegament (GCS) tingui els mateixos fitxers que el teu OneDrive. " +
        "O defineix FINANCE_COST_CSV amb el nom exacte del fitxer."
    );
  }

  const scoreName = (n) => {
    const l = n.toLowerCase();
    if (l.includes("imputaci")) return 0;
    if (l.includes("salar") || l.includes("salari")) return 1;
    if (l.includes("cost")) return 2;
    return 3;
  };
  const maxYearInName = (n) => {
    const years = String(n).match(/20\d{2}/g);
    if (!years || !years.length) return 0;
    return Math.max(...years.map(Number));
  };
  const sorted = [...candidates].sort((a, b) => {
    const d = scoreName(a.name) - scoreName(b.name);
    if (d !== 0) return d;
    const yd = maxYearInName(b.name) - maxYearInName(a.name);
    if (yd !== 0) return yd;
    return a.name.localeCompare(b.name);
  });

  for (const { name, kind } of sorted) {
    try {
      const raw = await readCsvText(name, kind);
      parseCostImputationCsv(raw);
      resolvedCostReportFileName = name;
      resolvedCostReportKind = kind;
      return name;
    } catch {
      /* següent candidat */
    }
  }

  throw new Error(
    `No s'ha detectat cap CSV d'imputació vàlid (fila «Importe bruto» / «Import brut») entre: ${sorted.map((c) => `${c.kind}:${c.name}`).join(", ")}. ` +
      "Defineix FINANCE_COST_CSV o revisa el format de l'export."
  );
}


function slugHeader(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Claus úniques per columna (informes comparatius: dues «Importe bruto» per períodes diferents). */
function buildAmountColumnKeys(labels) {
  const slugCounts = new Map();
  const keys = [];
  for (const raw of labels) {
    const base = slugHeader(raw) || "import";
    const c = (slugCounts.get(base) || 0) + 1;
    slugCounts.set(base, c);
    keys.push(c === 1 ? base : `${base}__${c}`);
  }
  return keys;
}

function isLikelyAmountCell(s) {
  const t = stripCsvCell(s);
  if (!t || !/\d/.test(t)) return false;
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) return false;
  const plain = t.replace(/^[-+]/, "");
  if (/^\d{1,4}$/.test(plain) && !t.includes(",") && !t.includes(".")) return false;
  const n = parseAmountLike(t);
  return n !== 0 || t === "0" || /^0[,.]0+$/.test(plain);
}

function cellIsAmountHeaderLabel(c) {
  const s = stripCsvCell(c).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    s.includes("importe bruto") ||
    s.includes("import brut") ||
    s.includes("importe brut") ||
    (s.includes("import") && s.includes("brut"))
  );
}

function findAmountHeaderRow(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const cells = normalizeCsvLine(lines[i]);
    const idx = cells.findIndex((c) => cellIsAmountHeaderLabel(c));
    if (idx >= 0) return { rowIndex: i, amountStart: idx, cells };
  }
  return null;
}

function pickLabelFromRow(cells, amountStart) {
  let best = "";
  for (let i = 0; i < amountStart; i += 1) {
    const s = stripCsvCell(cells[i]);
    if (!s || isLikelyAmountCell(s)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(s)) continue;
    if (s.length >= best.length) best = s;
  }
  return best;
}

/**
 * CSV tipus "IMPUTACIO DE COSTOS": column_*, capçaleres reals a una fila amb Importe bruto, etc.
 */
export function parseCostImputationCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const meta = { title: "", period: "", empresa: "" };
  const metaLines = [];
  const head = findAmountHeaderRow(lines);
  if (!head) {
    throw new Error(
      "No s'ha trobat la fila amb capçalera d'import tipus «Importe bruto» / «Import brut». Aquest CSV no sembla un informe d'imputació de costos."
    );
  }

  for (let i = 0; i < head.rowIndex; i += 1) {
    const cells = normalizeCsvLine(lines[i]);
    const joined = cells.map(stripCsvCell).filter(Boolean).join(" | ");
    if (joined) metaLines.push(joined);
    if (/imputaci[oó]/i.test(joined)) meta.title = joined;
    else if (/Del\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(joined) || /al\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(joined)) {
      meta.period = joined;
    } else if (/empresa/i.test(joined)) meta.empresa = joined;
  }

  const amountHeaderLabels = [];
  for (let j = head.amountStart; j < head.cells.length; j += 1) {
    const h = stripCsvCell(head.cells[j]);
    if (h) amountHeaderLabels.push(h);
  }
  const amountHeaders = buildAmountColumnKeys(amountHeaderLabels);

  const rows = [];
  for (let i = head.rowIndex + 1; i < lines.length; i += 1) {
    const cells = normalizeCsvLine(lines[i]);
    const label = pickLabelFromRow(cells, head.amountStart);
    if (!label) continue;

    const amounts = {};
    let anyNum = false;
    for (let k = 0; k < amountHeaders.length; k += 1) {
      const cell = cells[head.amountStart + k] ?? "";
      const n = parseAmountLike(cell);
      amounts[amountHeaders[k]] = n;
      if (n !== 0 || stripCsvCell(cell)) anyNum = true;
    }
    if (!anyNum) continue;

    rows.push({ label, amounts, line: i + 1 });
  }

  return {
    meta,
    metaLines,
    amountHeaders,
    amountHeaderLabels,
    rows
  };
}

export async function loadCostImputation() {
  await resolveCostReportFileName();
  const fileName = resolvedCostReportFileName;
  const kind = resolvedCostReportKind || "costos";
  if (!fileName) throw new Error("Cost imputation: fitxer no resolt");
  const raw = await readCsvText(fileName, kind);
  return parseCostImputationCsv(raw);
}

const COST_SEARCH_TYPOS = {
  maqueting: "marketing",
  maketing: "marketing",
  marqueting: "marketing",
  marketingfes: "marketing",
  marketinf: "marketing",
  marketin: "marketing"
};

function rowMatchesCostSearch(rowLabel, termRaw) {
  let nterm = normalizeArticleNameForMatch(termRaw);
  if (COST_SEARCH_TYPOS[nterm]) nterm = COST_SEARCH_TYPOS[nterm];
  const labelNorm = normalizeArticleNameForMatch(rowLabel);
  if (!nterm || !labelNorm) return false;
  if (labelNorm.includes(nterm)) return true;
  if (nterm.includes(labelNorm) && labelNorm.length >= 3) return true;
  const words = nterm.split(/\s+/).filter((w) => w.length >= 4);
  for (const w of words) {
    if (labelNorm.includes(w)) return true;
  }
  return false;
}

function normForMatch(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function periodTokensFromInput(periodRaw) {
  const t = String(periodRaw || "").trim();
  if (!t) return [];
  const norm = normForMatch(t).replace(/\s+/g, "");
  const tokens = new Set([norm]);

  const mYearMonth = norm.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (mYearMonth) {
    tokens.add(`${mYearMonth[1]}-${mYearMonth[2]}`);
    tokens.add(`${mYearMonth[1]}${mYearMonth[2]}`);
  }

  const mQuarterA = norm.match(/\b(20\d{2})[-_]?q([1-4])\b/);
  if (mQuarterA) {
    const y = mQuarterA[1];
    const q = mQuarterA[2];
    tokens.add(`${y}q${q}`);
    tokens.add(`t${q}${y}`);
    tokens.add(`q${q}${y}`);
  }
  const mQuarterB = norm.match(/\b(t|q)([1-4])[-_ ]?(20\d{2})\b/);
  if (mQuarterB) {
    const q = mQuarterB[2];
    const y = mQuarterB[3];
    tokens.add(`${y}q${q}`);
    tokens.add(`t${q}${y}`);
    tokens.add(`q${q}${y}`);
  }

  const mYear = norm.match(/\b(20\d{2})\b/);
  if (mYear) tokens.add(mYear[1]);
  return [...tokens].filter(Boolean);
}

function columnMatchesPeriod(label, key, periodRaw) {
  const tokens = periodTokensFromInput(periodRaw);
  if (!tokens.length) return true;
  const ln = normForMatch(label).replace(/\s+/g, "");
  const kn = normForMatch(key).replace(/\s+/g, "");
  return tokens.some((tok) => ln.includes(tok) || kn.includes(tok));
}

function buildCostImputationToolPayload({
  file,
  meta,
  metaLines,
  amountHeaders,
  amountHeaderLabels,
  sourceRows,
  matchCount,
  extra = {}
}) {
  const amountColumns = amountHeaders.map((key, i) => ({
    key,
    label: amountHeaderLabels[i] || key
  }));
  return {
    file,
    meta,
    metaLines,
    amountColumns,
    interpretationNote:
      "Cada fila té `amounts`: valors numèrics per columna d'import. `amountColumns[].label` és el text de capçalera al CSV (sovint indica període o concepte). " +
      "Per comparar trimestres (ex. T1 2025 vs T1 2026), identifica quina columna correspon a cada període als `label` de amountColumns o a metaLines; no inventis períodes que no surtin al CSV. " +
      "Això és cost/imputació (P&L intern), no compres de proveïdors.",
    matchCount,
    rows: sourceRows.map((r) => ({
      label: r.label,
      line: r.line,
      amounts: r.amounts,
      valuesByColumn: amountHeaders.map((key, i) => ({
        key,
        headerLabel: amountHeaderLabels[i] || key,
        value: r.amounts[key] ?? null
      }))
    })),
    ...extra
  };
}

/**
 * Primers centres/departaments de l’informe d’imputació (sense filtre).
 * Útil quan l’usuari demana vista per tots els departaments o no en cita cap de concret.
 */
export async function getCostImputationOverview({ limit = 40 } = {}) {
  const { meta, metaLines, rows, amountHeaders, amountHeaderLabels } = await loadCostImputation();
  const file = await resolveCostReportFileName();
  const lim = Math.min(80, Math.max(1, Number(limit || 40)));
  const slice = rows.slice(0, lim);
  return buildCostImputationToolPayload({
    file,
    meta,
    metaLines,
    amountHeaders,
    amountHeaderLabels,
    sourceRows: slice,
    matchCount: rows.length,
    extra: {
      overview: true,
      totalRowCount: rows.length,
      returnedRowCount: slice.length,
      truncatedList: rows.length > lim,
      sourceFinanceKind: resolvedCostReportKind
    }
  });
}

export async function searchCostImputation({ contains, limit = 25 }) {
  const term = String(contains || "").trim();
  if (!term) {
    throw new Error('Cal "contains" (text a cercar, ex. marketing, logistica, rh).');
  }
  const { meta, metaLines, rows, amountHeaders, amountHeaderLabels } = await loadCostImputation();
  const file = await resolveCostReportFileName();
  const matched = rows.filter((r) => rowMatchesCostSearch(r.label, term));
  const lim = Math.min(80, Math.max(1, Number(limit || 25)));
  const slice = matched.slice(0, lim);
  return buildCostImputationToolPayload({
    file,
    meta,
    metaLines,
    amountHeaders,
    amountHeaderLabels,
    sourceRows: slice,
    matchCount: matched.length,
    extra: {
      ...(matched.length > lim ? { truncatedMatches: matched.length - lim } : {}),
      sourceFinanceKind: resolvedCostReportKind
    }
  });
}

export async function getCostByDepartmentPeriod({
  departmentContains,
  period,
  topRows = 20
} = {}) {
  const department = String(departmentContains || "").trim();
  if (!department) {
    throw new Error('Cal "departmentContains" (ex. marketing, logística, RH).');
  }
  const periodRaw = String(period || "").trim();
  if (!periodRaw) {
    throw new Error('Cal "period" (ex. 2026-02, 2026-Q1, T1 2026 o 2026).');
  }

  const { meta, metaLines, rows, amountHeaders, amountHeaderLabels } = await loadCostImputation();
  const file = await resolveCostReportFileName();
  const matchedRows = rows.filter((r) => rowMatchesCostSearch(r.label, department));
  const periodColumns = amountHeaders
    .map((key, i) => ({ key, label: amountHeaderLabels[i] || key }))
    .filter((c) => columnMatchesPeriod(c.label, c.key, periodRaw));

  if (!periodColumns.length) {
    return {
      file,
      meta,
      metaLines,
      sourceFinanceKind: resolvedCostReportKind,
      departmentContains: department,
      period,
      matchCount: matchedRows.length,
      totalRowsScanned: rows.length,
      totalAmount: 0,
      periodColumns: [],
      rows: [],
      warning:
        "No s'ha trobat cap columna d'import que coincideixi amb el període indicat. Revisa amountColumns/labels amb costs_imputation_overview."
    };
  }

  const rowsWithTotals = matchedRows.map((r) => {
    let subtotal = 0;
    for (const col of periodColumns) subtotal += Number(r.amounts[col.key] || 0);
    return {
      label: r.label,
      line: r.line,
      totalForPeriod: subtotal,
      valuesByColumn: periodColumns.map((col) => ({
        key: col.key,
        headerLabel: col.label,
        value: r.amounts[col.key] ?? null
      }))
    };
  });

  const sortedRows = rowsWithTotals.sort((a, b) => b.totalForPeriod - a.totalForPeriod);
  const lim = Math.min(60, Math.max(1, Number(topRows || 20)));
  const sliced = sortedRows.slice(0, lim);
  const totalAmount = rowsWithTotals.reduce((acc, r) => acc + Number(r.totalForPeriod || 0), 0);

  return {
    file,
    meta,
    metaLines,
    sourceFinanceKind: resolvedCostReportKind,
    departmentContains: department,
    period,
    periodColumns,
    matchCount: rowsWithTotals.length,
    totalRowsScanned: rows.length,
    totalAmount,
    returnedRows: sliced.length,
    truncatedRows: rowsWithTotals.length > lim ? rowsWithTotals.length - lim : 0,
    rows: sliced,
    interpretationNote:
      "Resultat determinista d'imputació de costos: suma només les columnes de període que coincideixen amb el filtre. No és compra de proveïdors."
  };
}
