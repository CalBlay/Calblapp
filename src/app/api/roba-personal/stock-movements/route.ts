export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { adjustmentStockMovementReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'

const MOV = DOTACIO_COLLECTIONS.stockMovements
const PROD = DOTACIO_COLLECTIONS.products

export async function GET(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const productId = String(searchParams.get('productId') || '').trim()

  const snap = productId
    ? await db
        .collection(MOV)
        .where('productId', '==', productId)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
    : await db.collection(MOV).orderBy('createdAt', 'desc').limit(200).get()

  const items = snap.docs.map((d) =>
    serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
  )
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    productId?: string
    quantityDelta?: number
    reason?: string
    notes?: string
  }
  const productId = String(body.productId || '').trim()
  const quantityDelta = Number(body.quantityDelta)
  if (!productId || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
    return NextResponse.json(
      { error: 'Cal productId i quantityDelta (nombre ≠ 0).' },
      { status: 400 }
    )
  }

  const movementRef = db.collection(MOV).doc()

  try {
    await db.runTransaction(async (tx) => {
      const pref = db.collection(PROD).doc(productId)
      const psnap = await tx.get(pref)
      if (!psnap.exists) throw new Error('Producte no trobat')
      const pdata = psnap.data() as { quantityOnHand?: number; quantityReserved?: number }
      const cur = Number(pdata.quantityOnHand ?? 0)
      const reserved = Number(pdata.quantityReserved ?? 0)
      const next = cur + quantityDelta
      if (next < 0) throw new Error('Estoc insuficient per aquest moviment.')
      if (next < reserved) {
        throw new Error(
          'El moviment deixaria estoc físic per sota de la quantitat reservada. Allibereu reserves abans.'
        )
      }
      tx.update(pref, {
        quantityOnHand: next,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.set(movementRef, {
        productId,
        quantityDelta,
        reason: String(body.reason || '').trim() || 'manual',
        reference: adjustmentStockMovementReferenceFromDocId(movementRef.id),
        notes: String(body.notes || '').trim() || null,
        createdByUserId: auth.userId,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const doc = await movementRef.get()
  return NextResponse.json(
    serializeFirestoreDoc(doc.id, doc.data() as Record<string, unknown>),
    { status: 201 }
  )
}
