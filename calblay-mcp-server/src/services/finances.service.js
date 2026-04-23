import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Evita carregar @google-cloud/storage (grpc) a l'arrencada si només useu fitxers locals. */
function loadStorageClass() {
  return require("@google-cloud/storage").Storage;
}

const DEFAULT_FINANCE_DIR =
  "C:\\Users\\PORTATIL126\\OneDrive - Cal Blay\\Escritorio\\Finances\\_clean_exports";

const PURCHASES_CSV = "Consulta_Factura_per_linia__Sheet1.csv";

function getFinanceDir() {
  return process.env.FINANCE_CSV_DIR || DEFAULT_FINANCE_DIR;
}

function getFinanceSource() {
  const explicit = process.env.FINANCE_SOURCE;
  if (explicit && String(explicit).trim() !== "") {
    return String(explicit).toLowerCase();
  }
  // Cloud Run: amb bucket configurat, no usar mai el path Windows per defecte.
  if (process.env.GCS_BUCKET) return "gcs";
  return "local";
}

function getGcsPrefix() {
  return String(process.env.GCS_FINANCE_PREFIX || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** Mode carpetes: finances/compres, finances/costos, … (local i GCS). */
function isFinanceSubfolderLayout() {
  const v = String(process.env.FINANCE_SUBFOLDERS || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getGcsFinanceBase() {
  return String(process.env.GCS_FINANCE_BASE || "finances")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * Nom de subcarpeta dins FINANCE_CSV_DIR / dins GCS_FINANCE_BASE.
 * kind: compres | costos | vendes | rh
 */
export function financeKindSegment(kind) {
  const k = String(kind || "compres").toLowerCase();
  const envMap = {
    compres: process.env.FINANCE_PATH_COMPRES,
    costos: process.env.FINANCE_PATH_COSTOS,
    vendes: process.env.FINANCE_PATH_VENDES,
    rh: process.env.FINANCE_PATH_RH
  };
  const defaults = {
    compres: "compres",
    costos: "costos",
    vendes: "vendes",
    rh: "recursos_humans"
  };
  return String(envMap[k] || defaults[k] || defaults.compres)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function resolveLocalFinanceFilePath(fileName, kind = "compres") {
  const safe = safeCsvFileName(fileName);
  const root = path.resolve(getFinanceDir());
  const sub = isFinanceSubfolderLayout() ? financeKindSegment(kind) : "";
  const full = sub ? path.join(root, sub, safe) : path.join(root, safe);
  if (!full.startsWith(root)) {
    throw new Error("Invalid file path");
  }
  return full;
}

function getGooglePrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function getStorageClient() {
  const Storage = loadStorageClass();
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = getGooglePrivateKey();

  if (projectId && clientEmail && privateKey) {
    return new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey
      }
    });
  }

  // Fallback to default Google credentials if available in runtime.
  return new Storage();
}

function getGcsBucketName() {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("Missing GCS_BUCKET");
  return bucket;
}

function safeCsvFileName(fileName) {
  const safe = path.basename(String(fileName || "").trim());
  if (!safe || !safe.toLowerCase().endsWith(".csv")) {
    throw new Error("Invalid CSV file name");
  }
  return safe;
}

/** Clau GCS; amb FINANCE_SUBFOLDERS=true usa GCS_FINANCE_BASE + carpeta per kind. */
function buildGcsObjectName(fileName, kind = "compres") {
  const safe = safeCsvFileName(fileName);
  if (!isFinanceSubfolderLayout()) {
    const prefix = getGcsPrefix();
    return prefix ? `${prefix}/${safe}` : safe;
  }
  const base = getGcsFinanceBase();
  const seg = financeKindSegment(kind);
  return `${base}/${seg}/${safe}`.replace(/\/+/g, "/");
}

/** Excel/SAP (Europa) sovint exporten en Windows-1252 / ISO-8859-1, no UTF-8. */
function getFinanceCsvEncoding() {
  const e = String(process.env.FINANCE_CSV_ENCODING || "utf8").trim().toLowerCase();
  if (
    ["latin1", "iso-8859-1", "iso8859-1", "windows-1252", "cp1252", "ansi"].includes(e)
  ) {
    return "latin1";
  }
  return "utf8";
}

function openPurchasesCsvStream() {
  const safeName = safeCsvFileName(PURCHASES_CSV);
  const source = getFinanceSource();
  const enc = getFinanceCsvEncoding();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const objectName = buildGcsObjectName(safeName, "compres");
    const stream = bucket.file(objectName).createReadStream();
    stream.setEncoding(enc);
    return stream;
  }
  const fullPath = resolveLocalFinanceFilePath(safeName, "compres");
  return createReadStream(fullPath, { encoding: enc });
}

/**
 * Excel/SAP: espais → _; accents NFKD; caràcters estranys (UTF-8 mal llegit) → _.
 * Això fa coincidir "Nom proveïdor" amb nom_proveidor i suporta capçaleres amb �.
 */
function normalizeHeaderKey(raw) {
  let s = String(raw || "").replace(/^\uFEFF/, "").trim();
  s = s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  s = s.replace(/\uFFFD/g, "_").replace(/\s+/g, "_");
  s = s.replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return s;
}

function findHeaderIndexFuzzy(headersMap, predicate) {
  for (const [k, idx] of headersMap) {
    if (predicate(k)) return idx;
  }
  return undefined;
}

/** Mapa clau normalitzada → índex de columna (objecte pla per passar a les callbacks). */
function keyMapFromHeadersMap(headersMap) {
  return Object.fromEntries(headersMap);
}

/**
 * Resol el nom de columna que envia l'usuari/model contra les claus reals del CSV.
 */
/** Àlies per al model / controller: dim1 = LN, dim2 = centre (mateixes columnes que al CSV SAP). */
const PURCHASE_COLUMN_ALIAS_GROUPS = [
  ["ln", "dim1", "dimensio_1", "dimension_1", "linia_negoci", "linia_de_negoci", "linea_negocio"],
  ["dim2", "dimensio_2", "dimension_2", "centre", "centre_cost", "centre_de_cost", "centro"]
];

function resolveColumnIndexFromKeyMap(keyMap, requested) {
  if (!requested || !keyMap) return undefined;
  const nk = normalizeHeaderKey(String(requested));
  if (keyMap[nk] !== undefined) return keyMap[nk];

  for (const group of PURCHASE_COLUMN_ALIAS_GROUPS) {
    if (!group.includes(nk)) continue;
    for (const alias of group) {
      if (keyMap[alias] !== undefined) return keyMap[alias];
    }
    const keys = Object.keys(keyMap);
    for (const alias of group) {
      const hit = keys.find((hk) => hk === alias || hk.includes(alias) || alias.includes(hk));
      if (hit !== undefined) return keyMap[hit];
    }
  }

  const keys = Object.keys(keyMap);
  const hits = keys.filter((hk) => hk === nk || hk.includes(nk) || nk.includes(hk));
  if (hits.length === 1) return keyMap[hits[0]];
  if (hits.length > 1) {
    const exact = hits.find((h) => h === nk);
    if (exact !== undefined) return keyMap[exact];
    hits.sort((a, b) => Math.abs(a.length - nk.length) - Math.abs(b.length - nk.length));
    return keyMap[hits[0]];
  }
  return undefined;
}

function cellContainsHayNeedle(hay, needle) {
  const h = normalizeArticleNameForMatch(hay);
  const n = normalizeArticleNameForMatch(needle);
  return n.length > 0 && h.includes(n);
}

function normalizeCellTight(v) {
  return stripCsvCell(v).toLowerCase().replace(/\s+/g, "");
}

/**
 * mode: contains | equals | starts_with | gte | lte (gte/lte amb parseAmountLike per import/quantitat).
 */
function evaluateSearchCondition(cellValue, mode, needle) {
  const m = String(mode || "contains").toLowerCase();
  const cell = stripCsvCell(cellValue);
  if (m === "equals" || m === "eq") {
    return (
      normalizeArticleNameForMatch(cell) === normalizeArticleNameForMatch(needle) ||
      cell.trim().toLowerCase() === String(needle).trim().toLowerCase() ||
      normalizeCellTight(cell) === normalizeCellTight(needle)
    );
  }
  if (m === "starts_with" || m === "starts") {
    return normalizeArticleNameForMatch(cell).startsWith(normalizeArticleNameForMatch(needle));
  }
  if (m === "gte" || m === ">=") {
    return parseAmountLike(cell) >= parseAmountLike(needle);
  }
  if (m === "lte" || m === "<=") {
    return parseAmountLike(cell) <= parseAmountLike(needle);
  }
  return cellContainsHayNeedle(cell, needle);
}

function compareDateRange(dateStr, from, to) {
  const d = stripCsvCell(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return !(from || to);
  }
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * Recorre el CSV de compres línia a línia (sense carregar el fitxer sencer a memòria).
 */
async function scanPurchasesLines(onRow) {
  const input = openPurchasesCsvStream();
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headerLine = null;
  let csvDelimiter = ",";
  try {
    for await (const line of rl) {
      if (!line || line.length === 0) continue;
      if (!headerLine) {
        headerLine = line.replace(/^\uFEFF/, "");
        let headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        if (headers.length <= 1 && headerLine.includes(";")) {
          csvDelimiter = ";";
          headers = normalizeCsvLineDelimited(headerLine, csvDelimiter);
        }
        const headersMap = new Map(
          headers.map((h, idx) => [normalizeHeaderKey(h), idx])
        );
        /** SAP / export sovint usa proveidor sense ï; altres fitxers amb català correcte usen proveïdor. */
        const pickIdx = (candidates) => {
          for (const key of candidates) {
            const idx = headersMap.get(key);
            if (idx !== undefined) return idx;
          }
          return undefined;
        };
        const idxSupplier =
          pickIdx([
            "nom_proveïdor",
            "nom_proveidor",
            "nom_de_proveïdor",
            "nom_de_proveidor",
            "proveïdor",
            "proveidor",
            "nom_prove_dor",
            "nom_provedor"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("nom_") && k.includes("prove") && k.endsWith("dor")
          );
        const idxCode =
          pickIdx([
            "codi_proveïdor",
            "codi_proveidor",
            "codi_de_proveïdor",
            "codi_de_proveidor",
            "codi_prove_dor",
            "codi_provedor"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("codi_") && k.includes("prove") && k.endsWith("dor")
          );
        const idxArticle = pickIdx([
          "nom_article",
          "article",
          "descripció",
          "descripcio",
          "descripcion",
          "nom_articulo"
        ]);
        const idxArticleCode =
          pickIdx([
            "codi_article",
            "codi_articulo",
            "article_code",
            "codi_art",
            "sku"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.startsWith("codi_") && k.includes("article")
          );
        const idxPreuUnitari =
          pickIdx([
            "preu_unitari",
            "preu_unitari_eur",
            "precio_unitario",
            "pvp_unitari"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) => k.includes("preu") && k.includes("unit")
          );
        const idxAmount = pickIdx(["import", "import_eur", "import_total"]);
        const idxQty = pickIdx(["quantitat", "qty", "unitats"]);
        const idxDate = pickIdx([
          "data_comptable",
          "data_document",
          "data",
          "data_factura",
          "data_doc"
        ]);
        const dim1Override = process.env.FINANCE_PURCHASES_DIM1_COLUMN?.trim();
        const dim2Override = process.env.FINANCE_PURCHASES_DIM2_COLUMN?.trim();
        const idxDim1 =
          (dim1Override ? pickIdx([normalizeHeaderKey(dim1Override)]) : undefined) ??
          pickIdx([
            "dimensio_1",
            "dimension_1",
            "dimensio1",
            "dimension1",
            "dim_1",
            "dim1"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) =>
              k.includes("dimensio_1") ||
              k.includes("dimension_1") ||
              (k.includes("linia") && k.includes("negoci")) ||
              (k.includes("linea") && k.includes("negocio"))
          );
        const idxDim2 =
          (dim2Override ? pickIdx([normalizeHeaderKey(dim2Override)]) : undefined) ??
          pickIdx([
            "dimensio_2",
            "dimension_2",
            "dimensio2",
            "dimension2",
            "dim_2",
            "dim2"
          ]) ??
          findHeaderIndexFuzzy(
            headersMap,
            (k) =>
              k.includes("dimensio_2") ||
              k.includes("dimension_2") ||
              k === "centre" ||
              (k.startsWith("centre_") && !k.includes("prove")) ||
              k === "center"
          );
        if (idxSupplier === undefined) {
          const found = headers.filter(Boolean).slice(0, 40);
          throw new Error(
            `CSV sense columna reconeixible de nom de proveïdor (esperat p.ex. nom_proveïdor / "Nom proveïdor"). Capçaleres: ${found.join(" | ")}`
          );
        }
        const cont = await onRow({
          phase: "header",
          headers,
          idx: {
            idxSupplier,
            idxCode,
            idxArticle,
            idxArticleCode,
            idxPreuUnitari,
            idxAmount,
            idxQty,
            idxDate,
            idxDim1,
            idxDim2,
            columnIndexByKey: keyMapFromHeadersMap(headersMap)
          }
        });
        if (cont === false) break;
        continue;
      }
      const fields = normalizeCsvLineDelimited(line, csvDelimiter);
      const cont = await onRow({ phase: "data", fields });
      if (cont === false) break;
    }
  } finally {
    rl.close();
  }
}

export function parseAmountLike(v) {
  let s = String(v ?? "")
    .trim()
    .replace(/€|\$/g, "")
    .replace(/\s/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseQtyLike(v) {
  let s = String(v ?? "").trim().replace(/€|\$/g, "").replace(/\s/g, "");
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function rowYearFromDate(dateStr) {
  const s = String(dateStr || "").trim().replace(/^"|"$/g, "");
  if (s.length >= 4 && s[4] === "-") {
    const y = Number(s.slice(0, 4));
    return Number.isFinite(y) ? y : null;
  }
  return null;
}

/** Retorna "YYYY-MM" si la data ve com a ISO o comença per YYYY-MM-DD. */
function rowYearMonthFromDate(dateStr) {
  const s = String(dateStr || "").trim().replace(/^"|"$/g, "");
  if (s.length >= 7 && s[4] === "-" && s[6] !== undefined) {
    const ym = s.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) return ym;
  }
  return null;
}

export function stripCsvCell(v) {
  return String(v ?? "")
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, "");
}

export function normalizeArticleNameForMatch(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Llegeix un CSV de finances.
 * @param {"compres"|"costos"|"vendes"|"rh"} [kind="compres"] — carpeta si FINANCE_SUBFOLDERS=true
 */
export async function readCsvText(fileName, kind = "compres") {
  const enc = getFinanceCsvEncoding();
  const source = getFinanceSource();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const objectName = buildGcsObjectName(fileName, kind);
    const [buffer] = await bucket.file(objectName).download();
    return buffer.toString(enc);
  }

  const fullPath = resolveLocalFinanceFilePath(fileName, kind);
  return fs.readFile(fullPath, enc);
}

export function normalizeCsvLineDelimited(line, delimiter = ",") {
  const out = [];
  let current = "";
  let inQuotes = false;
  const d = String(delimiter || ",").slice(0, 1);

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === d && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function normalizeCsvLine(line) {
  return normalizeCsvLineDelimited(line, ",");
}

/**
 * Llista fitxers .csv al mateix origen que readCsvText(..., kind).
 * kind: compres | costos | vendes | rh
 */
export async function listFinanceCsvFilesForKind(kind = "compres") {
  const source = getFinanceSource();
  const k = String(kind || "compres").toLowerCase();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const prefix = isFinanceSubfolderLayout()
      ? `${getGcsFinanceBase()}/${financeKindSegment(k)}`
      : getGcsPrefix();
    const [files] = await bucket.getFiles(prefix ? { prefix: `${prefix}/` } : undefined);
    return files
      .map((f) => f.name)
      .filter((name) => name.toLowerCase().endsWith(".csv"))
      .map((name) => path.posix.basename(name))
      .sort((a, b) => a.localeCompare(b));
  }

  const financeDir = path.resolve(getFinanceDir());
  const listDir = isFinanceSubfolderLayout()
    ? path.join(financeDir, financeKindSegment(k))
    : financeDir;
  let items;
  try {
    items = await fs.readdir(listDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return items
    .filter((item) => item.isFile() && item.name.toLowerCase().endsWith(".csv"))
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function listFinanceCsvFiles() {
  return listFinanceCsvFilesForKind("compres");
}

export async function previewFinanceCsv(fileName, maxRows = 20) {
  if (!fileName || String(fileName).trim() === "") throw new Error("Missing file query param");
  const safeName = safeCsvFileName(fileName);
  const raw = await readCsvText(safeName);
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { file: safeName, headers: [], rows: [] };
  }

  const headers = normalizeCsvLine(lines[0]);
  const rows = lines.slice(1, 1 + Number(maxRows || 20)).map((line) => normalizeCsvLine(line));

  return {
    file: safeName,
    totalRowsApprox: Math.max(0, lines.length - 1),
    headers,
    rows
  };
}

export async function getPurchasesBySupplier(supplierName, limit = 200) {
  const term = String(supplierName || "").trim().toLowerCase();
  if (!term) throw new Error("Missing supplierName");

  const cap = Number(limit || 200);
  const matched = [];
  let idxMeta = null;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const {
      idxSupplier,
      idxCode,
      idxArticle,
      idxAmount,
      idxQty,
      idxDate
    } = idxMeta;
    const supplier = String(f[idxSupplier] || "");
    const code = idxCode !== undefined ? String(f[idxCode] || "").trim().toLowerCase() : "";
    const hit =
      supplier.toLowerCase().includes(term) || (term && code === term);
    if (!hit) return true;
    matched.push({
      supplier,
      supplierCode: idxCode !== undefined ? String(f[idxCode] || "") : "",
      article: idxArticle !== undefined ? String(f[idxArticle] || "") : "",
      amount: idxAmount !== undefined ? String(f[idxAmount] || "") : "",
      quantity: idxQty !== undefined ? String(f[idxQty] || "") : "",
      date: idxDate !== undefined ? String(f[idxDate] || "") : ""
    });
    return matched.length < cap;
  });

  return {
    supplierQuery: supplierName,
    count: matched.length,
    rows: matched
  };
}

/**
 * Agregació ràpida (una passada): quantitat i import totals per proveïdor i any.
 * Accepta codi (ex. P003004) o text al nom.
 */
export async function getPurchasesSupplierYearSummary({
  year,
  supplierCode,
  supplierName
}) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    throw new Error("year invàlid");
  }
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal supplierCode o supplierName");
  }

  let idxMeta = null;
  let totalQty = 0;
  let totalAmount = 0;
  let lines = 0;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const { idxSupplier, idxCode, idxAmount, idxQty, idxDate } = idxMeta;
    const dateStr = idxDate !== undefined ? String(f[idxDate] || "") : "";
    if (rowYearFromDate(dateStr) !== y) return true;

    const sup = String(f[idxSupplier] || "");
    const code = idxCode !== undefined ? String(f[idxCode] || "").trim().toLowerCase() : "";

    const codeHit = codeTerm && code === codeTerm;
    const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
    if (!codeHit && !nameHit) return true;

    totalQty += parseQtyLike(idxQty !== undefined ? f[idxQty] : 0);
    totalAmount += parseAmountLike(idxAmount !== undefined ? f[idxAmount] : 0);
    lines += 1;
    return true;
  });

  return {
    year: y,
    supplierCode: supplierCode || null,
    supplierName: supplierName || null,
    invoiceLinesMatched: lines,
    totalQuantity: Math.round(totalQty * 10000) / 10000,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

/** Inici (inclòs) i fi (inclòs) d'un trimestre natural 1–4 en YYYY-MM-DD. */
function quarterToDateRange(year, quarter) {
  const y = Number(year);
  const q = Number(quarter);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    throw new Error("year invàlid");
  }
  if (!Number.isFinite(q) || q < 1 || q > 4) {
    throw new Error("quarter ha de ser 1–4");
  }
  const firstMonth0 = (q - 1) * 3;
  const lastMonth0 = firstMonth0 + 2;
  const pad = (n) => String(n).padStart(2, "0");
  const dateFrom = `${y}-${pad(firstMonth0 + 1)}-01`;
  const lastDay = new Date(Date.UTC(y, lastMonth0 + 1, 0)).getUTCDate();
  const dateTo = `${y}-${pad(lastMonth0 + 1)}-${pad(lastDay)}`;
  return { dateFrom, dateTo };
}

/**
 * Agregació per article (preu mig ponderat = import total / quantitat total) per proveïdor i interval de dates.
 */
export async function getPurchasesSupplierArticlePeriodSummary({
  supplierCode,
  supplierName,
  dateFrom,
  dateTo
}) {
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal supplierCode (ex. P003004) o supplierName");
  }
  const df = dateFrom ? String(dateFrom).trim().slice(0, 10) : "";
  const dt = dateTo ? String(dateTo).trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
    throw new Error("dateFrom i dateTo han de ser YYYY-MM-DD");
  }

  let idxMeta = null;
  /** @type {Map<string, { articleCode: string, articleName: string, lines: number, totalQty: number, totalAmount: number }>} */
  const byArt = new Map();

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;

    const dateStr = m.idxDate !== undefined ? String(f[m.idxDate] || "") : "";
    if (!compareDateRange(dateStr, df, dt)) return true;

    const sup = String(f[m.idxSupplier] || "");
    const code = m.idxCode !== undefined ? String(f[m.idxCode] || "").trim().toLowerCase() : "";
    const codeHit = codeTerm && code === codeTerm;
    const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
    if (!codeHit && !nameHit) return true;

    const nomArt = m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArtRaw = m.idxArticleCode !== undefined ? stripCsvCell(f[m.idxArticleCode]) : "";
    const codiArt = codiArtRaw ? codiArtRaw.toLowerCase() : "";
    const artKey = codiArt ? `c:${codiArt}` : `n:${normalizeArticleNameForMatch(nomArt)}`;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);

    let rec = byArt.get(artKey);
    if (!rec) {
      rec = {
        articleCode: codiArtRaw || null,
        articleName: nomArt || null,
        lines: 0,
        totalQty: 0,
        totalAmount: 0
      };
      byArt.set(artKey, rec);
    }
    rec.lines += 1;
    rec.totalQty += qty;
    rec.totalAmount += amt;
    return true;
  });

  const articles = [...byArt.values()].map((r) => {
    const avg = r.totalQty > 0 && r.totalAmount !== 0 ? r.totalAmount / r.totalQty : 0;
    return {
      articleCode: r.articleCode,
      articleName: r.articleName,
      invoiceLines: r.lines,
      totalQuantity: Math.round(r.totalQty * 10000) / 10000,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
      avgUnitPrice: Math.round(avg * 10000) / 10000
    };
  });
  articles.sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  return {
    supplierCode: supplierCode ? String(supplierCode).trim() : null,
    supplierName: supplierName ? String(supplierName).trim() : null,
    dateFrom: df,
    dateTo: dt,
    articleCount: articles.length,
    articles
  };
}

