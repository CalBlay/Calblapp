export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireTransportsTypesManage } from '@/lib/server/transportsApiAuth'
import { TRANSPORT_TYPES_COLLECTION } from '@/lib/server/transportTypeCatalog'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requireTransportsTypesManage(auth)
  if (denied) return denied

  const { id } = await context.params
  const body = (await req.json()) as Record<string, unknown>
  const patch: Record<string, unknown> = { updatedAt: admin.firestore.Timestamp.now(), deleted: false }

  if (typeof body.label === 'string') {
    const label = body.label.trim()
    if (!label) return NextResponse.json({ error: 'El nom no pot estar buit.' }, { status: 400 })
    patch.label = label
  }
  if (typeof body.active === 'boolean') patch.active = body.active
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) patch.sortOrder = body.sortOrder
  if (typeof body.requiresLargeTruckLicense === 'boolean') {
    patch.requiresLargeTruckLicense = body.requiresLargeTruckLicense
  }
  if (typeof body.refrigeratedByDefault === 'boolean') {
    patch.refrigeratedByDefault = body.refrigeratedByDefault
  }
  if (typeof body.tachographRequired === 'boolean') {
    patch.tachographRequired = body.tachographRequired
  }
  if (typeof body.serviceIntervalKm === 'number' && Number.isFinite(body.serviceIntervalKm)) {
    patch.serviceIntervalKm = Math.max(0, body.serviceIntervalKm)
  }

  await firestoreAdmin.collection(TRANSPORT_TYPES_COLLECTION).doc(id).set(patch, { merge: true })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requireTransportsTypesManage(auth)
  if (denied) return denied

  const { id } = await context.params
  const inUse = await firestoreAdmin.collection('transports').where('type', '==', id).limit(1).get()
  if (!inUse.empty) {
    return NextResponse.json(
      { error: 'Aquest tipus està assignat a vehicles. Desactiva’l o reassigna els vehicles abans d’eliminar-lo.' },
      { status: 409 }
    )
  }

  await firestoreAdmin.collection(TRANSPORT_TYPES_COLLECTION).doc(id).set(
    { deleted: true, active: false, updatedAt: admin.firestore.Timestamp.now() },
    { merge: true }
  )
  return NextResponse.json({ ok: true })
}
