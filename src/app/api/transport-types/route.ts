export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireTransportsTypesManage } from '@/lib/server/transportsApiAuth'
import {
  readTransportTypeCatalog,
  TRANSPORT_TYPES_COLLECTION,
} from '@/lib/server/transportTypeCatalog'

const VALID_ID = /^[A-Za-z0-9_-]{1,48}$/

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
  const types = await readTransportTypeCatalog({ includeInactive })
  return NextResponse.json({ types })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requireTransportsTypesManage(auth)
  if (denied) return denied

  const body = (await req.json()) as Record<string, unknown>
  const value = String(body.value || '').trim()
  const label = String(body.label || '').trim()
  if (!VALID_ID.test(value)) {
    return NextResponse.json({ error: 'El codi només pot contenir lletres, números, guions i guions baixos.' }, { status: 400 })
  }
  if (!label) return NextResponse.json({ error: 'Cal indicar el nom del tipus.' }, { status: 400 })

  const existingTypes = await readTransportTypeCatalog({ includeInactive: true })
  if (existingTypes.some((type) => type.value === value)) {
    return NextResponse.json({ error: 'Ja existeix un tipus amb aquest codi.' }, { status: 409 })
  }

  await firestoreAdmin.collection(TRANSPORT_TYPES_COLLECTION).doc(value).set({
    label,
    active: body.active !== false,
    sortOrder: typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder) ? body.sortOrder : 999,
    requiresLargeTruckLicense: body.requiresLargeTruckLicense === true,
    refrigeratedByDefault: body.refrigeratedByDefault === true,
    tachographRequired: body.tachographRequired === true,
    serviceIntervalKm:
      typeof body.serviceIntervalKm === 'number' && Number.isFinite(body.serviceIntervalKm)
        ? Math.max(0, body.serviceIntervalKm)
        : 20000,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
