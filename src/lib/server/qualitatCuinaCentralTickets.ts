import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { isCuinaCentralMaintenanceTicket } from '@/lib/maintenanceTicketCreators'

const CUINA_CENTRAL_INTAKE = 'manual_cuina_central'
const CACHE_MS = 5 * 60 * 1000

let cachedCuinaCentralUserIds: { ids: string[]; expiresAt: number } | null = null

export async function getCuinaCentralUserIds(): Promise<string[]> {
  const now = Date.now()
  if (cachedCuinaCentralUserIds && cachedCuinaCentralUserIds.expiresAt > now) {
    return cachedCuinaCentralUserIds.ids
  }

  const ids = new Set<string>()
  const snap = await db.collection('users').where('departmentLower', '==', 'cuina central').get()
  for (const doc of snap.docs) ids.add(doc.id)

  const list = Array.from(ids)
  cachedCuinaCentralUserIds = { ids: list, expiresAt: now + CACHE_MS }
  return list
}

export function isQualitatVisibleCuinaCentralTicket(
  ticket: {
    location?: string | null
    source?: string | null
    intakeChannel?: string | null
    createdById?: string | null
  },
  cuinaCentralUserIds: ReadonlySet<string>,
  viewerUserId?: string | null
): boolean {
  const viewerId = String(viewerUserId || '').trim()
  const createdById = String(ticket.createdById || '').trim()
  if (viewerId && createdById && viewerId === createdById) return true
  if (isCuinaCentralMaintenanceTicket(ticket)) return true
  return createdById.length > 0 && cuinaCentralUserIds.has(createdById)
}

type MaintenanceTicketRecord = Record<string, unknown> & {
  createdAt?: string | number | { toDate?: () => Date }
}

async function runOrderedTicketQuery(
  ref: FirebaseFirestore.Query,
  limit: number
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  try {
    const snap = await ref.orderBy('createdAt', 'desc').limit(limit).get()
    return snap.docs
  } catch (queryErr: unknown) {
    const message = queryErr instanceof Error ? queryErr.message : ''
    const needsIndex = message.toLowerCase().includes('index')
    if (!needsIndex) throw queryErr
    const snap = await ref.limit(limit).get()
    return snap.docs
  }
}

/** Consulta tickets de Cuina Central per usuaris de Qualitat (multi-query + merge). */
export async function fetchQualitatCuinaCentralTicketDocs(params: {
  baseRef: FirebaseFirestore.Query
  cuinaCentralUserIds: string[]
  viewerUserId?: string | null
  limit: number
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const fetchLimit = Math.max(params.limit + 1, 200)
  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

  const addDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
    for (const doc of docs) byId.set(doc.id, doc)
  }

  const queries: Promise<FirebaseFirestore.QueryDocumentSnapshot[]>[] = [
    runOrderedTicketQuery(
      params.baseRef.where('intakeChannel', '==', CUINA_CENTRAL_INTAKE),
      fetchLimit
    ),
    runOrderedTicketQuery(
      params.baseRef.where('source', '==', CUINA_CENTRAL_INTAKE),
      fetchLimit
    ),
  ]

  const viewerUserId = String(params.viewerUserId || '').trim()
  if (viewerUserId) {
    queries.push(
      runOrderedTicketQuery(params.baseRef.where('createdById', '==', viewerUserId), fetchLimit)
    )
  }

  for (let i = 0; i < params.cuinaCentralUserIds.length; i += 30) {
    const chunk = params.cuinaCentralUserIds.slice(i, i + 30)
    if (!chunk.length) continue
    queries.push(
      runOrderedTicketQuery(params.baseRef.where('createdById', 'in', chunk), fetchLimit)
    )
  }

  const results = await Promise.all(queries)
  for (const docs of results) addDocs(docs)

  return Array.from(byId.values()).sort((a, b) => {
    const toMs = (ticket: MaintenanceTicketRecord) => {
      const value = ticket.createdAt
      if (value && typeof value === 'object' && typeof value.toDate === 'function') {
        return value.toDate().getTime()
      }
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : 0
      }
      return Number(value || 0)
    }
    return toMs(b.data() as MaintenanceTicketRecord) - toMs(a.data() as MaintenanceTicketRecord)
  })
}
