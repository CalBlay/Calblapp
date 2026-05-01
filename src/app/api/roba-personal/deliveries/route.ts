export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'

const DEL = DOTACIO_COLLECTIONS.deliveries
const MOV = DOTACIO_COLLECTIONS.stockMovements
const PROD = DOTACIO_COLLECTIONS.products
const WORK = DOTACIO_COLLECTIONS.workers

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const snap = await db.collection(DEL).limit(200).get()
  const items = snap.docs
    .map((d) => serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) =>
      String(b.deliveredAt || b.createdAt || '').localeCompare(
        String(a.deliveredAt || a.createdAt || '')
      )
    )
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    workerId?: string
    lines?: Array<{ productId?: string; quantity?: number; notes?: string }>
    notes?: string
    acknowledgmentRef?: string
  }
  const workerId = String(body.workerId || '').trim()
  if (!workerId) {
    return NextResponse.json({ error: 'Cal workerId.' }, { status: 400 })
  }

  const wsnap = await db.collection(WORK).doc(workerId).get()
  if (!wsnap.exists) {
    return NextResponse.json({ error: 'Treballador no trobat.' }, { status: 400 })
  }

  const linesIn = Array.isArray(body.lines) ? body.lines : []
  const lines = linesIn
    .map((l) => ({
      productId: String(l.productId || '').trim(),
      quantity: Number(l.quantity),
      notes: String(l.notes || '').trim() || undefined,
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cal almenys una línia vàlida.' }, { status: 400 })
  }

  const deliveryRef = db.collection(DEL).doc()
  const now = FieldValue.serverTimestamp()

  try {
    await db.runTransaction(async (tx) => {
      for (const line of lines) {
        const pref = db.collection(PROD).doc(line.productId)
        const psnap = await tx.get(pref)
        if (!psnap.exists) throw new Error(`Producte no trobat: ${line.productId}`)
        const cur = Number((psnap.data() as { quantityOnHand?: number }).quantityOnHand ?? 0)
        const next = cur - line.quantity
        if (next < 0) throw new Error('Estoc insuficient per completar l’entrega.')
        tx.update(pref, {
          quantityOnHand: next,
          updatedAt: now,
        })
      }

      tx.set(deliveryRef, {
        workerId,
        lines,
        deliveredAt: now,
        acknowledgmentRef: String(body.acknowledgmentRef || '').trim() || null,
        notes: String(body.notes || '').trim() || null,
        createdByUserId: auth.userId,
        createdAt: now,
      })

      for (const line of lines) {
        const mref = db.collection(MOV).doc()
        tx.set(mref, {
          productId: line.productId,
          quantityDelta: -line.quantity,
          reason: 'delivery',
          reference: deliveryRef.id,
          notes: `Entrega treballador ${workerId}`,
          createdByUserId: auth.userId,
          createdAt: now,
        })
      }
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const doc = await deliveryRef.get()
  return NextResponse.json(
    serializeFirestoreDoc(doc.id, doc.data() as Record<string, unknown>),
    { status: 201 }
  )
}
