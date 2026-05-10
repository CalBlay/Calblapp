import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { deliveryStockMovementReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'
import { linesFromRequestSnapshot, type RobaDotacioLine } from '@/lib/roba-personal/requestLinesFromFirestore'

const DEL = DOTACIO_COLLECTIONS.deliveries
const REQ = DOTACIO_COLLECTIONS.requests
const WORK = DOTACIO_COLLECTIONS.workers
const PROD = DOTACIO_COLLECTIONS.products
const MOV = DOTACIO_COLLECTIONS.stockMovements

function aggregateQuantities(lines: RobaDotacioLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
  }
  return m
}

function linesFromStoredDelivery(cur: Record<string, unknown>): RobaDotacioLine[] {
  return linesFromRequestSnapshot({ lines: cur.lines } as Record<string, unknown>)
}

/**
 * Eliminació d’entrega (només administrador): restaura estoc, opcionalment reserva, moviment d’anul·lació, sol·licitud.
 */
export async function adminDeleteDeliveryTransaction(
  deliveryId: string,
  adminUserId: string
): Promise<void> {
  const dref = db.collection(DEL).doc(deliveryId)
  const now = FieldValue.serverTimestamp()

  await db.runTransaction(async (tx) => {
    const dsnap = await tx.get(dref)
    if (!dsnap.exists) throw new Error('No trobat')

    const cur = dsnap.data() as Record<string, unknown>
    const lines = linesFromStoredDelivery(cur)
    if (lines.length === 0) {
      throw new Error('L entrega no te linies valides.')
    }

    const qtyByProduct = aggregateQuantities(lines)
    const requestId = String(cur.requestId || '').trim()

    let requestData: Record<string, unknown> | null = null
    let reqRef: DocumentReference | null = null
    let restoreReserved = false
    if (requestId) {
      reqRef = db.collection(REQ).doc(requestId)
      const rsnap = await tx.get(reqRef)
      if (!rsnap.exists) throw new Error('Sollicitud vinculada no trobada.')
      requestData = rsnap.data() as Record<string, unknown>
      const fulfillmentDeliveryId = String(requestData.fulfillmentDeliveryId || '').trim()
      if (fulfillmentDeliveryId && fulfillmentDeliveryId !== deliveryId) {
        throw new Error('La sollicitud ja no esta vinculada a aquesta entrega.')
      }
      restoreReserved =
        (requestData as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !== false
    }

    const delReqDept = requestData
      ? String((requestData as { requestingDepartment?: string }).requestingDepartment || '').trim()
      : ''

    let workerDeptDel: string | null = null
    const widDel = String(cur.workerId || '').trim()
    if (widDel) {
      const ws = await tx.get(db.collection(WORK).doc(widDel))
      if (ws.exists) {
        workerDeptDel =
          String((ws.data() as { department?: string }).department || '').trim() || null
      }
    }

    for (const [productId, qty] of qtyByProduct) {
      const pref = db.collection(PROD).doc(productId)
      const psnap = await tx.get(pref)
      if (!psnap.exists) throw new Error(`Producte no trobat: ${productId}`)
      const pdata = psnap.data() as Record<string, unknown>
      const onHand = Number((pdata as { quantityOnHand?: number }).quantityOnHand ?? 0)
      const reserved = Number((pdata as { quantityReserved?: number }).quantityReserved ?? 0)
      const nextRes = requestId && restoreReserved ? reserved + qty : reserved
      tx.update(pref, {
        quantityOnHand: onHand + qty,
        quantityReserved: nextRes,
        updatedAt: now,
      })

      const mref = db.collection(MOV).doc()
      tx.set(mref, {
        productId,
        quantityDelta: qty,
        reason: 'delivery_delete',
        reference: deliveryStockMovementReferenceFromDocId(mref.id),
        notes: `Eliminacio entrega ${String(cur.reference || `E-${deliveryId}`)}`,
        deliveryId,
        createdByUserId: adminUserId,
        createdAt: now,
        quantityReservedDelta: restoreReserved ? qty : 0,
        productReservedAfter: nextRes,
        requestingDepartment: delReqDept || null,
        workerDepartment: workerDeptDel,
      })
    }

    if (reqRef && requestData) {
      tx.update(reqRef, {
        status: 'ready_for_worker_delivery',
        fulfilledAt: null,
        fulfillmentDeliveryId: null,
        receiptConfirmedAt: null,
        updatedAt: now,
      })
    }

    tx.delete(dref)
  })
}
