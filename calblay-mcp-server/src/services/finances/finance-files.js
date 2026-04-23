import fs from "fs/promises";
import path from "path";
import {
  getFinanceDir,
  getFinanceSource,
  getGcsBucketName,
  getGcsFinanceBase,
  getGcsPrefix,
  getStorageClient,
  isFinanceSubfolderLayout
} from "./config.js";
import {
  financeKindSegment,
  normalizeFinanceKind,
  resolveLocalKindSubdirSync,
  safeCsvFileName
} from "./paths.js";
import { normalizeCsvLine, normalizeCsvLineDelimited } from "./csv-lines.js";
import { readCsvText } from "./purchases-io.js";

/**
 * Llista fitxers .csv al mateix origen que readCsvText(..., kind).
 * kind: compres | costos | vendes | rh
 */
export async function listFinanceCsvFilesForKind(kind = "compres") {
  const source = getFinanceSource();
  const k = normalizeFinanceKind(kind);
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
    ? resolveLocalKindSubdirSync(financeDir, financeKindSegment(k))
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

export async function previewFinanceCsv(fileName, maxRows = 20, kind = "compres") {
  if (!fileName || String(fileName).trim() === "") throw new Error("Missing file query param");
  const k = normalizeFinanceKind(kind);
  const safeName = safeCsvFileName(fileName);
  const raw = await readCsvText(safeName, k);
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { file: safeName, kind: k, headers: [], rows: [], totalRowsApprox: 0 };
  }

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  let delimiter = ",";
  if (normalizeCsvLineDelimited(headerLine, delimiter).length <= 1 && headerLine.includes(";")) {
    delimiter = ";";
  }
  const headers = normalizeCsvLineDelimited(headerLine, delimiter);
  const rows = lines
    .slice(1, 1 + Number(maxRows || 20))
    .map((line) => normalizeCsvLineDelimited(line, delimiter));

  return {
    file: safeName,
    kind: k,
    totalRowsApprox: Math.max(0, lines.length - 1),
    headers,
    rows
  };
}
