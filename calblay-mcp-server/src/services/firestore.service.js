import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, getCountFromServer, Timestamp } from "firebase-admin/firestore";

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
  const snap = await getCountFromServer(q);
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
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
