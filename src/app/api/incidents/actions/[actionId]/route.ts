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

export async function PATCH(req: Request, ctx: { params: Promise<{ actionId: string }> }) {
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

    const { actionId } = await ctx.params
    const id = String(actionId || '').trim()
    if (!id) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const body = (await req.json()) as {
      title?: string
      description?: string
      status?: string
      assignedToName?: string
      department?: string
      dueAt?: string | null
    }

    const ref = firestoreAdmin.collection('incident_actions').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Accio no trobada' }, { status: 404 })
    }

    const now = admin.firestore.Timestamp.now()
    const patch: Record<string, unknown> = { updatedAt: now }

    if (typeof body.title === 'string') {
      const t = body.title.trim()
      if (!t) return NextResponse.json({ error: 'Titol buit' }, { status: 400 })
      patch.title = t
    }
    if (typeof body.description === 'string') patch.description = body.description.trim()
    if (typeof body.assignedToName === 'string') patch.assignedToName = body.assignedToName.trim()
    if (typeof body.department === 'string') patch.department = body.department.trim()

    if (body.dueAt !== undefined) {
      if (body.dueAt === null || body.dueAt === '') {
        patch.dueAt = null
      } else {
        const dueMs = Date.parse(body.dueAt)
        if (Number.isFinite(dueMs) && dueMs > 0) {
          patch.dueAt = admin.firestore.Timestamp.fromMillis(dueMs)
        }
      }
    }

    if (typeof body.status === 'string') {
      const next = normalizeIncidentActionStatus(body.status)
      patch.status = next
      const prevStatus = normalizeIncidentActionStatus(String(snap.get('status') || 'open'))
      if ((next === 'done' || next === 'cancelled') && (prevStatus === 'open' || prevStatus === 'in_progress')) {
        patch.closedAt = now
        patch.closedByName = (user.name || user.email || '').trim() || 'Usuari'
      }
      if (next === 'open' || next === 'in_progress') {
        patch.closedAt = null
        patch.closedByName = ''
      }
    }

    await ref.set(patch, { merge: true })
    const updated = await ref.get()
    const d = updated.data() as Record<string, unknown>

    return NextResponse.json({
      action: {
        id: updated.id,
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
      },
    })
  } catch (e) {
    console.error('[incidents/actions PATCH]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
