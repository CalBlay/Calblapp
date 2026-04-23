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

/**
 * Nom del CSV d'imputació: FINANCE_COST_CSV si està definit; si no, el primer .csv
 * del mateix origen que readCsvText(..., "costos") que parsegi com a informe (fila "Importe bruto").
 */
export async function resolveCostReportFileName() {
  if (resolvedCostReportFileName) return resolvedCostReportFileName;

  const explicit = process.env.FINANCE_COST_CSV?.trim();
  if (explicit) {
    resolvedCostReportFileName = explicit;
    return explicit;
  }

  const names = await listFinanceCsvFilesForKind("costos");
  if (names.length === 0) {
    throw new Error(
      "No hi ha cap .csv de costos al directori configurat (FINANCE_CSV_DIR o, amb FINANCE_SUBFOLDERS, la subcarpeta costos / GCS_FINANCE_BASE/…/costos). " +
        "Afegeix l'informe d'imputació o defineix FINANCE_COST_CSV amb el nom del fitxer."
    );
  }

  const scoreName = (n) => {
    const l = n.toLowerCase();
    if (l.includes("imputaci")) return 0;
    if (l.includes("cost")) return 1;
    return 2;
  };
  const sorted = [...names].sort((a, b) => {
    const d = scoreName(a) - scoreName(b);
    return d !== 0 ? d : a.localeCompare(b);
  });

  for (const name of sorted) {
    try {
      const raw = await readCsvText(name, "costos");
      parseCostImputationCsv(raw);
      resolvedCostReportFileName = name;
      return name;
    } catch {
      /* següent candidat */
    }
  }

  throw new Error(
    `No s'ha detectat cap CSV d'imputació vàlid (fila amb «Importe bruto») entre: ${sorted.join(", ")}. ` +
      "Posa el fitxer correcte a la carpeta de costos o defineix FINANCE_COST_CSV amb el nom exacte."
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

function findAmountHeaderRow(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const cells = normalizeCsvLine(lines[i]);
    const idx = cells.findIndex((c) =>
      stripCsvCell(c).toLowerCase().includes("importe bruto")
    );
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
      "No s'ha trobat la fila amb 'Importe bruto'. Aquest CSV no sembla un informe d'imputació de costos."
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
  const fileName = await resolveCostReportFileName();
  const raw = await readCsvText(fileName, "costos");
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
      truncatedList: rows.length > lim
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
    extra: matched.length > lim ? { truncatedMatches: matched.length - lim } : {}
  });
}
