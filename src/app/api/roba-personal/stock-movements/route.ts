export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { adjustmentStockMovementReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'
import { enrichStockMovementsDeliveryContext } from '@/lib/roba-personal/stockMovementsEnrich'

const MOV = DOTACIO_COLLECTIONS.stockMovements
const PROD = DOTACIO_COLLECTIONS.products
const USERS = 'users'

async function enrichStockMovementsWithCreatorNames(
  items: ReturnType<typeof serializeFirestoreDoc>[]
): Promise<ReturnType<typeof serializeFirestoreDoc>[]> {
  const uids = new Set<string>()
  for (const row of items) {
    const uid = String((row as { createdByUserId?: string }).createdByUserId || '').trim()
    if (uid) uids.add(uid)
  }
  if (uids.size === 0) return items

  const idList = [...uids]
  const nameById = new Map<string, string>()
  for (let i = 0; i < idList.length; i += 10) {
    const chunk = idList.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(USERS).doc(id)))
    for (const s of snaps) {
      if (!s.exists) continue
      const n = String((s.data() as { name?: string }).name || '').trim()
      if (n) nameById.set(s.id, n)
    }
  }

  return items.map((row) => {
    const uid = String((row as { createdByUserId?: string }).createdByUserId || '').trim()
    const createdByUserName = uid ? nameById.get(uid) ?? null : null
    return { ...row, createdByUserName } as typeof row
  })
}

const ALLOWED_MANUAL_POST_REASONS = new Set([
  'manual',
  'manual_adjust',
  'manual_purchase',
  'manual_return',
])

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
        .limit(500)
        .get()
    : await db.collection(MOV).orderBy('createdAt', 'desc').limit(500).get()

  const items = snap.docs.map((d) =>
    serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
  )
  const withDelivery = await enrichStockMovementsDeliveryContext(items)
  const enriched = await enrichStockMovementsWithCreatorNames(withDelivery)
  return NextResponse.json(enriched)
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

  const reasonRaw = String(body.reason || '').trim() || 'manual_adjust'
  if (!ALLOWED_MANUAL_POST_REASONS.has(reasonRaw)) {
    return NextResponse.json(
      { error: 'Tipus de moviment no vàlid per a aquest formulari.' },
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
        reason: reasonRaw,
        reference: adjustmentStockMovementReferenceFromDocId(movementRef.id),
        notes: String(body.notes || '').trim() || null,
        createdByUserId: auth.userId,
        createdAt: FieldValue.serverTimestamp(),
        quantityReservedDelta: 0,
        productReservedAfter: reserved,
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
