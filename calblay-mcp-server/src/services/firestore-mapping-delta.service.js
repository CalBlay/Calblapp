import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCollectionDictionarySnapshot } from "./collection-dictionary.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function getStorePath() {
  const fromEnv = String(process.env.FIRESTORE_MAPPING_DELTA_STORE_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "data", "firestore-mapping-delta.json");
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  const p = getStorePath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid store shape");
    return {
      path: p,
      data: {
        version: String(parsed.version || "v1"),
        updatedAt: parsed.updatedAt || null,
        lastRun: parsed.lastRun || null,
        history: Array.isArray(parsed.history) ? parsed.history.slice(-60) : []
      }
    };
  } catch {
    return {
      path: p,
      data: {
        version: "v1",
        updatedAt: null,
        lastRun: null,
        history: []
      }
    };
  }
}

function writeStore(data) {
  const p = getStorePath();
  ensureParentDir(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

function extractCollectionSet(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  return new Set(rows.map((r) => String(r.collection || "").trim()).filter(Boolean));
}

function nextMidnightDelayMs() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 1000);
}

let midnightTimer = null;

export function getMappingDeltaStatus() {
  const { path: storePath, data } = readStore();
  return {
    storePath,
    version: data.version,
    updatedAt: data.updatedAt,
    lastRun: data.lastRun,
    historyCount: data.history.length,
    latest: data.history.length ? data.history[data.history.length - 1] : null
  };
}

export async function runFirestoreMappingDeltaJob({
  q = "",
  limit = 500,
  sampleLimit = 8,
  trigger = "manual"
} = {}) {
  const nowIso = new Date().toISOString();
  const { data } = readStore();
  const prevRun = data.lastRun;

  const snapshot = await buildCollectionDictionarySnapshot({
    q: String(q || ""),
    collectionLimit: Number(limit) || 500,
    sampleLimit: Number(sampleLimit) || 8
  });
  const currentSet = extractCollectionSet(snapshot);
  const previousSet = prevRun?.allCollections ? new Set(prevRun.allCollections) : new Set();

  const newCollections = [...currentSet].filter((c) => !previousSet.has(c)).sort();
  const removedCollections = [...previousSet].filter((c) => !currentSet.has(c)).sort();
  const needsManualReview = Array.isArray(snapshot.rowsNeedingManualReview)
    ? snapshot.rowsNeedingManualReview.slice().sort()
    : [];

  const run = {
    at: nowIso,
    trigger,
    query: String(q || ""),
    totalCollections: snapshot.totalCollections,
    selectedCollections: snapshot.selectedCollections,
    manualCoverage: snapshot.manualCoverage,
    newCollections,
    removedCollections,
    rowsNeedingManualReview: needsManualReview,
    allCollections: [...currentSet].sort()
  };

  const nextData = {
    version: "v1",
    updatedAt: nowIso,
    lastRun: run,
    history: [...(Array.isArray(data.history) ? data.history : []), run].slice(-60)
  };
  const storePath = writeStore(nextData);

  return {
    ok: true,
    storePath,
    run
  };
}

function scheduleNextNightRun() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const delay = nextMidnightDelayMs();
  midnightTimer = setTimeout(async () => {
    try {
      await runFirestoreMappingDeltaJob({ trigger: "nightly" });
    } catch (e) {
      console.error("[firestore-mapping-delta] nightly run failed:", e);
    } finally {
      scheduleNextNightRun();
    }
  }, delay);
  if (typeof midnightTimer.unref === "function") midnightTimer.unref();
}

export function startFirestoreMappingNightlyScheduler() {
  const enabled = String(process.env.FIRESTORE_MAPPING_DELTA_NIGHTLY_ENABLED || "1").toLowerCase() !== "0";
  if (!enabled) {
    return { enabled: false, reason: "disabled_by_env" };
  }
  scheduleNextNightRun();
  return { enabled: true, nextRunInMs: nextMidnightDelayMs() };
}

