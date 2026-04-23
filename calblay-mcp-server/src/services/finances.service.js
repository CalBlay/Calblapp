import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import readline from "node:readline";
import { Storage } from "@google-cloud/storage";

const DEFAULT_FINANCE_DIR =
  "C:\\Users\\PORTATIL126\\OneDrive - Cal Blay\\Escritorio\\Finances\\_clean_exports";

const PURCHASES_CSV = "Consulta_Factura_per_linia__Sheet1.csv";

function getFinanceDir() {
  return process.env.FINANCE_CSV_DIR || DEFAULT_FINANCE_DIR;
}

function getFinanceSource() {
  return (process.env.FINANCE_SOURCE || "local").toLowerCase();
}

function getGcsPrefix() {
  return String(process.env.GCS_FINANCE_PREFIX || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function getGooglePrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function getStorageClient() {
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

function buildGcsObjectName(fileName) {
  const prefix = getGcsPrefix();
  const safe = safeCsvFileName(fileName);
  return prefix ? `${prefix}/${safe}` : safe;
}

function openPurchasesCsvStream() {
  const safeName = safeCsvFileName(PURCHASES_CSV);
  const source = getFinanceSource();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const objectName = buildGcsObjectName(safeName);
    return bucket.file(objectName).createReadStream();
  }
  const financeDir = path.resolve(getFinanceDir());
  const fullPath = path.resolve(financeDir, safeName);
  if (!fullPath.startsWith(financeDir)) {
    throw new Error("Invalid file path");
  }
  return createReadStream(fullPath, { encoding: "utf8" });
}

/**
 * Recorre el CSV de compres línia a línia (sense carregar el fitxer sencer a memòria).
 */
async function scanPurchasesLines(onRow) {
  const input = openPurchasesCsvStream();
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headerLine = null;
  try {
    for await (const line of rl) {
      if (!line || line.length === 0) continue;
      if (!headerLine) {
        headerLine = line;
        const headers = normalizeCsvLine(headerLine);
        const headersMap = new Map(
          headers.map((h, idx) => [String(h || "").trim().toLowerCase(), idx])
        );
        const idxSupplier = headersMap.get("nom_proveïdor");
        const idxCode = headersMap.get("codi_proveïdor");
        const idxArticle = headersMap.get("nom_article");
        const idxAmount = headersMap.get("import");
        const idxQty = headersMap.get("quantitat");
        const idxDate = headersMap.get("data_comptable");
        if (idxSupplier === undefined) {
          throw new Error("CSV sense columna nom_proveïdor");
        }
        const cont = await onRow({
          phase: "header",
          headers,
          idx: { idxSupplier, idxCode, idxArticle, idxAmount, idxQty, idxDate }
        });
        if (cont === false) break;
        continue;
      }
      const fields = normalizeCsvLine(line);
      const cont = await onRow({ phase: "data", fields });
      if (cont === false) break;
    }
  } finally {
    rl.close();
  }
}

function parseAmountLike(v) {
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
  const s = String(dateStr || "").trim();
  if (s.length >= 4 && s[4] === "-") {
    const y = Number(s.slice(0, 4));
    return Number.isFinite(y) ? y : null;
  }
  return null;
}

async function readCsvText(fileName) {
  const source = getFinanceSource();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const objectName = buildGcsObjectName(fileName);
    const [buffer] = await bucket.file(objectName).download();
    return buffer.toString("utf8");
  }

  const financeDir = path.resolve(getFinanceDir());
  const safeName = safeCsvFileName(fileName);
  const fullPath = path.resolve(financeDir, safeName);
  if (!fullPath.startsWith(financeDir)) {
    throw new Error("Invalid file path");
  }
  return fs.readFile(fullPath, "utf8");
}

export function normalizeCsvLine(line) {
  // Minimal CSV parser compatible with quoted fields.
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export async function listFinanceCsvFiles() {
  const source = getFinanceSource();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const prefix = getGcsPrefix();
    const [files] = await bucket.getFiles(prefix ? { prefix: `${prefix}/` } : undefined);
    return files
      .map((f) => f.name)
      .filter((name) => name.toLowerCase().endsWith(".csv"))
      .map((name) => path.posix.basename(name))
      .sort((a, b) => a.localeCompare(b));
  }

  const financeDir = getFinanceDir();
  const items = await fs.readdir(financeDir, { withFileTypes: true });
  return items
    .filter((item) => item.isFile() && item.name.toLowerCase().endsWith(".csv"))
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b));
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

