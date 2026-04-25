import {
  listFinanceCsvFilesForKind,
  normalizeArticleNameForMatch,
  normalizeCsvLineDelimited,
  normalizeCsvLine,
  parseAmountLike,
  readCsvText,
  stripCsvCell
} from "./finances.service.js";

/** Evita tornar a escanejar el directori en cada crida d'eina. */
let resolvedCostReportFileName = null;
/** Subcarpeta/origen on viu el fitxer (costos | rh), p.ex. RRHH amb cost salarial. */
let resolvedCostReportKind = null;
/** Cache per període (YYYY-MM) quan es resol fitxer específic. */
const resolvedCostReportByPeriod = new Map();

function costReportCacheDisabled() {
  return String(process.env.FINANCE_COST_REPORT_CACHE_DISABLED || "").match(/^(1|true|yes)$/i);
}

/**
 * Nom del CSV d'imputació: FINANCE_COST_CSV si està definit; si no, el primer fitxer vàlid
 * a les carpetes costos i rh (RRHH / recursos_humans) que parsegi com a informe (fila Importe bruto / Import brut).
 */
export async function resolveCostReportFileName() {
  return resolveCostReportFileNameForPeriod("");
}

function parseYearMonthFromPeriod(periodRaw) {
  const s = String(periodRaw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (!s) return null;
  const mIso = s.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (mIso) return { year: mIso[1], month: mIso[2] };
  const mMy = s.match(/\b(0[1-9]|1[0-2])[-/](20\d{2}|\d{2})\b/);
  if (mMy) {
    const yy = mMy[2].length === 2 ? `20${mMy[2]}` : mMy[2];
    return { year: yy, month: mMy[1] };
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
  const mName = s.match(
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\b.*\b(20\d{2})\b/i
  );
  if (!mName) return null;
  const mm = monthMap[mName[1].toLowerCase()];
  if (!mm) return null;
  return { year: mName[2], month: mm };
}

function filenameMatchesPeriod(name, ym) {
  if (!ym) return false;
  const n = String(name || "").toLowerCase();
  const y = ym.year;
  const m = ym.month;
  return (
    n.includes(`${m}_${y}`) ||
    n.includes(`${m}-${y}`) ||
    n.includes(`${y}_${m}`) ||
    n.includes(`${y}-${m}`) ||
    n.includes(`${m}${y}`) ||
    n.includes(`${y}${m}`)
  );
}

export async function resolveCostReportFileNameForPeriod(periodRaw = "") {
  const ym = parseYearMonthFromPeriod(periodRaw);
  const periodKey = ym ? `${ym.year}-${ym.month}` : "";
  if (periodKey && resolvedCostReportByPeriod.has(periodKey) && !costReportCacheDisabled()) {
    const hit = resolvedCostReportByPeriod.get(periodKey);
    resolvedCostReportFileName = hit.name;
    resolvedCostReportKind = hit.kind;
    return hit.name;
  }
  if (!periodKey && resolvedCostReportFileName && resolvedCostReportKind && !costReportCacheDisabled()) {
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
    const pA = filenameMatchesPeriod(a.name, ym) ? 0 : 1;
    const pB = filenameMatchesPeriod(b.name, ym) ? 0 : 1;
    if (pA !== pB) return pA - pB;
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
      if (periodKey) resolvedCostReportByPeriod.set(periodKey, { name, kind });
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

function detectCostCsvDelimiter(lines) {
  const sample = Array.isArray(lines) ? lines.slice(0, 25) : [];
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    for (const ln of sample) {
      const cells = normalizeCsvLineDelimited(ln, d);
      // Prefer delimiters producing multi-column rows with recognizable header tokens.
      if (cells.length > 1) score += 1;
      if (cells.some((c) => cellIsAmountHeaderLabel(c))) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function splitCostCsvLine(line, delimiter) {
  if (!delimiter || delimiter === ",") return normalizeCsvLine(line);
  return normalizeCsvLineDelimited(line, delimiter);
}

function findAmountHeaderRow(lines) {
  const delimiter = detectCostCsvDelimiter(lines);
  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitCostCsvLine(lines[i], delimiter);
    const idx = cells.findIndex((c) => cellIsAmountHeaderLabel(c));
    if (idx >= 0) return { rowIndex: i, amountStart: idx, cells, delimiter };
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
    const cells = splitCostCsvLine(lines[i], head.delimiter);
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
    const cells = splitCostCsvLine(lines[i], head.delimiter);
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

function parsePnlCostMatrixCsv(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error("CSV buit");
  const header = normalizeCsvLine(lines[0]).map(stripCsvCell);
  const headerNorm = header.map((h) => normForMatch(h));
  const idxDesc = headerNorm.findIndex((h) => h === "description" || h === "descripcio");
  const idxTotal = headerNorm.findIndex((h) => h === "total");
  if (idxDesc < 0 || idxTotal < 0) {
    throw new Error("No és un CSV P&L de costos (falten columnes description/total).");
  }
  const amountHeaders = ["total"];
  const amountHeaderLabels = ["total"];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = normalizeCsvLine(lines[i]).map(stripCsvCell);
    const label = String(cells[idxDesc] || "").trim();
    if (!label) continue;
    const total = parseAmountLike(cells[idxTotal] || "");
    rows.push({
      label,
      amounts: { total },
      line: i + 1
    });
  }
  return {
    meta: {
      title: "P&L cost matrix",
      period: "",
      empresa: ""
    },
    metaLines: [],
    amountHeaders,
    amountHeaderLabels,
    rows,
    format: "pnl_cost_matrix"
  };
}

function parseCostCsvWithFallback(raw) {
  try {
    const out = parseCostImputationCsv(raw);
    return { ...out, format: "imputation" };
  } catch {
    return parsePnlCostMatrixCsv(raw);
  }
}

export async function loadCostImputation() {
  await resolveCostReportFileNameForPeriod("");
  const fileName = resolvedCostReportFileName;
  const kind = resolvedCostReportKind || "costos";
  if (!fileName) throw new Error("Cost imputation: fitxer no resolt");
  const raw = await readCsvText(fileName, kind);
  return parseCostCsvWithFallback(raw);
}

export async function loadCostImputationForPeriod(periodRaw = "") {
  await resolveCostReportFileNameForPeriod(periodRaw);
  const fileName = resolvedCostReportFileName;
  const kind = resolvedCostReportKind || "costos";
  if (!fileName) throw new Error("Cost imputation: fitxer no resolt");
  const raw = await readCsvText(fileName, kind);
  return parseCostCsvWithFallback(raw);
}

const COST_SEARCH_TYPOS = {
  maqueting: "marketing",
  maketing: "marketing",
  marqueting: "marketing",
  marketingfes: "marketing",
  marketinf: "marketing",
  marketin: "marketing",
  subminstramtnets: "subministraments",
  subminstraments: "subministraments",
  submintraments: "subministraments",
  suministraments: "subministraments",
  suministros: "subministraments"
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

const MONTH_ALIASES = {
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

const QUARTER_WORDS = {
  primer: "1",
  primertrimestre: "1",
  t1: "1",
  q1: "1",
  segon: "2",
  segondotrimestre: "2",
  segundo: "2",
  t2: "2",
  q2: "2",
  tercer: "3",
  t3: "3",
  q3: "3",
  quart: "4",
  cuarto: "4",
  t4: "4",
  q4: "4"
};

function normalizedDepartmentFilter(raw) {
  const base = normForMatch(raw);
  if (!base) return "";
  const keywords = [
    "marketing",
    "logistica",
    "subministr",
    "suministr",
    "recursos humans",
    "recursos humanos",
    "rh",
    "rrhh",
    "transport",
    "compres",
    "compras",
    "produccio",
    "produccion"
  ];
  for (const k of keywords) {
    if (base.includes(k)) return k.startsWith("suministr") ? "subministr" : k;
  }
  return base;
}

function periodTokensFromInput(periodRaw) {
  const t = String(periodRaw || "").trim();
  if (!t) return [];
  const normWords = normForMatch(t);
  const norm = normWords.replace(/\s+/g, "");
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
  const mQuarterAT = norm.match(/\b(20\d{2})[-_]?t([1-4])\b/);
  if (mQuarterAT) {
    const y = mQuarterAT[1];
    const q = mQuarterAT[2];
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

  const mMonthName = normWords.match(
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\b.*\b(20\d{2})\b/i
  );
  if (mMonthName) {
    const mm = MONTH_ALIASES[mMonthName[1].toLowerCase()];
    const yy = mMonthName[2];
    if (mm) {
      tokens.add(`${yy}-${mm}`);
      tokens.add(`${yy}${mm}`);
    }
  }

  const mQuarterWords = normWords.match(
    /\b(primer|segon|segundo|tercer|quart|cuarto|t[1-4]|q[1-4])\b.*\btrimestre\b.*\b(20\d{2})\b/i
  );
  if (mQuarterWords) {
    const q = QUARTER_WORDS[mQuarterWords[1].toLowerCase()];
    const y = mQuarterWords[2];
    if (q) {
      tokens.add(`${y}q${q}`);
      tokens.add(`t${q}${y}`);
      tokens.add(`q${q}${y}`);
    }
  }

  const mYear = norm.match(/\b(20\d{2})\b/);
  if (mYear) tokens.add(mYear[1]);
  return [...tokens].filter(Boolean);
}

export function __periodTokensFromInputForTest(periodRaw) {
  return periodTokensFromInput(periodRaw);
}

function columnMatchesPeriod(label, key, periodRaw) {
  const tokens = periodTokensFromInput(periodRaw);
  if (!tokens.length) return true;
  const ln = normForMatch(label).replace(/\s+/g, "");
  const kn = normForMatch(key).replace(/\s+/g, "");
  return tokens.some((tok) => ln.includes(tok) || kn.includes(tok));
}

function pickPreferredTotalColumn(periodColumns) {
  const cols = Array.isArray(periodColumns) ? periodColumns : [];
  if (!cols.length) return null;
  const norm = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();

  const byTotal = cols.find((c) => /\btotal\b/.test(norm(c.label)));
  if (byTotal) return byTotal;
  const byOp = cols.find((c) => /\boperacio?n\b/.test(norm(c.label)));
  if (byOp) return byOp;
  const byImputation = cols.find((c) => /\bimputacio?n\b/.test(norm(c.label)));
  if (byImputation) return byImputation;
  return null;
}

function periodMentionedInMeta(metaLines, periodRaw) {
  const tokens = periodTokensFromInput(periodRaw);
  if (!tokens.length) return false;
  const joined = (Array.isArray(metaLines) ? metaLines : [])
    .map((x) => normForMatch(x).replace(/\s+/g, ""))
    .join(" ");
  if (!joined) return false;

  // Token directes (YYYY, YYYYMM, YYYYQ1, T12026...)
  if (tokens.some((tok) => joined.includes(tok))) return true;

  // Cas típic "Del 01/01/2026 al 31/03/2026": inferim trimestres naturals.
  const m = joined.match(/del(\d{1,2})\/(\d{1,2})\/(20\d{2}).*al(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);
  if (!m) return false;
  const startMonth = Number(m[2]);
  const startYear = Number(m[3]);
  const endMonth = Number(m[5]);
  const endYear = Number(m[6]);
  if (!Number.isFinite(startMonth) || !Number.isFinite(endMonth)) return false;
  if (startYear !== endYear) return false;

  const quarter =
    startMonth >= 1 && startMonth <= 3 && endMonth <= 3
      ? 1
      : startMonth >= 4 && startMonth <= 6 && endMonth <= 6
        ? 2
        : startMonth >= 7 && startMonth <= 9 && endMonth <= 9
          ? 3
          : startMonth >= 10 && startMonth <= 12 && endMonth <= 12
            ? 4
            : null;
  if (!quarter) return false;
  const qTokens = [`${startYear}q${quarter}`, `q${quarter}${startYear}`, `t${quarter}${startYear}`];
  return tokens.some((tok) => qTokens.includes(tok));
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
  const { meta, metaLines, rows, amountHeaders, amountHeaderLabels } = await loadCostImputationForPeriod("");
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
  financeKindPreferred,
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

  const deptFilter = normalizedDepartmentFilter(department);
  const forcedKind =
    String(financeKindPreferred || "")
      .trim()
      .toLowerCase() === "rh"
      ? "rh"
      : String(financeKindPreferred || "")
            .trim()
            .toLowerCase() === "costos"
        ? "costos"
        : "";
  let parsed;
  let file;
  if (forcedKind) {
    const ym = parseYearMonthFromPeriod(periodRaw);
    const names = await listFinanceCsvFilesForKind(forcedKind);
    const sorted = [...names].sort((a, b) => {
      const pA = filenameMatchesPeriod(a, ym) ? 0 : 1;
      const pB = filenameMatchesPeriod(b, ym) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });
    let picked = null;
    for (const name of sorted) {
      try {
        const raw = await readCsvText(name, forcedKind);
        const out = parseCostCsvWithFallback(raw);
        picked = { name, out };
        break;
      } catch {
        // try next candidate
      }
    }
    if (picked) {
      file = picked.name;
      parsed = picked.out;
      resolvedCostReportFileName = picked.name;
      resolvedCostReportKind = forcedKind;
      if (ym) resolvedCostReportByPeriod.set(`${ym.year}-${ym.month}`, { name: picked.name, kind: forcedKind });
    }
  }
  if (!parsed) {
  if (/\bsubministr\b/.test(deptFilter)) {
    // For subministraments, force c.explotacio/costos files (never RH cost-salary exports).
    const ym = parseYearMonthFromPeriod(periodRaw);
    const costosNames = await listFinanceCsvFilesForKind("costos");
    const sorted = [...costosNames].sort((a, b) => {
      const pA = filenameMatchesPeriod(a, ym) ? 0 : 1;
      const pB = filenameMatchesPeriod(b, ym) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });
    let picked = null;
    for (const name of sorted) {
      try {
        const raw = await readCsvText(name, "costos");
        const out = parseCostCsvWithFallback(raw);
        picked = { name, out };
        break;
      } catch {
        // keep trying until a valid costos file parses
      }
    }
    if (picked) {
      file = picked.name;
      parsed = picked.out;
      resolvedCostReportFileName = picked.name;
      resolvedCostReportKind = "costos";
      if (ym) resolvedCostReportByPeriod.set(`${ym.year}-${ym.month}`, { name: picked.name, kind: "costos" });
    } else {
      parsed = await loadCostImputationForPeriod(periodRaw);
      file = await resolveCostReportFileNameForPeriod(periodRaw);
    }
  } else {
    parsed = await loadCostImputationForPeriod(periodRaw);
    file = await resolveCostReportFileNameForPeriod(periodRaw);
  }
  }
  const { meta, metaLines, rows, amountHeaders, amountHeaderLabels, format } = parsed;
  let matchedRows = rows.filter((r) => rowMatchesCostSearch(r.label, deptFilter));
  if (!matchedRows.length && /\bsubministr\b/.test(deptFilter)) {
    // Fallback explícit per categories de subministraments amb etiquetes variants.
    matchedRows = rows.filter((r) => /\b(submin|sumin)/.test(normForMatch(r.label)));
  }
  if (/\bsubministr\b/.test(deptFilter)) {
    // Inclou subcategories habituals de subministraments quan no venen etiquetades com "subministraments".
    const utilityRows = rows.filter((r) =>
      /\b(submin|sumin|electric|llum|luz|aigua|agua|gas)\b/.test(normForMatch(r.label))
    );
    if (utilityRows.length) {
      const seen = new Set(matchedRows.map((r) => String(r.line)));
      for (const r of utilityRows) {
        const k = String(r.line);
        if (!seen.has(k)) {
          matchedRows.push(r);
          seen.add(k);
        }
      }
    }
  }
  if (!matchedRows.length) {
    return {
      file,
      meta,
      metaLines,
      sourceFinanceKind: resolvedCostReportKind,
      departmentContains: department,
      period,
      matchCount: 0,
      totalRowsScanned: rows.length,
      totalAmount: 0,
      periodColumns: [],
      rows: [],
      warning:
        "No s'ha trobat cap fila de cost que coincideixi amb el filtre de departament/categoria indicat. Això NO implica necessàriament cost 0 global; revisa el text de filtre o usa costs_imputation_overview per veure els labels disponibles."
    };
  }
  let periodColumns = amountHeaders
    .map((key, i) => ({ key, label: amountHeaderLabels[i] || key }))
    .filter((c) => columnMatchesPeriod(c.label, c.key, periodRaw));

  // Si el fitxer ja és monoperíode (dates al meta) i les columnes són genèriques
  // ("Import brut", "Imputació"...), fem servir totes les columnes d'import.
  if (!periodColumns.length && periodMentionedInMeta(metaLines, periodRaw)) {
    periodColumns = amountHeaders.map((key, i) => ({ key, label: amountHeaderLabels[i] || key }));
  }
  if (!periodColumns.length && format === "pnl_cost_matrix") {
    // Monthly c.explotacio files expose direct "total" column (period is encoded in filename).
    periodColumns = amountHeaders.map((key, i) => ({ key, label: amountHeaderLabels[i] || key }));
  }

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
    const totalColumn = pickPreferredTotalColumn(periodColumns);
    let subtotal = 0;
    if (totalColumn) {
      subtotal = Number(r.amounts[totalColumn.key] || 0);
    } else {
      for (const col of periodColumns) subtotal += Number(r.amounts[col.key] || 0);
    }
    return {
      label: r.label,
      line: r.line,
      totalForPeriod: subtotal,
      totalColumnUsed: totalColumn ? totalColumn.label : null,
      aggregationMode: totalColumn ? "preferred_total_column" : "sum_all_period_columns",
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
    aggregationMode: rowsWithTotals[0]?.aggregationMode || "sum_all_period_columns",
    totalColumnUsed: rowsWithTotals[0]?.totalColumnUsed || null,
    returnedRows: sliced.length,
    truncatedRows: rowsWithTotals.length > lim ? rowsWithTotals.length - lim : 0,
    rows: sliced,
    normalizedDepartmentFilter: deptFilter,
    interpretationNote:
      "Resultat determinista d'imputació de costos: suma només les columnes de període que coincideixen amb el filtre. No és compra de proveïdors."
  };
}
