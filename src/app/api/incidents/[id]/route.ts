// File: src/app/api/incidents/[id]/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { canAccessIncidentsModule, normalizeIncidentStatus } from '@/lib/incidentPolicy'

function normalizeTimestamp(ts: unknown): string {
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString()
  }
  if (typeof ts === 'string') return ts
  return ''
}

function normalizeImportance(raw: string): string {
  const v = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  if (v === 'urgent') return 'urgent'
  if (v === 'alta') return 'alta'
  if (v === 'baixa') return 'baixa'
  if (v === 'normal' || v === 'mitjana') return 'normal'
  return 'normal'
}

const PATCHABLE = new Set([
  'description',
  'originDepartment',
  'importance',
  'priority',
  'status',
  'resolutionNote',
])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { id } = await ctx.params
    const incidentId = String(id || '').trim()
    if (!incidentId) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const payload = (await req.json()) as Record<string, unknown>

    const docRef = firestoreAdmin.collection('incidents').doc(incidentId)
    const snap = await docRef.get()

    if (!snap.exists) {
      return NextResponse.json({ error: 'Incidència no trobada' }, { status: 404 })
    }

    const cleaned: Record<string, unknown> = {}
    let hasPatch = false

    for (const key of PATCHABLE) {
      if (!(key in payload)) continue
      const val = payload[key]
      if (key === 'description' && typeof val === 'string') {
        cleaned.description = val
        hasPatch = true
      }
      if (key === 'originDepartment' && typeof val === 'string') {
        cleaned.originDepartment = val.trim()
        hasPatch = true
      }
      if (key === 'importance' && typeof val === 'string') {
        cleaned.importance = normalizeImportance(val)
        hasPatch = true
      }
      if (key === 'priority' && typeof val === 'string') {
        cleaned.priority = val.trim()
        cleaned.importance = normalizeImportance(val)
        hasPatch = true
      }
      if (key === 'status' && typeof val === 'string') {
        cleaned.status = normalizeIncidentStatus(val)
        hasPatch = true
      }
      if (key === 'resolutionNote' && typeof val === 'string') {
        cleaned.resolutionNote = val.trim()
        hasPatch = true
      }
    }

    if (!hasPatch) {
      return NextResponse.json({ error: 'Cap camp valid per actualitzar' }, { status: 400 })
    }

    cleaned.updatedAt = admin.firestore.Timestamp.now()

    await docRef.set(cleaned, { merge: true })

    const updated = await docRef.get()
    const data = updated.data() || {}

    const incident = {
      id: updated.id,
      ...data,
      createdAt: normalizeTimestamp(data.createdAt),
      updatedAt: normalizeTimestamp(data.updatedAt),
    }

    return NextResponse.json({ incident }, { status: 200 })
  } catch (err) {
    console.error('[incidents PATCH] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
