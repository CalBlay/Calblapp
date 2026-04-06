export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import {
  canAccessIncidentsModule,
  canFetchIncidentCategories,
  canManageIncidentCategories,
} from '@/lib/incidentPolicy'
import { DEFAULT_INCIDENT_CATEGORIES } from '@/lib/incidentTypology'

export type IncidentCategoryRow = {
  id: string
  label: string
  active: boolean
  sortOrder: number
  fromDefaults: boolean
}

function mergeCategories(fireDocs: QueryDocumentSnapshot<DocumentData>[]): IncidentCategoryRow[] {
  const byId = new Map<string, IncidentCategoryRow>()

  for (const d of DEFAULT_INCIDENT_CATEGORIES) {
    const n = parseInt(d.id, 10)
    byId.set(d.id, {
      id: d.id,
      label: d.label,
      active: true,
      sortOrder: Number.isFinite(n) ? n : 999,
      fromDefaults: true,
    })
  }

  for (const doc of fireDocs) {
    const id = doc.id
    const data = doc.data() as Record<string, unknown>
    const prev = byId.get(id)
    const sortOrder =
      typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder)
        ? data.sortOrder
        : prev?.sortOrder ?? 999
    byId.set(id, {
      id,
      label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : prev?.label || id,
      active: data.active !== false,
      sortOrder,
      fromDefaults: Boolean(prev?.fromDefaults),
    })
  }

  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canFetchIncidentCategories(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const snap = await firestoreAdmin.collection('incident_categories').get()
    const categories = mergeCategories(snap.docs)

    return NextResponse.json({ categories }, { status: 200 })
  } catch (e) {
    console.error('[incidents/categories GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canManageIncidentCategories(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await req.json()) as {
      id?: string
      label?: string
      sortOrder?: number
      active?: boolean
    }

    const id = String(body.id || '')
      .trim()
      .replace(/\s+/g, '')
    const label = String(body.label || '').trim()

    if (!id || !/^[0-9A-Za-z_-]{1,32}$/.test(id)) {
      return NextResponse.json({ error: 'Identificador de categoria no valid' }, { status: 400 })
    }
    if (!label) {
      return NextResponse.json({ error: 'Cal una etiqueta' }, { status: 400 })
    }

    const ref = firestoreAdmin.collection('incident_categories').doc(id)
    const existing = await ref.get()
    if (existing.exists) {
      return NextResponse.json({ error: 'Ja existeix una categoria amb aquest id' }, { status: 409 })
    }

    const sortOrder =
      typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : parseInt(id, 10) || 999
    const active = body.active !== false

    await ref.set({
      label,
      sortOrder,
      active,
      updatedAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
    })

    const snap = await firestoreAdmin.collection('incident_categories').get()
    const categories = mergeCategories(snap.docs)

    return NextResponse.json({ ok: true, categories }, { status: 201 })
  } catch (e) {
    console.error('[incidents/categories POST]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
