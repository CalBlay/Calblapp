import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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
