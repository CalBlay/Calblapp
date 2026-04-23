import fs from "fs/promises";
import { createReadStream } from "fs";
import {
  getFinanceCsvEncoding,
  getFinanceSource,
  getGcsBucketName,
  getStorageClient,
  PURCHASES_CSV
} from "./config.js";
import { buildGcsObjectName, resolveLocalFinanceFilePath, safeCsvFileName } from "./paths.js";

export function openPurchasesCsvStream() {
  const safeName = safeCsvFileName(PURCHASES_CSV);
  return openFinanceCsvStream(safeName, "compres");
}

/**
 * Stream de lectura d’un CSV dins la carpeta de kind (local o GCS).
 * @param {string} fileName — nom segur .csv
 * @param {"compres"|"costos"|"vendes"|"rh"} [kind="compres"]
 */
export function openFinanceCsvStream(fileName, kind = "compres") {
  const safeName = safeCsvFileName(fileName);
  const source = getFinanceSource();
  const enc = getFinanceCsvEncoding();
  if (source === "gcs") {
    const storage = getStorageClient();
    const bucket = storage.bucket(getGcsBucketName());
    const objectName = buildGcsObjectName(safeName, kind);
    const stream = bucket.file(objectName).createReadStream();
    stream.setEncoding(enc);
    return stream;
  }
  const fullPath = resolveLocalFinanceFilePath(safeName, kind);
  return createReadStream(fullPath, { encoding: enc });
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
