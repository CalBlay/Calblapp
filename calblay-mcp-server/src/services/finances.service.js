import fs from "fs/promises";
import path from "path";
import { Storage } from "@google-cloud/storage";

const DEFAULT_FINANCE_DIR =
  "C:\\Users\\PORTATIL126\\OneDrive - Cal Blay\\Escritorio\\Finances\\_clean_exports";

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

  const data = await previewFinanceCsv("Consulta_Factura_per_linia__Sheet1.csv", 2000000);
  const headersMap = new Map(
    data.headers.map((h, idx) => [String(h || "").trim().toLowerCase(), idx])
  );

  const idxSupplier = headersMap.get("nom_proveïdor");
  const idxArticle = headersMap.get("nom_article");
  const idxAmount = headersMap.get("import");
  const idxQty = headersMap.get("quantitat");
  const idxDate = headersMap.get("data_comptable");

  if (idxSupplier === undefined) {
    throw new Error("CSV sense columna nom_proveïdor");
  }

  const matched = [];
  for (const row of data.rows) {
    const supplier = String(row[idxSupplier] || "");
    if (supplier.toLowerCase().includes(term)) {
      matched.push({
        supplier,
        article: idxArticle !== undefined ? String(row[idxArticle] || "") : "",
        amount: idxAmount !== undefined ? String(row[idxAmount] || "") : "",
        quantity: idxQty !== undefined ? String(row[idxQty] || "") : "",
        date: idxDate !== undefined ? String(row[idxDate] || "") : ""
      });
      if (matched.length >= Number(limit || 200)) break;
    }
  }

  return {
    supplierQuery: supplierName,
    count: matched.length,
    rows: matched
  };
}

