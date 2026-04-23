import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Evita carregar @google-cloud/storage (grpc) a l'arrencada si només useu fitxers locals. */
export function loadStorageClass() {
  return require("@google-cloud/storage").Storage;
}

export const DEFAULT_FINANCE_DIR =
  "C:\\Users\\PORTATIL126\\OneDrive - Cal Blay\\Escritorio\\Finances\\_clean_exports";

export const PURCHASES_CSV = "Consulta_Factura_per_linia__Sheet1.csv";

export function getFinanceDir() {
  return process.env.FINANCE_CSV_DIR || DEFAULT_FINANCE_DIR;
}

export function getFinanceSource() {
  const explicit = process.env.FINANCE_SOURCE;
  if (explicit && String(explicit).trim() !== "") {
    return String(explicit).toLowerCase();
  }
  // Cloud Run: amb bucket configurat, no usar mai el path Windows per defecte.
  if (process.env.GCS_BUCKET) return "gcs";
  return "local";
}

export function getGcsPrefix() {
  return String(process.env.GCS_FINANCE_PREFIX || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** Mode carpetes: finances/compres, finances/costos, … (local i GCS). */
export function isFinanceSubfolderLayout() {
  const v = String(process.env.FINANCE_SUBFOLDERS || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getGcsFinanceBase() {
  return String(process.env.GCS_FINANCE_BASE || "finances")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function getGooglePrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY || "";
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export function getStorageClient() {
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

export function getGcsBucketName() {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("Missing GCS_BUCKET");
  return bucket;
}

/** Excel/SAP (Europa) sovint exporten en Windows-1252 / ISO-8859-1, no UTF-8. */
export function getFinanceCsvEncoding() {
  const e = String(process.env.FINANCE_CSV_ENCODING || "utf8").trim().toLowerCase();
  if (
    ["latin1", "iso-8859-1", "iso8859-1", "windows-1252", "cp1252", "ansi"].includes(e)
  ) {
    return "latin1";
  }
  return "utf8";
}