function mergeKeyArticle(a) {
  const c = a.articleCode && String(a.articleCode).trim().toLowerCase();
  if (c) return `c:${c}`;
  return `n:${normalizeArticleNameForMatch(a.articleName || "")}`;
}

/**
 * Comparació de preus mitjans ponderats per article entre dos trimestres (mateix proveïdor).
 */
export async function comparePurchasesSupplierQuarters({
  supplierCode,
  supplierName,
  yearA,
  quarterA,
  yearB,
  quarterB
}) {
  const rA = quarterToDateRange(yearA, quarterA);
  const rB = quarterToDateRange(yearB, quarterB);
  const [sumA, sumB] = await Promise.all([
    getPurchasesSupplierArticlePeriodSummary({
      supplierCode,
      supplierName,
      dateFrom: rA.dateFrom,
      dateTo: rA.dateTo
    }),
    getPurchasesSupplierArticlePeriodSummary({
      supplierCode,
      supplierName,
      dateFrom: rB.dateFrom,
      dateTo: rB.dateTo
    })
  ]);

  const label = (y, q) => `${y}-Q${q}`;
  const pick = (x) =>
    x
      ? {
          invoiceLines: x.invoiceLines,
          totalQuantity: x.totalQuantity,
          totalAmount: x.totalAmount,
          avgUnitPrice: x.avgUnitPrice
        }
      : null;

  const keys = new Set([
    ...sumA.articles.map(mergeKeyArticle),
    ...sumB.articles.map(mergeKeyArticle)
  ]);
  const comparison = [];
  for (const k of keys) {
    const a = sumA.articles.find((x) => mergeKeyArticle(x) === k);
    const b = sumB.articles.find((x) => mergeKeyArticle(x) === k);
    const avgA = a?.avgUnitPrice;
    const avgB = b?.avgUnitPrice;
    let avgUnitPriceDelta = null;
    let avgUnitPriceDeltaPct = null;
    if (avgA != null && avgB != null && Number.isFinite(avgA) && Number.isFinite(avgB)) {
      avgUnitPriceDelta = Math.round((avgB - avgA) * 10000) / 10000;
      if (avgA !== 0) {
        avgUnitPriceDeltaPct = Math.round(((avgB - avgA) / avgA) * 10000) / 100;
      }
    }

    const qtyA = a?.totalQuantity;
    const qtyB = b?.totalQuantity;
    let quantityDelta = null;
    let quantityDeltaPct = null;
    if (
      qtyA != null &&
      qtyB != null &&
      Number.isFinite(qtyA) &&
      Number.isFinite(qtyB)
    ) {
      quantityDelta = Math.round((qtyB - qtyA) * 10000) / 10000;
      if (qtyA !== 0) {
        quantityDeltaPct = Math.round(((qtyB - qtyA) / qtyA) * 10000) / 100;
      }
    }

    const amtA = a?.totalAmount;
    const amtB = b?.totalAmount;
    let totalAmountDelta = null;
    let totalAmountDeltaPct = null;
    if (
      amtA != null &&
      amtB != null &&
      Number.isFinite(amtA) &&
      Number.isFinite(amtB)
    ) {
      totalAmountDelta = Math.round((amtB - amtA) * 100) / 100;
      if (amtA !== 0) {
        totalAmountDeltaPct = Math.round(((amtB - amtA) / amtA) * 10000) / 100;
      }
    }

    comparison.push({
      articleCode: a?.articleCode || b?.articleCode || null,
      articleName: a?.articleName || b?.articleName || null,
      periodA: pick(a),
      periodB: pick(b),
      avgUnitPriceDelta,
      avgUnitPriceDeltaPct,
      quantityDelta,
      quantityDeltaPct,
      totalAmountDelta,
      totalAmountDeltaPct
    });
  }
  comparison.sort((x, y) => {
    const maxX = Math.max(x.periodA?.totalAmount || 0, x.periodB?.totalAmount || 0);
    const maxY = Math.max(y.periodA?.totalAmount || 0, y.periodB?.totalAmount || 0);
    return maxY - maxX;
  });

  const la = label(yearA, quarterA);
  const lb = label(yearB, quarterB);
  const supLabel =
    (sumA.supplierCode || sumB.supplierCode || sumA.supplierName || sumB.supplierName || "")
      .toString()
      .trim() || "Proveïdor";

  const dash = "—";
  const fmtN = (n) =>
    n == null || !Number.isFinite(Number(n)) ? "" : String(Math.round(Number(n) * 100) / 100);
  const fmtPct = (n) =>
    n == null || !Number.isFinite(Number(n)) ? "" : `${Math.round(Number(n) * 100) / 100}%`;
  /** Cel·les per informe controller: buit = em dash; imports 2 decimals. */
  const cellQty = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 10000) / 10000).toFixed(4).replace(/\.?0+$/, "");
  const cellEu = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 100) / 100).toFixed(2);
  const cellDeltaEu = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : (Math.round(Number(n) * 100) / 100).toFixed(2);
  const cellPct = (n) =>
    n == null || !Number.isFinite(Number(n)) ? dash : `${(Math.round(Number(n) * 100) / 100).toFixed(2)}%`;

  const reportTable = {
    title: `Comparativa compres · ${supLabel} · ${la} vs ${lb}`,
    columns: [
      "Codi article",
      "Article",
      `Unitats (${la})`,
      `Unitats (${lb})`,
      "Δ Unitats (B−A)",
      "% var. unitats",
      `Preu mig EUR (${la})`,
      `Preu mig EUR (${lb})`,
      "Δ Preu mig (EUR)",
      "% var. preu mig",
      `Import EUR (${la})`,
      `Import EUR (${lb})`,
      "Δ Import (EUR)",
      "% var. import"
    ],
    rows: comparison.map((row) => [
      row.articleCode ?? "",
      row.articleName ?? "",
      cellQty(row.periodA?.totalQuantity),
      cellQty(row.periodB?.totalQuantity),
      cellQty(row.quantityDelta),
      cellPct(row.quantityDeltaPct),
      cellEu(row.periodA?.avgUnitPrice),
      cellEu(row.periodB?.avgUnitPrice),
      cellDeltaEu(row.avgUnitPriceDelta),
      cellPct(row.avgUnitPriceDeltaPct),
      cellEu(row.periodA?.totalAmount),
      cellEu(row.periodB?.totalAmount),
      cellDeltaEu(row.totalAmountDelta),
      cellPct(row.totalAmountDeltaPct)
    ])
  };

  const sumArticles = (arts) =>
    arts.reduce(
      (acc, x) => {
        acc.invoiceLines += x.invoiceLines || 0;
        acc.totalQuantity += x.totalQuantity || 0;
        acc.totalAmount += x.totalAmount || 0;
        return acc;
      },
      { invoiceLines: 0, totalQuantity: 0, totalAmount: 0 }
    );
  const aggA = sumArticles(sumA.articles);
  const aggB = sumArticles(sumB.articles);
  const aggQtyDelta =
    Math.round((aggB.totalQuantity - aggA.totalQuantity) * 10000) / 10000;
  const aggQtyPct =
    aggA.totalQuantity !== 0
      ? Math.round(((aggB.totalQuantity - aggA.totalQuantity) / aggA.totalQuantity) * 10000) /
        100
      : null;
  const aggAmtDelta = Math.round((aggB.totalAmount - aggA.totalAmount) * 100) / 100;
  const aggAmtPct =
    aggA.totalAmount !== 0
      ? Math.round(((aggB.totalAmount - aggA.totalAmount) / aggA.totalAmount) * 10000) / 100
      : null;

  const reportTotalsTable = {
    title: `Totals agregats (totes les línies d'article) · ${la} vs ${lb}`,
    columns: ["Mètrica", `Valor (${la})`, `Valor (${lb})`, "Δ (B−A)", "% variació"],
    rows: [
      [
        "Línies de factura",
        String(aggA.invoiceLines),
        String(aggB.invoiceLines),
        String(aggB.invoiceLines - aggA.invoiceLines),
        aggA.invoiceLines !== 0
          ? cellPct(((aggB.invoiceLines - aggA.invoiceLines) / aggA.invoiceLines) * 100)
          : dash
      ],
      [
        "Unitats comprades",
        cellQty(aggA.totalQuantity),
        cellQty(aggB.totalQuantity),
        cellQty(aggQtyDelta),
        cellPct(aggQtyPct)
      ],
      [
        "Import total (EUR)",
        cellEu(aggA.totalAmount),
        cellEu(aggB.totalAmount),
        cellDeltaEu(aggAmtDelta),
        cellPct(aggAmtPct)
      ]
    ]
  };

  const onlyInB = comparison.filter((c) => !c.periodA && c.periodB);
  const onlyInA = comparison.filter((c) => c.periodA && !c.periodB);
  const topImportSwing = [...comparison].sort(
    (a, b) => Math.abs(b.totalAmountDelta ?? 0) - Math.abs(a.totalAmountDelta ?? 0)
  );

  const highlights = [];
  highlights.push(
    `Origen: agregació de línies de compra (CSV). Període base ${la}, període comparat ${lb}. Proveïdor ${supLabel}.`
  );
  highlights.push(
    `Totals: ${cellQty(aggA.totalQuantity)} → ${cellQty(aggB.totalQuantity)} unitats; import ${cellEu(aggA.totalAmount)} → ${cellEu(aggB.totalAmount)} EUR (var. ${cellPct(aggAmtPct)} sobre base).`
  );
  if (onlyInB.length) {
    highlights.push(
      `Articles amb compra només a ${lb} (${onlyInB.length}): ${onlyInB
        .slice(0, 5)
        .map((c) => c.articleName || c.articleCode)
        .join("; ")}${onlyInB.length > 5 ? "…" : ""}.`
    );
  }
  if (onlyInA.length) {
    highlights.push(
      `Sense compra a ${lb} respecte ${la} (${onlyInA.length} referències): ${onlyInA
        .slice(0, 5)
        .map((c) => c.articleName || c.articleCode)
        .join("; ")}${onlyInA.length > 5 ? "…" : ""}.`
    );
  }
  for (const c of topImportSwing.slice(0, 3)) {
    if (
      c.periodA &&
      c.periodB &&
      c.avgUnitPriceDeltaPct != null &&
      Math.abs(c.avgUnitPriceDeltaPct) >= 25 &&
      (c.quantityDeltaPct == null || Math.abs(c.quantityDeltaPct) >= 15)
    ) {
      highlights.push(
        `${c.articleName || c.articleCode}: variació preu mig ${cellPct(c.avgUnitPriceDeltaPct)} i volum ${cellPct(c.quantityDeltaPct)}; interpretar conjuntament (possible mix de línies de factura o condicions comercials).`
      );
    }
  }
  highlights.push(
    "El preu mig ponderat és import total / quantitat total del període; no equival sempre al preu unitari d’una sola factura."
  );

  const chartArticles = [...comparison]
    .sort(
      (x, y) =>
        Math.max(y.periodA?.totalAmount ?? 0, y.periodB?.totalAmount ?? 0) -
        Math.max(x.periodA?.totalAmount ?? 0, x.periodB?.totalAmount ?? 0)
    )
    .slice(0, 12);

  const avgBlendA =
    aggA.totalQuantity > 0 ? aggA.totalAmount / aggA.totalQuantity : null;
  const avgBlendB =
    aggB.totalQuantity > 0 ? aggB.totalAmount / aggB.totalQuantity : null;
  let avgBlendDelta = null;
  let avgBlendDeltaPct = null;
  if (
    avgBlendA != null &&
    avgBlendB != null &&
    Number.isFinite(avgBlendA) &&
    Number.isFinite(avgBlendB)
  ) {
    avgBlendDelta = Math.round((avgBlendB - avgBlendA) * 10000) / 10000;
    if (avgBlendA !== 0) {
      avgBlendDeltaPct = Math.round(((avgBlendB - avgBlendA) / avgBlendA) * 10000) / 100;
    }
  }

  const kpis = [
    {
      id: "import_total",
      label: "Import total (EUR)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellEu(aggA.totalAmount),
      valueB: cellEu(aggB.totalAmount),
      delta: cellDeltaEu(aggAmtDelta),
      deltaPct: cellPct(aggAmtPct),
      format: "eur"
    },
    {
      id: "volume_units",
      label: "Volum (unitats)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellQty(aggA.totalQuantity),
      valueB: cellQty(aggB.totalQuantity),
      delta: cellQty(aggQtyDelta),
      deltaPct: cellPct(aggQtyPct),
      format: "qty"
    },
    {
      id: "invoice_lines",
      label: "Línies de factura",
      periodALabel: la,
      periodBLabel: lb,
      valueA: String(aggA.invoiceLines),
      valueB: String(aggB.invoiceLines),
      delta: String(aggB.invoiceLines - aggA.invoiceLines),
      deltaPct:
        aggA.invoiceLines !== 0
          ? cellPct(((aggB.invoiceLines - aggA.invoiceLines) / aggA.invoiceLines) * 100)
          : dash,
      format: "count"
    },
    {
      id: "sku_count",
      label: "Referències d’article (comptades)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: String(sumA.articleCount),
      valueB: String(sumB.articleCount),
      delta: String(sumB.articleCount - sumA.articleCount),
      deltaPct:
        sumA.articleCount !== 0
          ? cellPct(((sumB.articleCount - sumA.articleCount) / sumA.articleCount) * 100)
          : dash,
      format: "count"
    },
    {
      id: "avg_price_blended",
      label: "Preu mig ponderat global (EUR/unitat)",
      periodALabel: la,
      periodBLabel: lb,
      valueA: cellEu(avgBlendA),
      valueB: cellEu(avgBlendB),
      delta: cellDeltaEu(avgBlendDelta),
      deltaPct: cellPct(avgBlendDeltaPct),
      format: "eur"
    }
  ];

  const reportCalblay = {
    kpis,
    tables: [
      { title: reportTable.title, columns: reportTable.columns, rows: reportTable.rows },
      { title: reportTotalsTable.title, columns: reportTotalsTable.columns, rows: reportTotalsTable.rows }
    ],
    highlights: highlights.slice(0, 10),
    chart: {
      type: "bar",
      title: `Import total per article (EUR) · ${la} vs ${lb}`,
      xKey: "article",
      series: [
        { name: `Import ${la}`, dataKey: "importA" },
        { name: `Import ${lb}`, dataKey: "importB" }
      ],
      data: chartArticles.map((c) => ({
        article: String(c.articleCode || c.articleName || "—").slice(0, 28),
        importA: Number((c.periodA?.totalAmount ?? 0).toFixed(2)),
        importB: Number((c.periodB?.totalAmount ?? 0).toFixed(2))
      }))
    }
  };

  return {
    supplierCode: sumA.supplierCode || sumB.supplierCode,
    supplierName: sumA.supplierName || sumB.supplierName,
    periodA: {
      label: la,
      dateFrom: rA.dateFrom,
      dateTo: rA.dateTo,
      articleCount: sumA.articleCount,
      ...aggA,
      totalAmount: Math.round(aggA.totalAmount * 100) / 100,
      totalQuantity: Math.round(aggA.totalQuantity * 10000) / 10000
    },
    periodB: {
      label: lb,
      dateFrom: rB.dateFrom,
      dateTo: rB.dateTo,
      articleCount: sumB.articleCount,
      ...aggB,
      totalAmount: Math.round(aggB.totalAmount * 100) / 100,
      totalQuantity: Math.round(aggB.totalQuantity * 10000) / 10000
    },
    consolidated: {
      quantityDelta: aggQtyDelta,
      quantityDeltaPct: aggQtyPct,
      totalAmountDelta: aggAmtDelta,
      totalAmountDeltaPct: aggAmtPct
    },
    comparison,
    reportTable,
    reportTotalsTable,
    reportCalblay,
    note:
      "Preu mig ponderat = import total / quantitat total del període. B és el segon període (quarterB/yearB). " +
      "reportCalblay = bloc d’informe (taules + highlights + gràfic) generat al servidor; en mode informe la webapp el fusiona per evitar errors de transcripció."
  };
}

