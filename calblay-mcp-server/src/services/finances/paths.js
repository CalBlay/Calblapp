import fs from "fs";
import path from "path";
import {
  getFinanceDir,
  getGcsFinanceBase,
  getGcsPrefix,
  isFinanceSubfolderLayout
} from "./config.js";

/** Minúscules + sense accents (per comparar noms de carpeta entre SO). */
function foldAscii(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Resol la subcarpeta de kind sota root: primer camí exacte; si no existeix,
 * cerca un directori amb el mateix nom ignorant majúscules/minúscules (p.ex. vendes vs Vendes).
 */
export function resolveLocalKindSubdirSync(root, segment) {
  if (!segment) return root;
  const exact = path.join(root, segment);
  try {
    const st = fs.statSync(exact);
    if (st.isDirectory()) return exact;
  } catch {
    /* prova coincidència insensible a caixa */
  }
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return exact;
  }
  const want = foldAscii(segment);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (foldAscii(e.name) === want) return path.join(root, e.name);
  }
  return exact;
}

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

function directoryExistsSync(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Subcarpeta real sota FINANCE_CSV_DIR per kind: prova el nom configurat i variants (RRHH vs recursos_humans, c.explotacio vs costos).
 */
export function resolveFinanceKindDirSync(root, kindRaw) {
  const k = normalizeFinanceKind(kindRaw);
  const primary = financeKindSegment(k);
  /** @type {string[]} */
  let chain = [primary];
  if (k === "rh") {
    chain = [primary, "RRHH", "rrhh", "Recursos_humans", "recursos_humans"];
  } else if (k === "costos") {
    chain = [primary, "c.explotacio", "c_explotacio", "C.explotacio", "costos"];
  }
  const tried = new Set();
  for (const seg of chain) {
    const s = String(seg || "").trim();
    if (!s) continue;
    const key = foldAscii(s);
    if (tried.has(key)) continue;
    tried.add(key);
    const candidate = resolveLocalKindSubdirSync(root, s);
    if (directoryExistsSync(candidate)) return candidate;
  }
  return resolveLocalKindSubdirSync(root, primary);
}

/**
 * Fitxers que podem llegir com a taula (CSV/TSV o export sense extensió tipus vendes_2026).
 */
export function isListableFinanceDataFile(fileName) {
  const base = path.basename(String(fileName || "").replace(/\\/g, "/"));
  const n = base.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".tsv")) return true;
  const off = String(process.env.FINANCE_ALLOW_EXTENSIONLESS_TABULAR || "1").toLowerCase();
  if (off === "0" || off === "false" || off === "no") return false;
  return base.length > 0 && !base.includes(".");
}

export function safeCsvFileName(fileName) {
  const raw = String(fileName || "").trim().replace(/\\/g, "/");
  const safe = path.basename(raw);
  if (!safe || safe.includes("..")) {
    throw new Error("Invalid file name");
  }
  if (!isListableFinanceDataFile(safe)) {
    throw new Error(
      "Invalid data file name (esperat .csv / .tsv o export sense extensió; FINANCE_ALLOW_EXTENSIONLESS_TABULAR=0 per desactivar)"
    );
  }
  return safe;
}

export function resolveLocalFinanceFilePath(fileName, kind = "compres") {
  const safe = safeCsvFileName(fileName);
  const root = path.resolve(getFinanceDir());
  const dir = isFinanceSubfolderLayout() ? resolveFinanceKindDirSync(root, kind) : root;
  const full = path.join(dir, safe);
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
