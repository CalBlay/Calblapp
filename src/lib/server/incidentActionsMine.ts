import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeIncidentActionStatus } from '@/lib/incidentPolicy'
import {
  isIncidentActionAssignedToUser,
  type IncidentActionMineIncidentMeta,
  type IncidentActionMineRow,
} from '@/lib/incidentActionsMine'

function tsToIso(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as FirebaseFirestore.Timestamp).toDate().toISOString()
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts).toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

async function fetchIncidentMetaByIds(ids: string[]) {
  const map = new Map<string, IncidentActionMineIncidentMeta>()
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!unique.length) return map

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const refs = chunk.map((id) => firestoreAdmin.collection('incidents').doc(id))
    const snaps = await firestoreAdmin.getAll(...refs)
    for (const snap of snaps) {
      if (!snap.exists) continue
      const d = snap.data() as Record<string, unknown>
      map.set(snap.id, {
        incidentNumber: String(d.incidentNumber || '').trim() || null,
        eventTitle: String(d.eventTitle || '').trim() || null,
        eventCode: String(d.eventCode || '').trim() || null,
        eventDate: String(d.eventDate || '').trim() || null,
        department: String(d.department || '').trim() || null,
      })
    }
  }

  return map
}

function mapIncidentActionRows(
  entries: Array<[string, FirebaseFirestore.DocumentData]>,
  incidentMeta: Map<string, IncidentActionMineIncidentMeta>
): IncidentActionMineRow[] {
  const rows: IncidentActionMineRow[] = entries.map(([id, d]) => {
    const incidentId = String(d.incidentId || '').trim()
    return {
      id,
      incidentId,
      title: String(d.title || ''),
      description: String(d.description || ''),
      status: normalizeIncidentActionStatus(String(d.status || 'open')),
      assignedToName: String(d.assignedToName || ''),
      department: String(d.department || ''),
      dueAt: tsToIso(d.dueAt),
      createdAt: tsToIso(d.createdAt),
      closedAt: d.closedAt ? tsToIso(d.closedAt) : '',
      incident: incidentMeta.get(incidentId) || {
        incidentNumber: null,
        eventTitle: null,
        eventCode: null,
        eventDate: null,
        department: null,
      },
    }
  })

  rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return rows
}

export async function fetchAssignedIncidentActionsForUser(params: {
  userId: string
  userName?: string | null
}): Promise<IncidentActionMineRow[]> {
  const userId = String(params.userId || '').trim()
  const userName = String(params.userName || '').trim()
  const merged = new Map<string, FirebaseFirestore.DocumentData>()

  if (userId) {
    const byIdSnap = await firestoreAdmin
      .collection('incident_actions')
      .where('assignedToId', '==', userId)
      .get()
    for (const doc of byIdSnap.docs) {
      merged.set(doc.id, doc.data())
    }
  }

  if (userName) {
    const byNameSnap = await firestoreAdmin
      .collection('incident_actions')
      .where('assignedToName', '==', userName)
      .get()
    for (const doc of byNameSnap.docs) {
      const data = doc.data()
      if (!isIncidentActionAssignedToUser(data, { id: userId, name: userName })) continue
      if (!merged.has(doc.id)) merged.set(doc.id, data)
    }
  }

  const incidentIds = [...merged.values()]
    .map((d) => String(d.incidentId || '').trim())
    .filter(Boolean)
  const incidentMeta = await fetchIncidentMetaByIds(incidentIds)

  return mapIncidentActionRows([...merged.entries()], incidentMeta)
}

export async function fetchAllIncidentActions(): Promise<IncidentActionMineRow[]> {
  const snap = await firestoreAdmin.collection('incident_actions').get()
  const entries = snap.docs.map((doc) => [doc.id, doc.data()] as [string, FirebaseFirestore.DocumentData])
  const incidentIds = entries
    .map(([, d]) => String(d.incidentId || '').trim())
    .filter(Boolean)
  const incidentMeta = await fetchIncidentMetaByIds(incidentIds)
  return mapIncidentActionRows(entries, incidentMeta)
}