function articleRowMatches({ codeTerm, nameTerm, nomArt, codiArt }) {
  const codeHit = codeTerm && codiArt === codeTerm;
  if (codeHit) return true;
  if (!nameTerm) return false;
  const n = normalizeArticleNameForMatch(nomArt);
  if (!n) return false;
  if (n.includes(nameTerm)) return true;
  const tokens = nameTerm.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every((t) => n.includes(t));
}

/**
 * Línies de compra filtrades per article (codi exacte o nom parcial, sense accents).
 * yearMonth opcional "YYYY-MM" (es filtra per data_comptable / data_document).
 */
export async function getPurchasesByArticle({
  articleCode,
  articleName,
  yearMonth,
  limit = 40
}) {
  const codeTerm = articleCode
    ? normalizeArticleNameForMatch(stripCsvCell(articleCode)).replace(/\s/g, "")
    : "";
  const nameTerm = articleName
    ? normalizeArticleNameForMatch(stripCsvCell(articleName))
    : "";
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal articleCode o articleName");
  }
  const cap = Math.min(200, Math.max(1, Number(limit || 40)));
  const ym =
    yearMonth && String(yearMonth).trim()
      ? String(yearMonth).trim().slice(0, 7)
      : null;
  if (ym && !/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error("yearMonth ha de ser YYYY-MM");
  }

  let idxMeta = null;
  const rows = [];
  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;
    const nomArt =
      m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArt =
      m.idxArticleCode !== undefined
        ? stripCsvCell(f[m.idxArticleCode]).toLowerCase()
        : "";

    if (
      !articleRowMatches({
        codeTerm,
        nameTerm,
        nomArt,
        codiArt
      })
    ) {
      return true;
    }

    if (ym) {
      const ds = m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "";
      if (rowYearMonthFromDate(ds) !== ym) return true;
    }

    rows.push({
      date: m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "",
      supplier: m.idxSupplier !== undefined ? stripCsvCell(f[m.idxSupplier]) : "",
      supplierCode: m.idxCode !== undefined ? stripCsvCell(f[m.idxCode]) : "",
      articleCode: m.idxArticleCode !== undefined ? stripCsvCell(f[m.idxArticleCode]) : "",
      articleName: nomArt,
      quantity: m.idxQty !== undefined ? stripCsvCell(f[m.idxQty]) : "",
      unitPrice:
        m.idxPreuUnitari !== undefined ? stripCsvCell(f[m.idxPreuUnitari]) : "",
      amount: m.idxAmount !== undefined ? stripCsvCell(f[m.idxAmount]) : ""
    });
    return rows.length < cap;
  });

  return {
    articleCode: articleCode || null,
    articleName: articleName || null,
    yearMonth: ym,
    count: rows.length,
    rows
  };
}

