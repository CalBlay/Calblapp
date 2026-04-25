import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const cacheStore = new Map();
const cacheMetrics = { hits: 0, misses: 0, sets: 0 };

function getFirebaseApp() {
  if (getApps().length) return getApp();

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.ID_PROJECTE_FIREBASE;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.CORREU_ELECTRONIC_DE_CLIENT_DE_FIREBASE;
  const privateKey = (
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_CLAU ||
    ""
  ).replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars (need FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or ID_PROJECTE_FIREBASE + CORREU_ELECTRONIC_DE_CLIENT_DE_FIREBASE + FIREBASE_PRIVATE_CLAU)"
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}

function parseCsvSet(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function getCacheTtlMs() {
  const v = Number(process.env.FIRESTORE_CATALOG_CACHE_TTL_MS || 120000);
  return Math.min(Math.max(Number.isFinite(v) ? v : 120000, 0), 3600000);
}

function cacheEnabled() {
  return getCacheTtlMs() > 0;
}

function cacheGet(key) {
  if (!cacheEnabled()) return null;
  const row = cacheStore.get(key);
  if (!row) {
    cacheMetrics.misses += 1;
    return null;
  }
  if (Date.now() > row.expiresAt) {
    cacheStore.delete(key);
    cacheMetrics.misses += 1;
    return null;
  }
  cacheMetrics.hits += 1;
  return row.value;
}

function cacheSet(key, value) {
  if (!cacheEnabled()) return;
  const ttl = getCacheTtlMs();
  cacheStore.set(key, { value, expiresAt: Date.now() + ttl });
  cacheMetrics.sets += 1;
}

export function getFirestoreCatalogCacheStats() {
  const now = Date.now();
  let activeKeys = 0;
  let expiredKeys = 0;
  for (const [, row] of cacheStore.entries()) {
    if (row?.expiresAt > now) activeKeys += 1;
    else expiredKeys += 1;
  }
  return {
    enabled: cacheEnabled(),
    ttlMs: getCacheTtlMs(),
    size: cacheStore.size,
    activeKeys,
    expiredKeys,
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    sets: cacheMetrics.sets
  };
}

export function clearFirestoreCatalogCache() {
  cacheStore.clear();
  return getFirestoreCatalogCacheStats();
}

function getCollectionDictionaryPath() {
  const fromEnv = String(process.env.FIRESTORE_COLLECTION_DICTIONARY_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "config", "firestore_collection_dictionary.json");
}

function readCollectionDictionaryLite() {
  const p = getCollectionDictionaryPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.collections && typeof parsed.collections === "object" ? parsed.collections : {};
  } catch {
    return {};
  }
}

