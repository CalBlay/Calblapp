import readline from "node:readline";
import { findHeaderIndexFuzzy, normalizeHeaderKey } from "./csv-columns.js";
import { parseAmountLike, parseQtyLike, stripCsvCell } from "./csv-cells.js";
import { normalizeCsvLineDelimited } from "./csv-lines.js";
import { listFinanceCsvFilesForKind } from "./finance-files.js";
import { openFinanceCsvStream } from "./purchases-io.js";
import { safeCsvFileName } from "./paths.js";

/**
 * Exemples: "2026-01 enero", "2026-01", "2026-01-15".
 * @returns {string|null} YYYY-MM
 */
export function parseVendesJornadaYearMonth(raw) {
  const s = stripCsvCell(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{4}-\d{2}\b/.test(s)) return s.slice(0, 7);
  return null;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function resolveVendesColumnIndices(headersMap) {
  const pickIdx = (candidates) => {
    for (const key of candidates) {
      const nk = normalizeHeaderKey(key);
      const idx = headersMap.get(nk);
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const idxCentre =
    pickIdx(["centre", "center", "centro", "establishment", "local", "establiment"]) ??
    findHeaderIndexFuzzy(
      headersMap,
      (k) =>
        k === "centre" ||
        k.startsWith("centre_") ||
        (k.includes("centre") && !k.includes("cost") && !k.includes("prove"))
    );

  const idxJornada =
    pickIdx([
      "jornada",
      "periode",
      "período",
      "mes",
      "mes_any",
      "month",
      "data_jornada",
      "periode_comercial"
    ]) ??
    findHeaderIndexFuzzy(
      headersMap,
      (k) => k.includes("jornada") || (k.includes("mes") && !k.includes("trimestre"))
    );

  const idxCobrades =
    pickIdx([
      "cobrades",
      "cobrats",
      "total_cobrat",
      "import_cobrat",
      "facturacio",
      "facturación"
    ]) ??
    findHeaderIndexFuzzy(headersMap, (k) => k.includes("cobrad"));

  const idxBrut = pickIdx(["brut", "bruto", "import_brut", "base_imposable"]);

  const idxUnitats =
    pickIdx(["unitats", "quantitat", "qty", "units", "unitats_vendides"]) ??
    findHeaderIndexFuzzy(headersMap, (k) => k.includes("unitat") && !k.includes("preu"));

  const idxAmount = idxCobrades ?? idxBrut;

  return {
    idxCentre,
    idxJornada,
    idxCobrades: idxAmount,
    idxUnitats
  };
}

async function scanVendesCsvForAggregate(fileName, yearFilter, bucket, stats) {
  const input = openFinanceCsvStream(fileName, "vendes");
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let csvDelimiter = ",";
  let headerResolved = false;
  let idxCentre;
  let idxJornada;
  let idxCobrades;
  let idxUnitats;
  let dataRows = 0;
  let skippedNoMonth = 0;

  try {
    for await (const line of rl) {
      if (!line || line.length === 0) continue;
      if (!headerResolved) {
        const headerLine = line.replace(/^\uFEFF/, "");
        let headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        if (headers.length <= 1 && headerLine.includes(";")) {
          csvDelimiter = ";";
          headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        }
        const headersMap = new Map(headers.map((h, i) => [normalizeHeaderKey(h), i]));
        const idx = resolveVendesColumnIndices(headersMap);
        if (idx.idxCentre === undefined || idx.idxJornada === undefined || idx.idxCobrades === undefined) {
          const found = headers.filter(Boolean).slice(0, 50).join(" | ");
          throw new Error(
            `CSV vendes sense columnes centre / jornada / import (cobrades o brut). Capçaleres: ${found}`
          );
        }
        idxCentre = idx.idxCentre;
        idxJornada = idx.idxJornada;
        idxCobrades = idx.idxCobrades;
        idxUnitats = idx.idxUnitats;
        headerResolved = true;
        continue;
      }

      const fields = normalizeCsvLineDelimited(line, csvDelimiter);
      const centreRaw = fields[idxCentre] ?? "";
      const centre = stripCsvCell(centreRaw) || "(sense centre)";
      const ym = parseVendesJornadaYearMonth(fields[idxJornada] ?? "");
      if (!ym) {
        skippedNoMonth += 1;
        continue;
      }
      if (
        yearFilter !== undefined &&
        yearFilter !== null &&
        Number.isFinite(yearFilter) &&
        !ym.startsWith(`${yearFilter}-`)
      ) {
        continue;
      }

      const cobrades = parseAmountLike(fields[idxCobrades] ?? "");
      const unitats =
        idxUnitats !== undefined ? parseQtyLike(fields[idxUnitats] ?? "") : 0;

      const key = `${centre}\t${ym}`;
      const cur = bucket.get(key) || { cobrades: 0, unitats: 0, lines: 0 };
      cur.cobrades += cobrades;
      cur.unitats += unitats;
      cur.lines += 1;
      bucket.set(key, cur);
      dataRows += 1;
    }
  } finally {
    rl.close();
  }

  stats.push({
    file: fileName,
    dataRows,
    skippedNoMonth
  });
}

/**
 * Agrega CSV(s) de la carpeta vendes per centre i mes natural (columna jornada → YYYY-MM).
 * @param {{ year?: number, file?: string }} opts — file = nom d’un .csv dins vendes; si falta, tots els .csv
 */
export async function aggregateSalesByCentreMonth(opts = {}) {
  const yearRaw = opts.year;
  const yNum = Number(yearRaw);
  const yearFilter =
    yearRaw !== undefined && yearRaw !== null && Number.isFinite(yNum) && yNum >= 2000 && yNum <= 2100
      ? yNum
      : undefined;

  let files;
  if (opts.file && String(opts.file).trim() !== "") {
    files = [safeCsvFileName(String(opts.file).trim())];
  } else {
    files = await listFinanceCsvFilesForKind("vendes");
  }

  if (!files.length) {
    return {
      kind: "vendes",
      metric: "cobrades_eur",
      yearFilter: yearFilter ?? null,
      filesScanned: [],
      fileErrors: [],
      rows: [],
      byCentre: [],
      byMonth: [],
      grandTotalCobrades: 0,
      grandTotalUnitats: 0,
      note: "No hi ha cap fitxer .csv a la carpeta vendes (revisa FINANCE_CSV_DIR, FINANCE_SUBFOLDERS i FINANCE_PATH_VENDES)."
    };
  }

  const bucket = new Map();
  const perFileStats = [];
  const fileErrors = [];

  for (const fn of files) {
    try {
      await scanVendesCsvForAggregate(fn, yearFilter, bucket, perFileStats);
    } catch (e) {
      fileErrors.push({ file: fn, error: e.message || String(e) });
    }
  }

  const rows = Array.from(bucket.entries()).map(([k, v]) => {
    const tab = k.indexOf("\t");
    const centre = tab >= 0 ? k.slice(0, tab) : k;
    const yearMonth = tab >= 0 ? k.slice(tab + 1) : "";
    return {
      centre,
      yearMonth,
      cobradesEUR: roundMoney(v.cobrades),
      unitats: roundMoney(v.unitats),
      lineCount: v.lines
    };
  });

  rows.sort((a, b) => a.centre.localeCompare(b.centre, "ca") || a.yearMonth.localeCompare(b.yearMonth));

  const centreMap = new Map();
  const monthMap = new Map();
  let grandTotalCobrades = 0;
  let grandTotalUnitats = 0;

  for (const r of rows) {
    grandTotalCobrades += r.cobradesEUR;
    grandTotalUnitats += r.unitats;
    centreMap.set(r.centre, (centreMap.get(r.centre) || 0) + r.cobradesEUR);
    monthMap.set(r.yearMonth, (monthMap.get(r.yearMonth) || 0) + r.cobradesEUR);
  }

  const byCentre = Array.from(centreMap.entries())
    .map(([centre, cobradesEUR]) => ({ centre, cobradesEUR: roundMoney(cobradesEUR) }))
    .sort((a, b) => b.cobradesEUR - a.cobradesEUR);

  const byMonth = Array.from(monthMap.entries())
    .map(([yearMonth, cobradesEUR]) => ({ yearMonth, cobradesEUR: roundMoney(cobradesEUR) }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  return {
    kind: "vendes",
    metric: "cobrades_eur (suma columna cobrades o, si no existeix, brut)",
    yearFilter: yearFilter ?? null,
    filesScanned: perFileStats,
    fileErrors,
    rowCount: rows.length,
    rows,
    byCentre,
    byMonth,
    grandTotalCobrades: roundMoney(grandTotalCobrades),
    grandTotalUnitats: roundMoney(grandTotalUnitats)
  };
}