/**
 * Resum d’un mes per article: línies, quantitat, import, preu mig ponderat (i min/max si hi ha preu unitari).
 */
export async function getPurchasesArticleMonthSummary({
  articleCode,
  articleName,
  yearMonth
}) {
  const ym = String(yearMonth || "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error("yearMonth obligatori (YYYY-MM)");
  }
  const codeTerm = articleCode
    ? normalizeArticleNameForMatch(stripCsvCell(articleCode)).replace(/\s/g, "")
    : "";
  const nameTerm = articleName
    ? normalizeArticleNameForMatch(stripCsvCell(articleName))
    : "";
  if (!codeTerm && !nameTerm) {
    throw new Error("Cal articleCode o articleName");
  }

  let idxMeta = null;
  let lines = 0;
  let totalQty = 0;
  let totalAmount = 0;
  let sumPriceQty = 0;
  let minP = Infinity;
  let maxP = -Infinity;

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;
    const nomArt =
      m.idxArticle !== undefined ? stripCsvCell(f[m.idxArticle]) : "";
    const codiArt =
      m.idxArticleCode !== undefined
        ? stripCsvCell(f[m.idxArticleCode]).toLowerCase()
        : "";

    if (
      !articleRowMatches({
        codeTerm,
        nameTerm,
        nomArt,
        codiArt
      })
    ) {
      return true;
    }

    const ds = m.idxDate !== undefined ? stripCsvCell(f[m.idxDate]) : "";
    if (rowYearMonthFromDate(ds) !== ym) return true;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);
    let pu = parseAmountLike(m.idxPreuUnitari !== undefined ? f[m.idxPreuUnitari] : 0);
    if (pu <= 0 && qty > 0 && amt > 0) pu = amt / qty;

    lines += 1;
    totalQty += qty;
    totalAmount += amt;
    if (qty > 0 && pu > 0) {
      sumPriceQty += pu * qty;
      minP = Math.min(minP, pu);
      maxP = Math.max(maxP, pu);
    }
    return true;
  });

  const avgUnit =
    totalQty > 0 && sumPriceQty > 0 ? sumPriceQty / totalQty : totalQty > 0 && totalAmount > 0
      ? totalAmount / totalQty
      : 0;

  return {
    yearMonth: ym,
    articleCode: articleCode || null,
    articleName: articleName || null,
    invoiceLinesMatched: lines,
    totalQuantity: Math.round(totalQty * 10000) / 10000,
    totalAmount: Math.round(totalAmount * 100) / 100,
    avgUnitPrice: Math.round(avgUnit * 10000) / 10000,
    minUnitPrice: minP === Infinity ? null : Math.round(minP * 10000) / 10000,
    maxUnitPrice: maxP === -Infinity ? null : Math.round(maxP * 10000) / 10000
  };
}

