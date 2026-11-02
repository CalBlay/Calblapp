/**
 * Recalcula `dayKeys` per a les reserves comercials antigues.
 *
 * Simulacio (per defecte):
 *   node scripts/backfillCommercialReservationDayKeys.mjs
 * Aplicacio:
 *   node scripts/backfillCommercialReservationDayKeys.mjs --apply
 */
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

import admin from 'firebase-admin'

const COLLECTION = 'commercialVehicleReservations'
const MAX_RESERVATION_DAYS = 370
const WRITE_BATCH_SIZE = 400
const apply = process.argv.includes('--apply')

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

function isIsoDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function buildDayKeys(data) {
  const start = String(data.date || '').trim()
  const end = String(data.endDate || '').trim() || start
  if (!isIsoDay(start) || !isIsoDay(end) || end < start) return null

  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null

  const dayKeys = []
  const cursor = new Date(startDate)
  while (cursor <= endDate && dayKeys.length <= MAX_RESERVATION_DAYS) {
    dayKeys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dayKeys.length <= MAX_RESERVATION_DAYS ? dayKeys : null
}

function sameDays(current, expected) {
  return (
    Array.isArray(current) &&
    current.length === expected.length &&
    current.every((value, index) => value === expected[index])
  )
}

async function main() {
  const db = initFirebase()
  const snap = await db.collection(COLLECTION).get()
  const updates = []
  const invalid = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const dayKeys = buildDayKeys(data)
    if (!dayKeys) {
      invalid.push({ id: doc.id, date: data.date || '', endDate: data.endDate || '' })
      continue
    }
    if (!sameDays(data.dayKeys, dayKeys)) updates.push({ ref: doc.ref, id: doc.id, dayKeys })
  }

  console.log(`${apply ? '[apply]' : '[dry-run]'} Projecte: ${process.env.FIREBASE_PROJECT_ID}`)
  console.log(`Documents llegits: ${snap.size}`)
  console.log(`Documents a actualitzar: ${updates.length}`)
  console.log(`Documents invalids (no modificats): ${invalid.length}`)

  for (const row of invalid) {
    console.warn(`  INVALID ${row.id}: date=${row.date} endDate=${row.endDate}`)
  }

  if (!apply) {
    console.log('Mode dry-run: cap canvi escrit a Firestore.')
    return
  }

  let written = 0
  for (let index = 0; index < updates.length; index += WRITE_BATCH_SIZE) {
    const chunk = updates.slice(index, index + WRITE_BATCH_SIZE)
    const batch = db.batch()
    for (const update of chunk) {
      batch.set(
        update.ref,
        {
          dayKeys: update.dayKeys,
          dayKeysBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    await batch.commit()
    written += chunk.length
  }

  console.log(`Documents actualitzats: ${written}`)
}

main().catch((error) => {
  console.error('Error backfill commercial reservation dayKeys:', error)
  process.exit(1)
})
