import fs from "fs/promises";
import path from "path";
import { listFinanceCsvFilesForKind } from "./finance-files.js";
import { normalizeCsvLineDelimited } from "./csv-lines.js";
import { parseAmountLike, stripCsvCell } from "./csv-cells.js";
import { readCsvText } from "./purchases-io.js";

function normalizeKey(s) {
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

function detectDelimiter(headerLine) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const c = normalizeCsvLineDelimited(headerLine, d).length;
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

function parseYearMonthInput(raw) {
  const s = String(raw || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
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
  if (mName) {
    const mm = monthMap[mName[1]];
    return `${mName[2]}-${mm}`;
  }
  return "";
}

export function __parseYearMonthInputForTest(raw) {
  return parseYearMonthInput(raw);
}

function matchPnlFileByMonth(files, yearMonth) {
  const [yyyy, mm] = yearMonth.split("-");
  const mmNoZero = String(Number(mm));
  const candidates = Array.isArray(files) ? files : [];
  const lowered = candidates.map((f) => ({ raw: f, low: String(f || "").toLowerCase() }));
  const probes = [`${mm}_${yyyy}`, `${mmNoZero}_${yyyy}`, `${yyyy}_${mm}`, `${yyyy}-${mm}`, `${mm}-${yyyy}`];
  for (const probe of probes) {
    const hit = lowered.find(({ low }) => low.includes(probe.toLowerCase()));
    if (hit) return hit.raw;
  }
  return candidates[0] || null;
}

export function __matchPnlFileByMonthForTest(files, yearMonth) {
  return matchPnlFileByMonth(files, yearMonth);
}

async function readDimension1NameMap() {
  const csvPath = path.resolve(process.cwd(), "config", "canonical_dictionary", "catalog_dimension_1.csv");
  let raw = "";
  try {
    raw = await fs.readFile(csvPath, "utf8");
  } catch {
    return new Map();
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Map();
  const delimiter = detectDelimiter(lines[0]);
  const headers = normalizeCsvLineDelimited(lines[0], delimiter).map(normalizeKey);
  const idxCode = headers.findIndex((h) => h === "dimension_1_code");
  const idxName = headers.findIndex((h) => h === "dimension_1_name");
  if (idxCode < 0 || idxName < 0) return new Map();
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cells = normalizeCsvLineDelimited(line, delimiter);
    const code = String(cells[idxCode] || "").trim().toUpperCase();
    const name = String(cells[idxName] || "").trim();
    if (code) out.set(code, name || code);
  }
  return out;
}

export async function getFinanceResultByLnMonth({
  yearMonth,
  file,
  rowLabelContains = "RESULTAT FINANCER",
  lnContains = ""
} = {}) {
  const ym = parseYearMonthInput(yearMonth);
  if (!ym) throw new Error("Cal yearMonth vàlid (YYYY-MM o mes+any, ex. gener 2026).");

  const available = await listFinanceCsvFilesForKind("costos");
  if (!available.length) {
    return {
      kind: "costos_pnl",
      yearMonth: ym,
      rowLabelContains,
      filesAvailable: [],
      note: "No s'han trobat fitxers a la carpeta costos/c.explotacio."
    };
  }

  const targetFile = file && String(file).trim() ? String(file).trim() : matchPnlFileByMonth(available, ym);
  if (!targetFile) {
    return {
      kind: "costos_pnl",
      yearMonth: ym,
      rowLabelContains,
      filesAvailable: available,
      note: `No he trobat fitxer P&L per ${ym}.`
    };
  }
  const raw = await readCsvText(targetFile, "costos");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) throw new Error(`Fitxer P&L buit: ${targetFile}`);

  const header = lines[0].replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(header);
  const headers = normalizeCsvLineDelimited(header, delimiter).map((h) => stripCsvCell(h));
  const headersNorm = headers.map(normalizeKey);
  const idxDesc = headersNorm.findIndex((h) => h === "description" || h === "descripcio" || h === "descripcion");
  const idxLnCols = headersNorm
    .map((h, i) => ({ h, i }))
    .filter((x) => /^ln\d{5}$/i.test(x.h))
    .map((x) => ({ code: x.h.toUpperCase(), idx: x.i }));
  if (idxDesc < 0 || !idxLnCols.length) {
    throw new Error("CSV P&L: falten columnes description i/o LN00000..LNxxxxx.");
  }

  const rowNeedle = normalizeKey(rowLabelContains || "RESULTAT FINANCER");
  let matchedRow = null;
  for (const line of lines.slice(1)) {
    const cells = normalizeCsvLineDelimited(line, delimiter);
    const desc = stripCsvCell(cells[idxDesc] || "");
    if (!desc) continue;
    if (normalizeKey(desc).includes(rowNeedle)) {
      matchedRow = { desc, cells };
      break;
    }
  }
  if (!matchedRow) {
    return {
      kind: "costos_pnl",
      file: targetFile,
      yearMonth: ym,
      rowLabelContains,
      filesAvailable: available,
      note: `No he trobat cap fila que coincideixi amb "${rowLabelContains}".`
    };
  }

  const lnNameMap = await readDimension1NameMap();
  const byLnAll = idxLnCols.map((c) => {
    const v = parseAmountLike(matchedRow.cells[c.idx] ?? "");
    return {
      lnCode: c.code,
      lnName: lnNameMap.get(c.code) || c.code,
      amount: Math.round(v * 100) / 100
    };
  });
  const totalAmount = Math.round(byLnAll.reduce((acc, x) => acc + Number(x.amount || 0), 0) * 100) / 100;
  const needle = normalizeKey(lnContains || "");
  const byLnFiltered = needle
    ? byLnAll.filter((x) => normalizeKey(x.lnCode).includes(needle) || normalizeKey(x.lnName).includes(needle))
    : byLnAll;
  const selectedAmount = Math.round(byLnFiltered.reduce((acc, x) => acc + Number(x.amount || 0), 0) * 100) / 100;

  return {
    kind: "costos_pnl",
    file: targetFile,
    yearMonth: ym,
    rowLabel: matchedRow.desc,
    rowLabelContains,
    lnContains: lnContains || null,
    byLn: byLnFiltered.sort((a, b) => b.amount - a.amount),
    byLnAll: byLnAll.sort((a, b) => b.amount - a.amount),
    selectedAmount,
    totalAmount,
    filesAvailable: available
  };
}
