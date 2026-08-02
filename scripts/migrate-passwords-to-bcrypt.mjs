/**
 * Migra contrasenyes en text pla de la col·lecció `users` a bcrypt.
 * Executa: node scripts/migrate-passwords-to-bcrypt.mjs
 * Dry-run: node scripts/migrate-passwords-to-bcrypt.mjs --dry-run
 */
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()
import bcrypt from 'bcryptjs'
import admin from 'firebase-admin'

const dryRun = process.argv.includes('--dry-run')
const BCRYPT_ROUNDS = 12

function isPasswordHashed(value) {
  const trimmed = String(value || '').trim()
  return trimmed.startsWith('$2a$') || trimmed.startsWith('$2b$') || trimmed.startsWith('$2y$')
}

function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Falten FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY')
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }

  return admin.firestore()
}

async function main() {
  const db = initFirebase()
  const snap = await db.collection('users').get()

  let migrated = 0
  let skippedHashed = 0
  let skippedEmpty = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const password = String(data.password || '').trim()

    if (!password) {
      skippedEmpty++
      continue
    }

    if (isPasswordHashed(password)) {
      skippedHashed++
      continue
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS)
    if (!dryRun) {
      await doc.ref.set({ password: hashed, updatedAt: Date.now() }, { merge: true })
    }
    migrated++
    console.log(`${dryRun ? '[dry-run] ' : ''}Migrat: ${doc.id} (${data.name || 'sense nom'})`)
  }

  console.log('---')
  console.log(`Total usuaris: ${snap.size}`)
  console.log(`Migrats: ${migrated}`)
  console.log(`Ja hashejats: ${skippedHashed}`)
  console.log(`Sense contrasenya: ${skippedEmpty}`)
  if (dryRun) console.log('Mode dry-run: cap canvi escrit a Firestore.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