function isAdminModeEnabled() {
  const v = String(process.env.MCP_FIRESTORE_ADMIN_MODE || "1").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isCollectionAllowedByEnv(collectionName) {
  const allowedRaw = String(process.env.FIRESTORE_QUERY_ALLOWED_COLLECTIONS || "*").trim();
  const blocked = parseCsvSet(process.env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS || "");
  if (blocked.has(collectionName)) return { allowed: false, reason: "blocked_by_env" };
  if (allowedRaw === "*" || allowedRaw === "") return { allowed: true, reason: "wildcard_allow" };
  const allowedSet = parseCsvSet(allowedRaw);
  return allowedSet.has(collectionName)
    ? { allowed: true, reason: "allowlist" }
    : { allowed: false, reason: "not_in_allowlist" };
}

function getCollectionPolicy(collectionName) {
  const dict = readCollectionDictionaryLite();
  const row = dict?.[collectionName] || null;
  const sensitivity = String(row?.sensitivity || "admin_only").toLowerCase();
  const envCheck = isCollectionAllowedByEnv(collectionName);
  if (!envCheck.allowed) {
    return { allowed: false, reason: envCheck.reason, sensitivity, hasManualEntry: Boolean(row) };
  }
  if (sensitivity === "admin_only" && !isAdminModeEnabled()) {
    return { allowed: false, reason: "admin_mode_required", sensitivity, hasManualEntry: Boolean(row) };
  }
  return { allowed: true, reason: "ok", sensitivity, hasManualEntry: Boolean(row) };
}

/**
 * Llista col·leccions top-level del projecte Firestore.
 */
export async function listTopLevelCollections() {
  const cached = cacheGet("top_level_collections");
  if (cached) return cached;
  const cols = await getDb().listCollections();
  const out = cols
    .map((c) => c.id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ca", { sensitivity: "base" }));
  cacheSet("top_level_collections", out);
  return out;
}

function extractFieldNamesFromDocs(docs) {
  const keys = new Set();
  for (const d of docs) {
    if (!d || typeof d !== "object") continue;
    for (const k of Object.keys(d)) keys.add(k);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "ca", { sensitivity: "base" }));
}

/**
 * Mostra docs d'una col·lecció per entendre esquema real de camps.
 */
export async function sampleCollectionDocuments(collectionName, { limit = 10 } = {}) {
  const name = String(collectionName || "").trim();
  if (!name) throw new Error("collectionName obligatori");
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const cacheKey = `sample:${name}:${cap}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const snap = await getDb().collection(name).limit(cap).get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const fieldNames = extractFieldNamesFromDocs(docs);
  const out = {
    collection: name,
    count: docs.length,
    requestedLimit: cap,
    fieldNames,
    sample: docs
  };
  cacheSet(cacheKey, out);
  return out;
}

function inferDomainFromName(name) {
  const n = String(name || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("incident") || n.includes("ticket") || n.includes("manten")) return "maintenance";
  if (n.includes("quadrant") || n.includes("personnel") || n.includes("personal")) return "operations";
  if (n.includes("transport") || n.includes("vehicle") || n.includes("logistic")) return "logistics";
  if (n.includes("allergen")) return "food_safety";
  if (n.includes("project")) return "projects";
  if (n.includes("finance") || n.includes("cost") || n.includes("venda") || n.includes("compra"))
    return "finance";
  if (n.includes("event") || n.startsWith("stage_")) return "events";
  return "unknown";
}

function normKey(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pickFirstField(fields, candidates) {
  const byNorm = new Map(fields.map((f) => [normKey(f), f]));
  for (const c of candidates) {
    const found = byNorm.get(normKey(c));
    if (found) return found;
  }
  return null;
}

function inferJoinKeysFromFields(fieldNames) {
  const eventCodeField = pickFirstField(fieldNames, [
    "code",
    "eventCode",
    "event_code",
    "codi",
    "C_digo"
  ]);
  const eventIdField = pickFirstField(fieldNames, ["eventId", "event_id", "event"]);
  const dimension1Field = pickFirstField(fieldNames, ["LN", "ln", "dimension_1", "dimensio_1"]);
  const dimension2Field = pickFirstField(fieldNames, [
    "centre",
    "center",
    "restaurant",
    "finca",
    "ubicacio",
    "dimension_2",
    "dimensio_2"
  ]);
  const dateField = pickFirstField(fieldNames, [
    "DataInici",
    "dataInici",
    "date",
    "event_date",
    "startDate",
    "createdAt",
    "timestamp"
  ]);
  return {
    eventCodeField,
    eventIdField,
    dimension1Field,
    dimension2Field,
    dateField,
    hasEventJoin: Boolean(eventCodeField || eventIdField),
    hasContextJoin: Boolean(dimension1Field || dimension2Field || dateField)
  };
}

/**
 * Mapping inicial automàtic per domini basat en nom de col·lecció.
 */
export async function mapCollectionsToDomains() {
  const cached = cacheGet("map_collections_to_domains");
  if (cached) return cached;
  const collections = await listTopLevelCollections();
  const rows = collections.map((name) => ({
    collection: name,
    suggestedDomain: inferDomainFromName(name)
  }));
  const out = {
    total: rows.length,
    rows
  };
  cacheSet("map_collections_to_domains", out);
  return out;
}

/**
 * Mapping detallat: domini suggerit + camps detectats + claus de join suggerides.
 * Pensat per inventari funcional ràpid de Firestore.
 */
export async function mapCollectionsToDomainsDetailed({
  q = "",
  collectionLimit = 200,
  sampleLimit = 12
} = {}) {
  const cacheKey = `map_detailed:${String(q || "").toLowerCase()}:${Number(collectionLimit) || 200}:${Number(sampleLimit) || 12}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const query = String(q || "").trim().toLowerCase();
  const maxCollections = Math.min(Math.max(Number(collectionLimit) || 200, 1), 500);
  const perCollectionSample = Math.min(Math.max(Number(sampleLimit) || 12, 1), 50);

  const all = await listTopLevelCollections();
  const filtered = (query ? all.filter((name) => name.toLowerCase().includes(query)) : all).slice(
    0,
    maxCollections
  );

  const rows = await Promise.all(
    filtered.map(async (name) => {
      try {
        const sampled = await sampleCollectionDocuments(name, { limit: perCollectionSample });
        const joinHints = inferJoinKeysFromFields(sampled.fieldNames);
        const domain = inferDomainFromName(name);
        const confidence =
          domain === "unknown"
            ? "low"
            : joinHints.hasEventJoin || joinHints.hasContextJoin
              ? "high"
              : "medium";
        return {
          collection: name,
          suggestedDomain: domain,
          confidence,
          countSampled: sampled.count,
          fieldNames: sampled.fieldNames,
          joinHints
        };
      } catch (e) {
        return {
          collection: name,
          suggestedDomain: inferDomainFromName(name),
          confidence: "low",
          error: e instanceof Error ? e.message : String(e),
          countSampled: 0,
          fieldNames: [],
          joinHints: {
            eventCodeField: null,
            eventIdField: null,
            dimension1Field: null,
            dimension2Field: null,
            dateField: null,
            hasEventJoin: false,
            hasContextJoin: false
          }
        };
      }
    })
  );

  const summary = rows.reduce(
    (acc, r) => {
      const d = r.suggestedDomain || "unknown";
      acc.byDomain[d] = (acc.byDomain[d] || 0) + 1;
      if (r.joinHints?.hasEventJoin) acc.withEventJoin += 1;
      if (r.joinHints?.hasContextJoin) acc.withContextJoin += 1;
      if (r.error) acc.withErrors += 1;
      return acc;
    },
    { byDomain: {}, withEventJoin: 0, withContextJoin: 0, withErrors: 0 }
  );

  const out = {
    totalCollections: all.length,
    selectedCollections: filtered.length,
    query,
    sampleLimit: perCollectionSample,
    summary,
    rows
  };
  cacheSet(cacheKey, out);
  return out;
}

function toComparableString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

function getFieldValue(doc, fieldPath) {
  const parts = String(fieldPath || "")
    .split(".")
    .filter(Boolean);
  let cur = doc;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function normalizeComparableText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function rowMatchesFilter(doc, filter) {
  const field = String(filter?.field || "").trim();
  if (!field) return true;
  const op = String(filter?.op || "contains").toLowerCase();
  const expectedRaw = filter?.value;
  const got = getFieldValue(doc, field);
  const gotStr = toComparableString(got);
  const expectedStr = toComparableString(expectedRaw);
  const gotNorm = normalizeComparableText(gotStr);
  const expectedNorm = normalizeComparableText(expectedStr);

  if (op === "equals") return gotNorm === expectedNorm;
  if (op === "starts_with") return gotNorm.startsWith(expectedNorm);
  if (op === "contains") return gotNorm.includes(expectedNorm);
  if (op === "gte" || op === "lte") {
    const gNum = Number(got);
    const eNum = Number(expectedRaw);
    if (Number.isFinite(gNum) && Number.isFinite(eNum)) {
      return op === "gte" ? gNum >= eNum : gNum <= eNum;
    }
    // Fallback lexical compare for ISO dates / sortable strings.
    return op === "gte" ? gotStr >= expectedStr : gotStr <= expectedStr;
  }
  return true;
}

function projectDocumentFields(doc, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return trimDocumentForQuery(doc);
  const out = { id: doc.id };
  for (const f of fields) {
    const key = String(f || "").trim();
    if (!key) continue;
    out[key] = getFieldValue(doc, key);
  }
  return out;
}

function trimValue(v) {
  if (typeof v === "string") {
    return v.length > 500 ? `${v.slice(0, 500)}…` : v;
  }
  if (Array.isArray(v)) {
    const sliced = v.slice(0, 20).map((x) => trimValue(x));
    return v.length > 20 ? [...sliced, `__truncated__(${v.length - 20} more)`] : sliced;
  }
  if (v && typeof v === "object") {
    const out = {};
    const keys = Object.keys(v).slice(0, 25);
    for (const k of keys) out[k] = trimValue(v[k]);
    if (Object.keys(v).length > 25) out.__truncated__ = `${Object.keys(v).length - 25} more fields`;
    return out;
  }
  return v;
}

function trimDocumentForQuery(doc) {
  const out = { id: doc.id };
  const keys = Object.keys(doc || {}).filter((k) => k !== "id").slice(0, 35);
  for (const k of keys) out[k] = trimValue(doc[k]);
  if (Object.keys(doc || {}).length > 36) out.__truncated__ = "Document trimmed for efficiency";
  return out;
}

/**
 * Catàleg de col·leccions amb domini suggerit i camps principals detectats.
 * Pensat per preguntes obertes sobre qualsevol col·lecció actual o futura.
 */
export async function collectionsCatalogForChat({ q = "", limit = 120, sampleLimit = 8 } = {}) {
  const cacheKey = `catalog_for_chat:${String(q || "").toLowerCase()}:${Number(limit) || 120}:${Number(sampleLimit) || 8}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const data = await mapCollectionsToDomainsDetailed({
    q,
    collectionLimit: limit,
    sampleLimit
  });
  const out = {
    kind: "firestore_collections_catalog",
    query: String(q || ""),
    totalCollections: data.totalCollections,
    selectedCollections: data.selectedCollections,
    summary: data.summary,
    collections: data.rows.map((r) => ({
      ...(() => {
        const p = getCollectionPolicy(r.collection);
        return {
          queryAllowed: p.allowed,
          queryPolicyReason: p.reason,
          sensitivity: p.sensitivity,
          hasManualEntry: p.hasManualEntry
        };
      })(),
      collection: r.collection,
      suggestedDomain: r.suggestedDomain,
      confidence: r.confidence,
      fieldNames: r.fieldNames.slice(0, 60),
      joinHints: r.joinHints,
      error: r.error || null
    }))
  };
  cacheSet(cacheKey, out);
  return out;
}

/**
 * Consulta genèrica per qualsevol col·lecció Firestore.
 * Llegeix un subconjunt (scanLimit) i filtra en memòria (contains/equals/gte/lte).
 */
export async function queryCollectionForChat({
  collection,
  filters = [],
  fields = [],
  limit = 25,
  scanLimit = 300
} = {}) {
  const name = String(collection || "").trim();
  if (!name) throw new Error("collection obligatori");
  const policy = getCollectionPolicy(name);
  if (!policy.allowed) {
    throw new Error(
      `Access denied for collection "${name}" (${policy.reason}). ` +
        "Revisa FIRESTORE_QUERY_ALLOWED_COLLECTIONS / FIRESTORE_QUERY_BLOCKED_COLLECTIONS o sensibilitat al diccionari."
    );
  }
  const cap = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const scanCap = Math.min(Math.max(Number(scanLimit) || 300, 20), 2000);
  const safeFilters = Array.isArray(filters) ? filters.slice(0, 8) : [];

  const sampled = await sampleCollectionDocuments(name, { limit: scanCap });
  const filtered = sampled.sample.filter((doc) => safeFilters.every((f) => rowMatchesFilter(doc, f)));
  const projected = filtered.slice(0, cap).map((doc) => projectDocumentFields(doc, fields));
  const joinHints = inferJoinKeysFromFields(sampled.fieldNames);

  return {
    kind: "firestore_query_collection",
    collection: name,
    requestedLimit: cap,
    scanLimit: scanCap,
    scanned: sampled.count,
    matched: filtered.length,
    returned: projected.length,
    fieldNames: sampled.fieldNames,
    joinHints,
    rows: projected,
    ...(filtered.length > cap
      ? {
          note: `S'han trobat ${filtered.length} files i se n'han retornat ${cap}. Ajusta filters o puja limit si cal.`
        }
      : {})
  };
}

function toQueryLimit(limit, fallback = 50) {
  const n = Number.parseInt(String(limit ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), 500);
}

export async function listCollection(
  collectionName,
  { limit = 50, orderBy: orderField, orderDirection = "asc" } = {}
) {
  const cap = toQueryLimit(limit, 50);
  let query = getDb().collection(collectionName);
  if (orderField) {
    const dir = orderDirection === "desc" ? "desc" : "asc";
    query = query.orderBy(orderField, dir);
  }
  const snap = await query.limit(cap).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Esdeveniments o altres col·leccions amb orderBy desc i límit més alt que listCollection (p. ex. mostreig de comercials per LN).
 */
export async function listCollectionOrderByDesc(
  collectionName,
  orderField,
  { limit = 2000, max = 5000 } = {}
) {
  const n = Number.parseInt(String(limit ?? ""), 10);
  const cap = Math.min(Math.max(Number.isFinite(n) ? n : 2000, 1), Math.min(max, 5000));
  const snap = await getDb()
    .collection(collectionName)
    .orderBy(orderField, "desc")
    .limit(cap)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function queryCollectionWhere(
  collectionName,
  field,
  op,
  value,
  { limit = 10 } = {}
) {
  const cap = toQueryLimit(limit, 10);
  const snap = await getDb()
    .collection(collectionName)
    .where(field, op, value)
    .limit(cap)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getDocument(collectionName, docId) {
  const ref = await getDb().collection(collectionName).doc(String(docId)).get();
  if (!ref.exists) return null;
  return { id: ref.id, ...ref.data() };
}

/**
 * Recompte barat (agregació Firestore) per documents amb camp data tipus string ISO (YYYY-MM-DD).
 */
export async function countByStringDateYear(collectionName, fieldName, year) {
  const y = Number(year);
  const db = getDb();
  const q = db
    .collection(collectionName)
    .where(fieldName, ">=", `${y}-01-01`)
    .where(fieldName, "<=", `${y}-12-31`);
  const snap = await q.count().get();
  return snap.data().count;
}

/**
 * Recompte per camp Timestamp (Firestore natiu).
 */
export async function countByTimestampYear(collectionName, fieldName, year) {
  const y = Number(year);
  const db = getDb();
  const start = Timestamp.fromMillis(Date.UTC(y, 0, 1, 0, 0, 0));
  const end = Timestamp.fromMillis(Date.UTC(y, 11, 31, 23, 59, 59, 999));
  const q = db.collection(collectionName).where(fieldName, ">=", start).where(fieldName, "<=", end);
  const snap = await q.count().get();
  return snap.data().count;
}

function parseYearMonthParts(yearMonth) {
  const ym = String(yearMonth || "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error("yearMonth ha de ser YYYY-MM");
  }
  const [ys, ms] = ym.split("-");
  const yNum = Number(ys);
  const mNum = Number(ms);
  if (mNum < 1 || mNum > 12) {
    throw new Error("mes invàlid");
  }
  return { ym, yNum, mNum, ys, ms };
}

/**
 * Documents amb camp data tipus string ISO (YYYY-MM-DD…) dins el mes [yearMonth, yearMonth+1).
 */
export async function listDocsByStringDateMonth(
  collectionName,
  fieldName,
  yearMonth,
  { limit = 5000 } = {}
) {
  const { yNum, mNum, ys, ms } = parseYearMonthParts(yearMonth);
  const startStr = `${ys}-${ms}-01`;
  const nextM = mNum === 12 ? 1 : mNum + 1;
  const nextY = mNum === 12 ? yNum + 1 : yNum;
  const endExclusiveStr = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const cap = Math.min(Math.max(Number(limit) || 5000, 1), 10_000);
  const snap = await getDb()
    .collection(collectionName)
    .where(fieldName, ">=", startStr)
    .where(fieldName, "<", endExclusiveStr)
    .limit(cap)
    .get();
  return {
    docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    capped: snap.size >= cap
  };
}

/**
 * Mateix rang de mes per camp Timestamp Firestore (interval [inici_mes, inici_mes_següent)).
 */
export async function listDocsByTimestampMonth(
  collectionName,
  fieldName,
  yearMonth,
  { limit = 5000 } = {}
) {
  const { yNum, mNum } = parseYearMonthParts(yearMonth);
  const nextM = mNum === 12 ? 1 : mNum + 1;
  const nextY = mNum === 12 ? yNum + 1 : yNum;
  const start = Timestamp.fromMillis(Date.UTC(yNum, mNum - 1, 1, 0, 0, 0, 0));
  const endExclusive = Timestamp.fromMillis(Date.UTC(nextY, nextM - 1, 1, 0, 0, 0, 0));
  const cap = Math.min(Math.max(Number(limit) || 5000, 1), 10_000);
  const snap = await getDb()
    .collection(collectionName)
    .where(fieldName, ">=", start)
    .where(fieldName, "<", endExclusive)
    .limit(cap)
    .get();
  return {
    docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    capped: snap.size >= cap
  };
}
