import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapCollectionsToDomainsDetailed } from "./firestore.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function getDictionaryPath() {
  const fromEnv = String(process.env.FIRESTORE_COLLECTION_DICTIONARY_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "config", "firestore_collection_dictionary.json");
}

export function readCollectionDictionary() {
  const p = getDictionaryPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      path: p,
      dictionary: parsed
    };
  } catch (e) {
    return {
      ok: false,
      path: p,
      error: e instanceof Error ? e.message : String(e),
      dictionary: { version: "v1", updatedAt: null, collections: {} }
    };
  }
}

export async function buildCollectionDictionarySnapshot({
  q = "",
  collectionLimit = 200,
  sampleLimit = 8
} = {}) {
  const staticDict = readCollectionDictionary();
  const dynamic = await mapCollectionsToDomainsDetailed({ q, collectionLimit, sampleLimit });
  const byName = staticDict.dictionary?.collections || {};

  const rows = dynamic.rows.map((r) => {
    const manual = byName[r.collection] || null;
    const joinKeysManual = Array.isArray(manual?.joinKeys) ? manual.joinKeys : [];
    const mlFeatures = Array.isArray(manual?.mlFeatures) ? manual.mlFeatures : [];
    const mlLabelCandidates = Array.isArray(manual?.mlLabelCandidates) ? manual.mlLabelCandidates : [];
    const hasManualEntry = Boolean(manual);
    const needsManualReview = !hasManualEntry;
    return {
      collection: r.collection,
      domain: manual?.domain || r.suggestedDomain,
      domainSource: manual?.domain ? "manual_dictionary" : "auto_inference",
      hasManualEntry,
      needsManualReview,
      description: manual?.description || null,
      owner: manual?.owner || null,
      sensitivity: manual?.sensitivity || "admin_only",
      joinKeysManual,
      joinHintsAuto: r.joinHints,
      mlReady: Boolean(manual?.mlReady),
      mlFeatures,
      mlLabelCandidates,
      confidence: r.confidence,
      fieldNames: r.fieldNames,
      error: r.error || null
    };
  });

  const rowsNeedingManualReview = rows.filter((r) => r.needsManualReview).map((r) => r.collection);
  const mlReadyCollections = rows.filter((r) => r.mlReady).map((r) => r.collection);

  return {
    dictionaryPath: staticDict.path,
    dictionaryLoadOk: staticDict.ok,
    dictionaryLoadError: staticDict.ok ? null : staticDict.error,
    dictionaryVersion: staticDict.dictionary?.version || "v1",
    dictionaryUpdatedAt: staticDict.dictionary?.updatedAt || null,
    totalCollections: dynamic.totalCollections,
    selectedCollections: dynamic.selectedCollections,
    summary: dynamic.summary,
    manualCoverage: {
      documented: rows.length - rowsNeedingManualReview.length,
      missing: rowsNeedingManualReview.length,
      percent:
        rows.length > 0 ? Number((((rows.length - rowsNeedingManualReview.length) / rows.length) * 100).toFixed(2)) : 0
    },
    rowsNeedingManualReview,
    mlReadyCollections,
    rows
  };
}
