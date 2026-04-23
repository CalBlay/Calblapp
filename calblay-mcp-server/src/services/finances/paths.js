import path from "path";
import {
  getFinanceDir,
  getGcsFinanceBase,
  getGcsPrefix,
  isFinanceSubfolderLayout
} from "./config.js";

/** kind vàlid per API i readCsvText: compres | costos | vendes | rh */
export function normalizeFinanceKind(kind) {
  const k = String(kind || "compres").toLowerCase().trim();
  if (k === "recursos_humans" || k === "rh") return "rh";
  if (k === "compres" || k === "costos" || k === "vendes") return k;
  return "compres";
}

/**
 * Nom de subcarpeta dins FINANCE_CSV_DIR / dins GCS_FINANCE_BASE.
 * kind: compres | costos | vendes | rh
 */
export function financeKindSegment(kind) {
  const k = normalizeFinanceKind(kind);
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

export function safeCsvFileName(fileName) {
  const safe = path.basename(String(fileName || "").trim());
  if (!safe || !safe.toLowerCase().endsWith(".csv")) {
    throw new Error("Invalid CSV file name");
  }
  return safe;
}

export function resolveLocalFinanceFilePath(fileName, kind = "compres") {
  const safe = safeCsvFileName(fileName);
  const root = path.resolve(getFinanceDir());
  const sub = isFinanceSubfolderLayout() ? financeKindSegment(kind) : "";
  const full = sub ? path.join(root, sub, safe) : path.join(root, safe);
  if (!full.startsWith(root)) {
    throw new Error("Invalid file path");
  }
  return full;
}

/** Clau GCS; amb FINANCE_SUBFOLDERS=true usa GCS_FINANCE_BASE + carpeta per kind. */
export function buildGcsObjectName(fileName, kind = "compres") {
  const safe = safeCsvFileName(fileName);
  if (!isFinanceSubfolderLayout()) {
    const prefix = getGcsPrefix();
    return prefix ? `${prefix}/${safe}` : safe;
  }
  const base = getGcsFinanceBase();
  const seg = financeKindSegment(kind);
  return `${base}/${seg}/${safe}`.replace(/\/+/g, "/");
}
