import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

type FirestoreUserDoc = {
  userId?: unknown
}

function usersCollection() {
  return db.collection('users')
}

export async function resolveUserDocSnapshotByAuthId(
  authUserId: string
): Promise<QueryDocumentSnapshot<FirestoreUserDoc> | null> {
  const normalized = String(authUserId || '').trim()
  if (!normalized) return null

  const direct = await usersCollection().doc(normalized).get()
  if (direct.exists) {
    return direct as QueryDocumentSnapshot<FirestoreUserDoc>
  }

  const byUserId = await usersCollection().where('userId', '==', normalized).limit(1).get()
  if (!byUserId.empty) {
    return byUserId.docs[0] as QueryDocumentSnapshot<FirestoreUserDoc>
  }

  return null
}

export async function resolveUserDocIdByAuthId(authUserId: string): Promise<string> {
  const normalized = String(authUserId || '').trim()
  if (!normalized) return ''
  const snap = await resolveUserDocSnapshotByAuthId(normalized)
  return snap?.id || normalized
}

export async function userNotificationsCollectionByAuthId(authUserId: string) {
  const docId = await resolveUserDocIdByAuthId(authUserId)
  return usersCollection().doc(docId).collection('notifications')
}

export async function userDocRefByAuthId(authUserId: string): Promise<DocumentReference> {
  const docId = await resolveUserDocIdByAuthId(authUserId)
  return usersCollection().doc(docId)
}
