import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

export const CANONICAL_DICTIONARY_FILES = [
  "catalog_dimension_1.csv",
  "catalog_dimension_2.csv",
  "catalog_dimension_3.csv",
  "catalog_center_alias.csv"
];

export function getCanonicalDictionaryDir() {
  const fromEnv = String(process.env.CANONICAL_DICTIONARY_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "config", "canonical_dictionary");
}

export function canonicalDictionaryRequired() {
  const v = String(process.env.CANONICAL_DICTIONARY_REQUIRED || "1").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function validateCanonicalDictionary() {
  const dir = getCanonicalDictionaryDir();
  const missingFiles = CANONICAL_DICTIONARY_FILES.filter((name) => {
    const p = path.join(dir, name);
    try {
      return !fs.statSync(p).isFile();
    } catch {
      return true;
    }
  });
  return {
    dir,
    missingFiles,
    required: canonicalDictionaryRequired(),
    ok: missingFiles.length === 0
  };
}
