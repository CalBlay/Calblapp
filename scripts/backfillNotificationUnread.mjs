/**
 * Omple `notificationUnread` als documents `users` a partir de les subcol·leccions notifications.
 *
 * Ús:
 *   node scripts/backfillNotificationUnread.mjs
 *   node scripts/backfillNotificationUnread.mjs --dry-run
 *   node scripts/backfillNotificationUnread.mjs --user-id=ABC123
 *   node scripts/backfillNotificationUnread.mjs --limit=50
 */
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

import admin from 'firebase-admin'

const UNREAD_COUNTS_VERSION = 1
const dryRun = process.argv.includes('--dry-run')
const userIdArg = process.argv.find((arg) => arg.startsWith('--user-id='))?.split('=')[1]?.trim()
const limitArg = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 0)

const TORN_TYPES = ['torn', 'NEW_SHIFTS']
const PROJECT_TYPES = [
  'project_assignment',
  'project_block_assignment',
  'project_task_assignment',
]
const LOGISTICS_TYPES = ['commercial_vehicle_request', 'commercial_vehicle_validation']
const MAINTENANCE_TYPES = [
  'maintenance_ticket_new',
  'maintenance_ticket_assigned',
  'maintenance_ticket_validated',
  'maintenance_ticket_stale',
  'maintenance_ticket_external_stale',
]
const INCIDENT_TYPES = ['incident_marketing_9xx_new']

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

function notificationsRef(db, userId) {
  return db.collection('users').doc(userId).collection('notifications')
}

async function countUnread(db, userId, options = {}) {
  let query = notificationsRef(db, userId).where('read', '==', false)
  if (options.type) {
    query = query.where('type', '==', options.type)
  }
  const snap = await query.count().get()
  return snap.data().count
}

async function countUnreadByTypes(db, userId, types) {
  const unique = [...new Set(types.map((t) => String(t || '').trim()).filter(Boolean))]
  if (unique.length === 0) return 0
  if (unique.length === 1) return countUnread(db, userId, { type: unique[0] })

  const chunks = []
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10))
  }
  const counts = await Promise.all(
    chunks.map((chunk) =>
      notificationsRef(db, userId)
        .where('read', '==', false)
        .where('type', 'in', chunk)
        .count()
        .get()
        .then((snap) => snap.data().count)
    )
  )
  return counts.reduce((sum, n) => sum + n, 0)
}

async function syncUserBuckets(db, userId) {
  const [
    user_request,
    user_request_result,
    torn,
    projects,
    logistics,
    maintenance,
    incidents,
  ] = await Promise.all([
    countUnread(db, userId, { type: 'user_request' }),
    countUnread(db, userId, { type: 'user_request_result' }),
    countUnreadByTypes(db, userId, TORN_TYPES),
    countUnreadByTypes(db, userId, PROJECT_TYPES),
    countUnreadByTypes(db, userId, LOGISTICS_TYPES),
    countUnreadByTypes(db, userId, MAINTENANCE_TYPES),
    countUnreadByTypes(db, userId, INCIDENT_TYPES),
  ])

  return {
    user_request,
    user_request_result,
    torn,
    projects,
    logistics,
    maintenance,
    incidents,
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Date.now(),
  }
}

async function main() {
  const db = initFirebase()
  let userDocs = []

  if (userIdArg) {
    const snap = await db.collection('users').doc(userIdArg).get()
    if (!snap.exists) {
      throw new Error(`Usuari no trobat: ${userIdArg}`)
    }
    userDocs = [snap]
  } else {
    let query = db.collection('users')
    if (limitArg > 0) {
      query = query.limit(limitArg)
    }
    const snap = await query.get()
    userDocs = snap.docs
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Backfill notificationUnread per ${userDocs.length} usuari(s)...`
  )

  let updated = 0
  for (const doc of userDocs) {
    const buckets = await syncUserBuckets(db, doc.id)
    const total =
      buckets.user_request +
      buckets.user_request_result +
      buckets.torn +
      buckets.projects +
      buckets.logistics +
      buckets.maintenance +
      buckets.incidents

    console.log(
      `  ${doc.id}: total=${total} (torn=${buckets.torn}, projects=${buckets.projects}, maint=${buckets.maintenance})`
    )

    if (!dryRun) {
      await doc.ref.set({ notificationUnread: buckets }, { merge: true })
    }
    updated++
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Fet. Usuaris processats: ${updated}`)
}

main().catch((err) => {
  console.error('Error backfill notificationUnread:', err)
  process.exit(1)
})
