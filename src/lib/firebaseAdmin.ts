// file: src/lib/firebaseAdmin.ts
import 'server-only'
import { getApps, getApp, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import admin from 'firebase-admin'

function getAdminApp() {
  if (getApps().length > 0) return getApp()

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin env vars. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    )
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  })
}

const app = getAdminApp()
const firestoreAdmin = getFirestore(app)
const storageAdmin = admin.storage()
const messagingAdmin = admin.messaging()

export { app, firestoreAdmin, storageAdmin, messagingAdmin }
