export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaTabViewAccess } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import {
  notifyRecursosHumansRobaRequestBatchSentToRrhh,
} from '@/lib/roba-personal/robaRequestNotifications'
import { requestReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'

const COL = DOTACIO_COLLECTIONS.requests

type RequestDoc = {
  status?: string
  requestingDepartment?: string
  reference?: string
  requestedByWorkerName?: string
  createdByUserName?: string | null
  lines?: Array<{ productId?: string; quantity?: number }>
}

function normalizeLines(lines: unknown): Array<{ productId: string; quantity: number }> {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      productId: String((line as { productId?: string }).productId || '').trim(),
      quantity: Number((line as { quantity?: number }).quantity),
    }))
    .filter((line) => line.productId && Number.isFinite(line.quantity) && line.quantity > 0)
}

export async function PATCH(req: Request) {
  const auth = await requireRobaTabViewAccess(ROBA_SUBMODULE_PATHS.preparacio)
  if (!auth.ok) return auth.res

  const access = auth.access
  if (access.scope !== 'full' && access.scope !== 'deptLead') {
    return NextResponse.json({ error: 'No autoritzat per enviar remeses a RRHH.' }, { status: 403 })
  }

  const body = (await req.json()) as {
    requestIds?: string[]
    extraEmail?: string
  }

  const requestIds = [...new Set((Array.isArray(body.requestIds) ? body.requestIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (requestIds.length === 0) {
    return NextResponse.json({ error: 'Cal seleccionar almenys una sol·licitud.' }, { status: 400 })
  }
  if (requestIds.length > 50) {
    return NextResponse.json({ error: 'La remesa admet com a màxim 50 sol·licituds.' }, { status: 400 })
  }

  const refs = requestIds.map((id) => db.collection(COL).doc(id))
  const snaps = await db.getAll(...refs)
  const missing = snaps.find((snap) => !snap.exists)
  if (missing) {
    return NextResponse.json({ error: `Sol·licitud no trobada: ${missing.id}` }, { status: 404 })
  }

  const requests = snaps.map((snap) => ({ id: snap.id, ...(snap.data() as RequestDoc) }))
  for (const request of requests) {
    const dept = String(request.requestingDepartment || '').trim()
    if (access.scope === 'deptLead' && !departmentsInSameRobaScope(dept, access.leadDeptNorm)) {
      return NextResponse.json({ error: 'La remesa inclou sol·licituds fora del vostre àmbit.' }, { status: 403 })
    }
    if (String(request.status || 'submitted').trim() !== 'submitted') {
      const reference = String(request.reference || '').trim() || requestReferenceFromDocId(request.id)
      return NextResponse.json(
        { error: `La sol·licitud ${reference} ja no està pendent d'enviar a RRHH.` },
        { status: 400 }
      )
    }
  }

  const now = FieldValue.serverTimestamp()
  const batchReference = `REMESA-RRHH-${Date.now()}`
  const sentToRrhhEmailTo = String(body.extraEmail || '')
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter((value) => value.includes('@'))

  const batch = db.batch()
  for (const ref of refs) {
    batch.update(ref, {
      status: 'sent_to_rrhh',
      sentToRrhhAt: now,
      sentToRrhhByUserId: access.userId,
      sentToRrhhEmailTo,
      sentToRrhhBatchReference: batchReference,
      updatedAt: now,
    })
  }
  await batch.commit()

  try {
    await notifyRecursosHumansRobaRequestBatchSentToRrhh({
      batchReference,
      requestIds,
      requests: requests.map((request) => ({
        reference: String(request.reference || '').trim() || requestReferenceFromDocId(request.id),
        requestingDepartment: String(request.requestingDepartment || '').trim(),
        requestedByWorkerName: String(request.requestedByWorkerName || '').trim() || 'Sense nom',
        createdByUserName: String(request.createdByUserName || '').trim() || null,
        lines: normalizeLines(request.lines),
      })),
      senderUserId: access.userId,
      extraEmail: String(body.extraEmail || '').trim() || null,
    })
  } catch (error) {
    console.error('[roba-personal/requests/send-to-rrhh-batch PATCH] notify RRHH', error)
  }

  return NextResponse.json({
    ok: true,
    batchReference,
    requestIds,
    count: requestIds.length,
  })
}
