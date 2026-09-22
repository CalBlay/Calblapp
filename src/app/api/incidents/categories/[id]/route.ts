export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { requireIncidentsTypologiesManage } from '@/lib/server/incidentsApiAuth'
import { DEFAULT_INCIDENT_CATEGORIES } from '@/lib/incidentTypology'
import type { DocumentData } from 'firebase-admin/firestore'

const CATEGORY_ID_PATTERN = /^[0-9A-Za-z_-]{1,32}$/

class CategoryConflictError extends Error {}

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
    const auth = await requireIncidentsTypologiesManage()
    if (!auth.ok) return auth.res

    const { id: rawId } = await ctx.params
    const id = String(rawId || '').trim()
    if (!id) return NextResponse.json({ error: 'Id invalid' }, { status: 400 })

    const body = (await req.json()) as {
      id?: string
      label?: string
      active?: boolean
      sortOrder?: number
    }

    const nextId =
      typeof body.id === 'string' ? body.id.trim().replace(/\s+/g, '') : id
    if (!CATEGORY_ID_PATTERN.test(nextId)) {
      return NextResponse.json({ error: 'Identificador de categoria no vàlid' }, { status: 400 })
    }

    const ref = firestoreAdmin.collection('incident_categories').doc(id)
    const targetRef = firestoreAdmin.collection('incident_categories').doc(nextId)
    const now = admin.firestore.Timestamp.now()
    const patch: Record<string, unknown> = { updatedAt: now }
    if (typeof body.label === 'string') {
      const label = body.label.trim()
      if (!label) return NextResponse.json({ error: 'Etiqueta buida' }, { status: 400 })
      patch.label = label
    }
    if (typeof body.active === 'boolean') patch.active = body.active
    if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
      patch.sortOrder = body.sortOrder
    }

    const merged = await firestoreAdmin.runTransaction(async (transaction) => {
      const sourceSnap = await transaction.get(ref)
      const targetSnap = nextId === id ? sourceSnap : await transaction.get(targetRef)
      const current = mergeOneCategory(id, sourceSnap.data())
      const next = {
        id: nextId,
        label: typeof patch.label === 'string' ? patch.label : current.label,
        active: typeof patch.active === 'boolean' ? patch.active : current.active,
        sortOrder: typeof patch.sortOrder === 'number' ? patch.sortOrder : current.sortOrder,
      }

      if (nextId !== id) {
        const targetIsDefault = DEFAULT_INCIDENT_CATEGORIES.some((category) => category.id === nextId)
        const targetIsDeleted = targetSnap.exists && targetSnap.data()?.deleted === true
        const targetIsLive = targetSnap.exists && !targetIsDeleted
        if ((targetIsDefault && !targetIsDeleted) || targetIsLive) {
          throw new CategoryConflictError('Ja existeix una categoria amb aquest id')
        }

        transaction.set(targetRef, {
          label: next.label,
          active: next.active,
          sortOrder: next.sortOrder,
          createdAt: now,
          updatedAt: now,
        })

        const sourceIsDefault = DEFAULT_INCIDENT_CATEGORIES.some((category) => category.id === id)
        if (sourceIsDefault) {
          transaction.set(
            ref,
            {
              deleted: true,
              active: false,
              updatedAt: now,
              ...(!sourceSnap.exists ? { createdAt: now } : {}),
            },
            { merge: true }
          )
        } else if (sourceSnap.exists) {
          transaction.delete(ref)
        }
      } else {
        transaction.set(
          ref,
          {
            ...patch,
            ...(!sourceSnap.exists ? { createdAt: now } : {}),
            ...(!sourceSnap.exists && patch.label === undefined ? { label: current.label } : {}),
            ...(!sourceSnap.exists && patch.sortOrder === undefined
              ? { sortOrder: current.sortOrder }
              : {}),
            ...(!sourceSnap.exists && patch.active === undefined ? { active: true } : {}),
          },
          { merge: true }
        )
      }

      return next
    })

    return NextResponse.json({ category: merged }, { status: 200 })
  } catch (e) {
    if (e instanceof CategoryConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    console.error('[incidents/categories PATCH]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
