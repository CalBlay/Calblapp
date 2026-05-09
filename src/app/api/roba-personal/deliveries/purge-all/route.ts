export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { resolveRobaAccess } from '@/lib/roba-personal/guard'
import { adminDeleteDeliveryTransaction } from '@/lib/roba-personal/adminDeleteDelivery'
import { DELIVERIES_PURGE_CONFIRM_PHRASE } from '@/lib/roba-personal/deliveriesPurgeConstants'

const DEL = DOTACIO_COLLECTIONS.deliveries

const PAGE = 200

/**
 * POST { "confirm": "ESBORRAR_TOTES_LES_ENTREGUES" }
 * Elimina totes les entregues una per una (mateixa lògica que DELETE /deliveries/[id]): restaura estoc, sol·licituds, etc.
 * Només rol administrador (mateix criteri que DELETE d’una entrega).
 */
export async function POST(req: Request) {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res
  if (auth.access.scope !== 'full' || auth.access.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { confirm?: string } = {}
  try {
    body = (await req.json()) as { confirm?: string }
  } catch {
    body = {}
  }
  if (String(body.confirm || '').trim() !== DELIVERIES_PURGE_CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: 'Cal enviar el text de confirmació exacte al camp "confirm".' },
      { status: 400 }
    )
  }

  const userId = auth.access.userId
  let deleted = 0
  const failures: Array<{ id: string; error: string }> = []

  try {
    const ids: string[] = []
    let last: QueryDocumentSnapshot | undefined
    for (;;) {
      let q = db.collection(DEL).orderBy(FieldPath.documentId()).limit(PAGE)
      if (last) q = q.startAfter(last)
      const snap = await q.get()
      if (snap.empty) break
      for (const d of snap.docs) ids.push(d.id)
      last = snap.docs[snap.docs.length - 1]
      if (snap.size < PAGE) break
    }

    for (const id of ids) {
      try {
        await adminDeleteDeliveryTransaction(id, userId)
        deleted++
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        failures.push({ id, error: message })
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message, deletedSoFar: deleted, failures }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    deletedCount: deleted,
    failureCount: failures.length,
    failures,
  })
}
