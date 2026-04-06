export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { canAccessIncidentsModule, normalizeIncidentActionStatus } from '@/lib/incidentPolicy'

function tsToIso(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as FirebaseFirestore.Timestamp).toDate().toISOString()
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts).toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

const CHUNK = 30
const MAX_IDS = 1000

/**
 * POST { incidentIds: string[] }
 * Retorna totes les accions derivades per a aquestes incidències (consultes per blocs de 30 a Firestore).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    let body: { incidentIds?: unknown }
    try {
      body = (await req.json()) as { incidentIds?: unknown }
    } catch {
      return NextResponse.json({ error: 'JSON no vàlid' }, { status: 400 })
    }

    const rawIds = Array.isArray(body.incidentIds) ? body.incidentIds : []
    const unique = [...new Set(rawIds.map((x) => String(x || '').trim()).filter(Boolean))].slice(
      0,
      MAX_IDS
    )

    if (unique.length === 0) {
      return NextResponse.json({ actions: [] }, { status: 200 })
    }

    const merged: Array<{
      id: string
      incidentId: string
      title: string
      description: string
      status: ReturnType<typeof normalizeIncidentActionStatus>
      assignedToName: string
      department: string
      dueAt: string
      createdAt: string
      closedAt: string
    }> = []

    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK)
      const snap = await firestoreAdmin
        .collection('incident_actions')
        .where('incidentId', 'in', chunk)
        .get()

      snap.docs.forEach((doc) => {
        const d = doc.data() as Record<string, unknown>
        merged.push({
          id: doc.id,
          incidentId: String(d.incidentId || ''),
          title: String(d.title || ''),
          description: String(d.description || ''),
          status: normalizeIncidentActionStatus(String(d.status || 'open')),
          assignedToName: String(d.assignedToName || ''),
          department: String(d.department || ''),
          dueAt: tsToIso(d.dueAt),
          createdAt: tsToIso(d.createdAt),
          closedAt: d.closedAt ? tsToIso(d.closedAt) : '',
        })
      })
    }

    merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

    return NextResponse.json({ actions: merged }, { status: 200 })
  } catch (e) {
    console.error('[incidents/actions/batch POST]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
