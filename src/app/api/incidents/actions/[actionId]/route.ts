export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { normalizeIncidentActionStatus } from '@/lib/incidentPolicy'
import {
  canEditIncidentsModule,
  requireIncidentsModuleView,
} from '@/lib/server/incidentsApiAuth'
import { handleIncidentActionAssigneeSideEffects } from '@/lib/incidentActionNotifications'

function tsToIso(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as FirebaseFirestore.Timestamp).toDate().toISOString()
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return new Date(ts).toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

function normalizeComparableText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export async function PATCH(req: Request, ctx: { params: Promise<{ actionId: string }> }) {
  try {
    const auth = await requireIncidentsModuleView()
    if (!auth.ok) return auth.res
    const user = auth.user

    const { actionId } = await ctx.params
    const id = String(actionId || '').trim()
    if (!id) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const body = (await req.json()) as {
      title?: string
      description?: string
      status?: string
      assignedToId?: string
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
    const storedAssignedToName = String(snap.get('assignedToName') || '').trim()
    const storedAssignedToId = String(snap.get('assignedToId') || '').trim()
    const storedOutlookEventId = String(snap.get('outlookEventId') || '').trim()
    const storedOutlookEmail = String(snap.get('outlookAssigneeEmail') || '').trim()
    const incidentId = String(snap.get('incidentId') || '').trim()
    const actionTitle = String(snap.get('title') || '').trim()
    const storedDepartment = String(snap.get('department') || '').trim()
    const createdById = String(snap.get('createdById') || '').trim()

    let assigneeChanged = false
    let dueChanged = false

    if (typeof body.title === 'string') {
      const t = body.title.trim()
      if (!t) return NextResponse.json({ error: 'Titol buit' }, { status: 400 })
      patch.title = t
    }
    if (typeof body.description === 'string') patch.description = body.description.trim()
    if (typeof body.assignedToId === 'string') {
      const nextId = body.assignedToId.trim()
      if (nextId !== storedAssignedToId) assigneeChanged = true
      patch.assignedToId = nextId
    }
    if (typeof body.assignedToName === 'string') {
      const nextName = body.assignedToName.trim()
      if (nextName !== storedAssignedToName) assigneeChanged = true
      patch.assignedToName = nextName
    }
    if (typeof body.department === 'string') patch.department = body.department.trim()

    if (body.dueAt !== undefined) {
      dueChanged = true
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
      const canEditModule = await canEditIncidentsModule(auth.user)
      const assignedNorm = normalizeComparableText(storedAssignedToName)
      const userCandidates = [
        normalizeComparableText(user.name),
        normalizeComparableText(user.email),
      ].filter(Boolean)
      const isAssignedUser = assignedNorm.length > 0 && userCandidates.includes(assignedNorm)

      if (!canEditModule && !isAssignedUser) {
        return NextResponse.json({ error: 'Sense permisos per canviar l estat' }, { status: 403 })
      }

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

    if (assigneeChanged || dueChanged) {
      const updatedSnap = await ref.get()
      const d = updatedSnap.data() as Record<string, unknown>
      const nextAssignedToId = String(d.assignedToId || '').trim()
      const nextAssignedToName = String(d.assignedToName || '').trim()
      const nextDepartment = String(d.department || storedDepartment).trim()
      const nextTitle = String(d.title || actionTitle).trim()
      const nextDueAt = d.dueAt as FirebaseFirestore.Timestamp | null | undefined
      const nextDueIso = nextDueAt ? nextDueAt.toDate().toISOString() : null

      let incidentNumber: string | null = null
      if (incidentId) {
        const incSnap = await firestoreAdmin.collection('incidents').doc(incidentId).get()
        if (incSnap.exists) {
          incidentNumber = String(incSnap.get('incidentNumber') || '').trim() || null
        }
      }

      try {
        const outlook = await handleIncidentActionAssigneeSideEffects({
          actionId: id,
          incidentId,
          incidentNumber,
          actionTitle: nextTitle,
          assignedToId: nextAssignedToId,
          assignedToName: nextAssignedToName,
          dueAtIso: nextDueIso,
          department: nextDepartment,
          createdById,
          previousOutlookEventId: storedOutlookEventId,
          previousOutlookEmail: storedOutlookEmail,
          notifyAssignment: assigneeChanged && !!(nextAssignedToId || nextAssignedToName),
        })
        await ref.set(
          {
            outlookEventId: outlook.outlookEventId || '',
            outlookAssigneeEmail: outlook.outlookEmail || '',
          },
          { merge: true }
        )
      } catch (err) {
        console.error('[incidents/actions PATCH] assignee side effects error', err)
      }
    }

    const updated = await ref.get()
    const d = updated.data() as Record<string, unknown>

    return NextResponse.json({
      action: {
        id: updated.id,
        incidentId: String(d.incidentId || ''),
        title: String(d.title || ''),
        description: String(d.description || ''),
        status: normalizeIncidentActionStatus(String(d.status || 'open')),
        assignedToId: String(d.assignedToId || ''),
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
