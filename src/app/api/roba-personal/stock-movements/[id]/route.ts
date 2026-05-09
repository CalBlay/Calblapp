export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { isReversibleManualStockReason } from '@/lib/roba-personal/stockMovementLabels'

const MOV = DOTACIO_COLLECTIONS.stockMovements
const PROD = DOTACIO_COLLECTIONS.products

/**
 * Elimina un moviment d’ajust manual i reverteix l’efecte sobre quantityOnHand.
 * No s’aplica a moviments d’entregues (delivery, etc.).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const movRef = db.collection(MOV).doc(id)

  try {
    await db.runTransaction(async (tx) => {
      const msnap = await tx.get(movRef)
      if (!msnap.exists) throw new Error('Moviment no trobat.')
      const m = msnap.data() as { productId?: string; quantityDelta?: unknown; reason?: string }
      const reason = String(m.reason || 'manual').trim() || 'manual'
      if (!isReversibleManualStockReason(reason)) {
        throw new Error(
          'Només es poden eliminar moviments manuals (entrada/ajust). Els moviments d’entrega es gestionen des d’Entregues.'
        )
      }
      const productId = String(m.productId || '').trim()
      const delta = Number(m.quantityDelta)
      if (!productId || !Number.isFinite(delta) || delta === 0) {
        throw new Error('Moviment invàlid.')
      }

      const pref = db.collection(PROD).doc(productId)
      const psnap = await tx.get(pref)
      if (!psnap.exists) throw new Error('Producte no trobat.')
      const pdata = psnap.data() as { quantityOnHand?: number; quantityReserved?: number }
      const cur = Number(pdata.quantityOnHand ?? 0)
      const reserved = Number(pdata.quantityReserved ?? 0)
      const next = cur - delta
      if (next < 0) throw new Error('No es pot desfer: deixaria estoc físic negatiu.')
      if (next < reserved) {
        throw new Error(
          'No es pot desfer: deixaria estoc físic per sota de la quantitat reservada. Allibereu reserves abans.'
        )
      }

      tx.update(pref, {
        quantityOnHand: next,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.delete(movRef)
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === 'Moviment no trobat.' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
