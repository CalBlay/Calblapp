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

function foldAscii(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function centreMatchesNeedle(centre, needle) {
  const c = foldAscii(centre);
  const n = foldAscii(needle);
  return n.length > 0 && c.includes(n);
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

  const idxArticle =
    pickIdx([
      "article",
      "articles",
      "nom_article",
      "producte",
      "concepte",
      "descripcio",
      "descripcion",
      "descripción"
    ]) ??
    findHeaderIndexFuzzy(
      headersMap,
      (k) =>
        k === "article" ||
        (k.includes("article") && !k.includes("base") && !k.includes("codi"))
    );

  return {
    idxCentre,
    idxJornada,
    idxCobrades: idxAmount,
    idxUnitats,
    idxArticle
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

async function scanVendesCsvTopArticlesByCentre(
  fileName,
  { yearFilter, centreNeedle, bucket, stats }
) {
  const input = openFinanceCsvStream(fileName, "vendes");
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let csvDelimiter = ",";
  let headerResolved = false;
  let idxCentre;
  let idxJornada;
  let idxCobrades;
  let idxUnitats;
  let idxArticle;
  let dataRows = 0;
  let skippedNoMonth = 0;
  let skippedCentre = 0;

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
        if (
          idx.idxCentre === undefined ||
          idx.idxJornada === undefined ||
          idx.idxCobrades === undefined ||
          idx.idxArticle === undefined
        ) {
          const found = headers.filter(Boolean).slice(0, 50).join(" | ");
          throw new Error(
            `CSV vendes: calen columnes centre, jornada, import (cobrades/brut) i article (producte). Capçaleres: ${found}`
          );
        }
        idxCentre = idx.idxCentre;
        idxJornada = idx.idxJornada;
        idxCobrades = idx.idxCobrades;
        idxUnitats = idx.idxUnitats;
        idxArticle = idx.idxArticle;
        headerResolved = true;
        continue;
      }

      const fields = normalizeCsvLineDelimited(line, csvDelimiter);
      const centreRaw = fields[idxCentre] ?? "";
      const centre = stripCsvCell(centreRaw) || "(sense centre)";
      if (!centreMatchesNeedle(centre, centreNeedle)) {
        skippedCentre += 1;
        continue;
      }

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

      const article = stripCsvCell(fields[idxArticle] ?? "") || "(sense article)";
      const cobrades = parseAmountLike(fields[idxCobrades] ?? "");
      const unitats =
        idxUnitats !== undefined ? parseQtyLike(fields[idxUnitats] ?? "") : 0;

      const cur = bucket.get(article) || { cobrades: 0, unitats: 0, lines: 0 };
      cur.cobrades += cobrades;
      cur.unitats += unitats;
      cur.lines += 1;
      bucket.set(article, cur);
      dataRows += 1;
    }
  } finally {
    rl.close();
  }

  stats.push({
    file: fileName,
    dataRows,
    skippedNoMonth,
    skippedCentre
  });
}

/**
 * Rànquing d’articles (vendes) per import o unitats dins els centres el nom dels quals conté centreContains (ex. NAUTIC).
 */
export async function aggregateVendesTopArticlesByEstablishment(opts = {}) {
  const centreNeedle = String(opts.centreContains ?? opts.centre ?? "").trim();
  if (!centreNeedle) {
    throw new Error("Cal centreContains (fragment del nom del centre, ex. NAUTIC)");
  }

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
      ranking: "top_articles_by_establishment",
      centreFilter: centreNeedle,
      yearFilter: yearFilter ?? null,
      filesScanned: [],
      fileErrors: [],
      top: [],
      note: "No s’han trobat fitxers a la carpeta vendes (local o GCS). Revisa FINANCE_CSV_DIR, FINANCE_SUBFOLDERS, FINANCE_PATH_VENDES i que el desplegament tingui els mateixos fitxers que el teu OneDrive."
    };
  }

  const cap = Math.min(40, Math.max(1, Number(opts.topN || 15)));
  const metric = opts.metric != null ? String(opts.metric) : "amount";

  const bucket = new Map();
  const perFileStats = [];
  const fileErrors = [];

  for (const fn of files) {
    try {
      await scanVendesCsvTopArticlesByCentre(fn, {
        yearFilter,
        centreNeedle,
        bucket,
        stats: perFileStats
      });
    } catch (e) {
      fileErrors.push({ file: fn, error: e.message || String(e) });
    }
  }

  const useQty = metric.toLowerCase() === "quantity";
  const arr = Array.from(bucket.entries()).map(([article, v]) => ({
    article,
    cobradesEUR: roundMoney(v.cobrades),
    unitats: roundMoney(v.unitats),
    lineCount: v.lines
  }));

  arr.sort((a, b) => (useQty ? b.unitats - a.unitats : b.cobradesEUR - a.cobradesEUR));

  return {
    kind: "vendes",
    ranking: "top_articles_by_establishment",
    centreFilter: centreNeedle,
    yearFilter: yearFilter ?? null,
    metric: useQty ? "unitats" : "cobrades_eur",
    filesScanned: perFileStats,
    fileErrors,
    distinctArticles: arr.length,
    top: arr.slice(0, cap),
    note:
      "Articles agregats per nom (columna Article/producte) només en files on la columna Centre conté el text indicat (sense distingir majúscules ni accents)."
  };
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
      note: "No s’han trobat fitxers a vendes (.csv, .tsv o export sense extensió). Revisa FINANCE_CSV_DIR i la subcarpeta vendes (o el bucket GCS si FINANCE_SOURCE=gcs)."
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
