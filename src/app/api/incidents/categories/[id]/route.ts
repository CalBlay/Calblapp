export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { canManageIncidentCategories } from '@/lib/incidentPolicy'
import { DEFAULT_INCIDENT_CATEGORIES } from '@/lib/incidentTypology'
import type { DocumentData } from 'firebase-admin/firestore'

function mergeOneCategory(
  id: string,
  fireData: DocumentData | undefined
): { id: string; label: string; active: boolean; sortOrder: number } {
  const def = DEFAULT_INCIDENT_CATEGORIES.find((c) => c.id === id)
  const n = parseInt(id, 10)
  const baseSort = Number.isFinite(n) ? n : 999
  if (!fireData) {
    return {
      id,
      label: def?.label || id,
      active: true,
      sortOrder: baseSort,
    }
  }
  return {
    id,
    label:
      typeof fireData.label === 'string' && fireData.label.trim()
        ? fireData.label.trim()
        : def?.label || id,
    active: fireData.active !== false,
    sortOrder:
      typeof fireData.sortOrder === 'number' && Number.isFinite(fireData.sortOrder)
        ? fireData.sortOrder
        : baseSort,
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canManageIncidentCategories(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { id: rawId } = await ctx.params
    const id = String(rawId || '').trim()
    if (!id) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const body = (await req.json()) as {
      label?: string
      active?: boolean
      sortOrder?: number
    }

    const ref = firestoreAdmin.collection('incident_categories').doc(id)
    const snap = await ref.get()
    const defaults = mergeOneCategory(id, undefined)

    const patch: Record<string, unknown> = {
      updatedAt: admin.firestore.Timestamp.now(),
    }
    if (typeof body.label === 'string') {
      const label = body.label.trim()
      if (!label) return NextResponse.json({ error: 'Etiqueta buida' }, { status: 400 })
      patch.label = label
    }
    if (typeof body.active === 'boolean') patch.active = body.active
    if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
      patch.sortOrder = body.sortOrder
    }

    if (!snap.exists) {
      if (patch.label === undefined) patch.label = defaults.label
      if (patch.sortOrder === undefined) patch.sortOrder = defaults.sortOrder
      if (patch.active === undefined) patch.active = true
      patch.createdAt = admin.firestore.Timestamp.now()
    }

    await ref.set(patch, { merge: true })

    const updated = await ref.get()
    const merged = mergeOneCategory(id, updated.data())

    return NextResponse.json({ category: merged }, { status: 200 })
  } catch (e) {
    console.error('[incidents/categories PATCH]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