/**
 * Agregació per **Dimensió 1** (línia de negoci / LN) i **Dimensió 2** (centre), en una passada sobre el CSV de compres.
 * Opcionalment filtra per proveïdor (codi P###### o nom).
 */
export async function aggregatePurchasesByBusinessLineAndCentre({
  dateFrom,
  dateTo,
  supplierCode,
  supplierName
}) {
  const df = dateFrom ? String(dateFrom).trim().slice(0, 10) : "";
  const dt = dateTo ? String(dateTo).trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
    throw new Error("Cal dateFrom i dateTo (YYYY-MM-DD)");
  }
  const codeTerm = String(supplierCode || "").trim().toLowerCase();
  const nameTerm = String(supplierName || "").trim().toLowerCase();

  let idxMeta = null;
  let dim1Detected = false;
  let dim2Detected = false;
  const map = new Map();

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      idxMeta = row.idx;
      dim1Detected = row.idx.idxDim1 !== undefined;
      dim2Detected = row.idx.idxDim2 !== undefined;
      return true;
    }
    const f = row.fields;
    const m = idxMeta;
    if (!m) return true;

    const dateStr = m.idxDate !== undefined ? String(f[m.idxDate] || "") : "";
    if (!compareDateRange(dateStr, df, dt)) return true;

    if (codeTerm || nameTerm) {
      const sup = String(f[m.idxSupplier] || "");
      const code = m.idxCode !== undefined ? String(f[m.idxCode] || "").trim().toLowerCase() : "";
      const codeHit = codeTerm && code === codeTerm;
      const nameHit = nameTerm && sup.toLowerCase().includes(nameTerm);
      if (!codeHit && !nameHit) return true;
    }

    const d1 = m.idxDim1 !== undefined ? stripCsvCell(f[m.idxDim1]) : "";
    const d2 = m.idxDim2 !== undefined ? stripCsvCell(f[m.idxDim2]) : "";
    const k1 = d1 || "(sense dimensió 1)";
    const k2 = d2 || "(sense dimensió 2)";
    const key = `${k1}\t${k2}`;

    const qty = parseQtyLike(m.idxQty !== undefined ? f[m.idxQty] : 0);
    const amt = parseAmountLike(m.idxAmount !== undefined ? f[m.idxAmount] : 0);

    let rec = map.get(key);
    if (!rec) {
      rec = {
        lineOfBusiness: k1,
        centre: k2,
        invoiceLines: 0,
        totalQuantity: 0,
        totalAmount: 0
      };
      map.set(key, rec);
    }
    rec.invoiceLines += 1;
    rec.totalQuantity += qty;
    rec.totalAmount += amt;
    return true;
  });

  const byLnCentre = [...map.values()]
    .map((r) => ({
      lineOfBusiness: r.lineOfBusiness,
      centre: r.centre,
      invoiceLines: r.invoiceLines,
      totalQuantity: Math.round(r.totalQuantity * 10000) / 10000,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
      avgUnitPrice:
        r.totalQuantity > 0 && r.totalAmount !== 0
          ? Math.round((r.totalAmount / r.totalQuantity) * 10000) / 10000
          : 0
    }))
    .sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  const totals = byLnCentre.reduce(
    (acc, r) => {
      acc.invoiceLines += r.invoiceLines;
      acc.totalQuantity += r.totalQuantity;
      acc.totalAmount += r.totalAmount;
      return acc;
    },
    { invoiceLines: 0, totalQuantity: 0, totalAmount: 0 }
  );

  return {
    dateFrom: df,
    dateTo: dt,
    supplierCode: supplierCode ? String(supplierCode).trim() : null,
    supplierName: supplierName ? String(supplierName).trim() : null,
    dimension1Description:
      "Dimensió 1 = línia de negoci (equivalent a LN en altres informes, segons export SAP)",
    dimension2Description: "Dimensió 2 = centre",
    columnsDetected: { dimension1: dim1Detected, dimension2: dim2Detected },
    summary: {
      invoiceLines: totals.invoiceLines,
      totalQuantity: Math.round(totals.totalQuantity * 10000) / 10000,
      totalAmount: Math.round(totals.totalAmount * 100) / 100
    },
    rowCount: byLnCentre.length,
    byLnCentre,
    note:
      (!dim1Detected || !dim2Detected
        ? "Algun dimensió no s'ha detectat; revisa capçaleres del CSV o variables FINANCE_PURCHASES_DIM1_COLUMN / FINANCE_PURCHASES_DIM2_COLUMN (text de capçalera). "
        : "") + "Sense filtre de proveïdor s'inclouen totes les línies de l'interval."
  };
}

