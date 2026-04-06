export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { canAccessIncidentsModule, normalizeIncidentActionStatus } from '@/lib/incidentPolicy'

function tsToIso(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as FirebaseFirestore.Timestamp).toDate().toISOString()
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts).toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const incidentId = new URL(req.url).searchParams.get('incidentId')?.trim()
    if (!incidentId) {
      return NextResponse.json({ error: 'Falta incidentId' }, { status: 400 })
    }

    const snap = await firestoreAdmin
      .collection('incident_actions')
      .where('incidentId', '==', incidentId)
      .get()

    const actions = snap.docs
      .map((doc) => {
        const d = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          incidentId: String(d.incidentId || ''),
          title: String(d.title || ''),
          description: String(d.description || ''),
          status: normalizeIncidentActionStatus(String(d.status || 'open')),
          assignedToName: String(d.assignedToName || ''),
          department: String(d.department || ''),
          dueAt: tsToIso(d.dueAt),
          createdAt: tsToIso(d.createdAt),
          createdById: String(d.createdById || ''),
          createdByName: String(d.createdByName || ''),
          updatedAt: tsToIso(d.updatedAt),
          closedAt: d.closedAt ? tsToIso(d.closedAt) : '',
          closedByName: String(d.closedByName || ''),
        }
      })
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

    return NextResponse.json({ actions }, { status: 200 })
  } catch (e) {
    console.error('[incidents/actions GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as {
      id?: string
      role?: string
      department?: string
      name?: string | null
      email?: string | null
    } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await req.json()) as {
      incidentId?: string
      title?: string
      description?: string
      assignedToName?: string
      department?: string
      dueAt?: string | null
    }

    const incidentId = String(body.incidentId || '').trim()
    const title = String(body.title || '').trim()
    if (!incidentId || !title) {
      return NextResponse.json({ error: 'Falten incidentId o title' }, { status: 400 })
    }

    const incSnap = await firestoreAdmin.collection('incidents').doc(incidentId).get()
    if (!incSnap.exists) {
      return NextResponse.json({ error: 'Incidencia no trobada' }, { status: 404 })
    }

    const now = admin.firestore.Timestamp.now()
    const dueRaw = body.dueAt ? Date.parse(body.dueAt) : NaN
    const dueAt =
      Number.isFinite(dueRaw) && dueRaw > 0 ? admin.firestore.Timestamp.fromMillis(dueRaw) : null

    const createdByName = (user.name || user.email || '').trim() || 'Usuari'

    const docRef = await firestoreAdmin.collection('incident_actions').add({
      incidentId,
      title,
      description: String(body.description || '').trim(),
      status: 'open',
      assignedToName: String(body.assignedToName || '').trim(),
      department: String(body.department || '').trim(),
      dueAt,
      createdAt: now,
      createdById: user.id,
      createdByName,
      updatedAt: now,
      closedAt: null,
      closedByName: '',
    })

    const created = await docRef.get()
    const d = created.data() as Record<string, unknown>

    return NextResponse.json(
      {
        action: {
          id: created.id,
          incidentId: String(d.incidentId || ''),
          title: String(d.title || ''),
          description: String(d.description || ''),
          status: normalizeIncidentActionStatus(String(d.status || 'open')),
          assignedToName: String(d.assignedToName || ''),
          department: String(d.department || ''),
          dueAt: tsToIso(d.dueAt),
          createdAt: tsToIso(d.createdAt),
          createdById: String(d.createdById || ''),
          createdByName: String(d.createdByName || ''),
          updatedAt: tsToIso(d.updatedAt),
          closedAt: '',
          closedByName: '',
        },
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('[incidents/actions POST]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