/**
 * Cerca genèrica sobre el CSV de compres: qualsevol columna (clau normalitzada: nom_article, codi_proveidor, import, data_comptable…).
 * conditions: [{ column, value, mode? }] on mode és contains (defecte), equals, starts_with, gte, lte.
 * dateFrom / dateTo: YYYY-MM-DD (inclosos) sobre la columna dateField (defecte data_comptable).
 */
export async function searchPurchases({
  conditions = [],
  dateFrom,
  dateTo,
  dateField = "data_comptable",
  limit = 80
}) {
  const lim = Math.min(300, Math.max(1, Number(limit || 80)));
  const rawConds = Array.isArray(conditions) ? conditions : [];
  const parsedDateFrom = dateFrom ? String(dateFrom).trim().slice(0, 10) : null;
  const parsedDateTo = dateTo ? String(dateTo).trim().slice(0, 10) : null;

  if (rawConds.length === 0 && !parsedDateFrom && !parsedDateTo) {
    throw new Error(
      "Cal almenys una condició { column, value } o bé dateFrom / dateTo (YYYY-MM-DD)"
    );
  }

  /** @type {{ idx: number, mode: string, value: string }[] | null} */
  let resolved = null;
  let resolvedDateIdx = null;
  /** @type {Record<string, number> | null} */
  let keyMap = null;

  const rows = [];

  await scanPurchasesLines(async (row) => {
    if (row.phase === "header") {
      keyMap = row.idx.columnIndexByKey;
      if (!keyMap || Object.keys(keyMap).length === 0) {
        throw new Error("CSV sense mapa de columnes");
      }
      resolved = rawConds.map((c, i) => {
        const col = String(c.column ?? "").trim();
        if (!col) {
          throw new Error(`Condició #${i + 1}: falta "column"`);
        }
        const idx = resolveColumnIndexFromKeyMap(keyMap, col);
        if (idx === undefined) {
          throw new Error(
            `Columna "${col}" no trobada. Claus del fitxer: ${Object.keys(keyMap).slice(0, 40).join(", ")}`
          );
        }
        return {
          idx,
          mode: String(c.mode || "contains").toLowerCase(),
          value: String(c.value ?? "")
        };
      });
      if (parsedDateFrom || parsedDateTo) {
        const df = String(dateField || "data_comptable").trim();
        resolvedDateIdx = resolveColumnIndexFromKeyMap(keyMap, df);
        if (resolvedDateIdx === undefined) {
          throw new Error(
            `Columna de data "${df}" no trobada. Prova data_comptable, data_document… Claus: ${Object.keys(keyMap).join(", ")}`
          );
        }
      }
      return true;
    }

    const f = row.fields;
    if (resolvedDateIdx !== null) {
      const ds = f[resolvedDateIdx] ?? "";
      if (!compareDateRange(ds, parsedDateFrom, parsedDateTo)) return true;
    }
    for (const { idx, mode, value } of resolved) {
      if (!evaluateSearchCondition(f[idx], mode, value)) return true;
    }

    const obj = {};
    for (const [k, ix] of Object.entries(keyMap)) {
      obj[k] = stripCsvCell(f[ix] ?? "");
    }
    rows.push(obj);
    return rows.length < lim;
  });

  return {
    count: rows.length,
    limit: lim,
    columns: keyMap ? Object.keys(keyMap) : [],
    rows
  };
}

