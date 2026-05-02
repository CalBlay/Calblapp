export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { resolveRobaAccess } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { requestReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'
import { notifyRecursosHumansNewRobaRequest } from '@/lib/roba-personal/robaRequestNotifications'
import {
  departmentsInSameRobaScope,
  normDeptLabel,
  normDeptLabelsInRobaEquivalenceClass,
  productDepartmentsVisibleToRobaLead,
} from '@/lib/roba-personal/deptScope'

const COL = DOTACIO_COLLECTIONS.requests
const DEL = DOTACIO_COLLECTIONS.deliveries
const PROD = DOTACIO_COLLECTIONS.products
const USERS = 'users'

async function enrichItemsWithCreatorNames(
  items: ReturnType<typeof serializeFirestoreDoc>[]
): Promise<ReturnType<typeof serializeFirestoreDoc>[]> {
  const missing = new Set<string>()
  for (const it of items) {
    const row = it as Record<string, unknown>
    const uid = String(row.createdByUserId || '').trim()
    const name = String(row.createdByUserName || '').trim()
    if (uid && !name) missing.add(uid)
  }
  if (missing.size === 0) return items

  const ids = [...missing]
  const nameById = new Map<string, string>()
  const chunkSize = 10
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const refs = chunk.map((id) => db.collection(USERS).doc(id))
    const snaps = await db.getAll(...refs)
    for (const s of snaps) {
      if (!s.exists) continue
      const n = String((s.data() as { name?: string })?.name || '').trim()
      if (n) nameById.set(s.id, n)
    }
  }

  return items.map((it) => {
    const row = it as Record<string, unknown>
    const uid = String(row.createdByUserId || '').trim()
    const name = String(row.createdByUserName || '').trim()
    if (name || !uid) return it
    const n = nameById.get(uid)
    if (!n) return it
    return { ...row, createdByUserName: n } as typeof it
  })
}

/** Sol·licituds ja «lliurades» però sense pas de confirmació a l’app es mostren com a confirmades. */
async function enrichFulfilledStatusWithDeliveryAck(
  items: ReturnType<typeof serializeFirestoreDoc>[]
): Promise<ReturnType<typeof serializeFirestoreDoc>[]> {
  const ids = new Set<string>()
  for (const it of items) {
    const row = it as Record<string, unknown>
    if (String(row.status || '').trim() !== 'fulfilled') continue
    const fid = String(row.fulfillmentDeliveryId || '').trim()
    if (fid) ids.add(fid)
  }
  if (ids.size === 0) return items

  const idList = [...ids]
  const byId = new Map<string, Record<string, unknown>>()
  const chunkSize = 10
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize)
    const refs = chunk.map((id) => db.collection(DEL).doc(id))
    const snaps = await db.getAll(...refs)
    for (const s of snaps) {
      if (s.exists) byId.set(s.id, s.data() as Record<string, unknown>)
    }
  }

  return items.map((it) => {
    const row = it as Record<string, unknown>
    if (String(row.status || '').trim() !== 'fulfilled') return it
    const fid = String(row.fulfillmentDeliveryId || '').trim()
    if (!fid) return it
    const del = byId.get(fid)
    if (!del) return it
    const ackExpected = del.workerReceiptAckExpected === true
    const ackDone = del.workerReceiptAckAt != null
    if (!ackExpected || ackDone) {
      return { ...row, status: 'receipt_confirmed' } as typeof it
    }
    return it
  })
}

export async function GET() {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res

  let items: ReturnType<typeof serializeFirestoreDoc>[]

  if (auth.access.scope === 'full') {
    const snap = await db.collection(COL).orderBy('createdAt', 'desc').limit(300).get()
    items = snap.docs.map((d) =>
      serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
    )
  } else if (auth.access.scope === 'deptLead') {
    const lead = auth.access.leadDeptNorm
    const labels = normDeptLabelsInRobaEquivalenceClass(lead)

    const primaryFetches =
      labels.length > 0 && labels.length <= 10
        ? db
            .collection(COL)
            .where('requestingDepartmentNorm', 'in', labels)
            .orderBy('createdAt', 'desc')
            .limit(280)
            .get()
        : Promise.resolve(null)

    const [primarySnap, recentSnap] = await Promise.all([
      primaryFetches,
      db.collection(COL).orderBy('createdAt', 'desc').limit(150).get(),
    ])

    const seen = new Set<string>()
    items = []
    if (primarySnap) {
      for (const d of primarySnap.docs) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        items.push(serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
      }
    }
    for (const d of recentSnap.docs) {
      if (seen.has(d.id)) continue
      const data = d.data() as Record<string, unknown>
      if (
        departmentsInSameRobaScope(String(data.requestingDepartment || ''), lead)
      ) {
        seen.add(d.id)
        items.push(serializeFirestoreDoc(d.id, data))
      }
    }
    items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    items = items.slice(0, 300)
  } else {
    const pid = auth.access.linkedPersonnelId
    const uid = auth.access.userId
    const [byWorker, byCreator] = await Promise.all([
      db
        .collection(COL)
        .where('requestedByWorkerId', '==', pid)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get(),
      db
        .collection(COL)
        .where('createdByUserId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get(),
    ])
    const merged = new Map<string, (typeof byWorker.docs)[number]>()
    for (const d of byWorker.docs) merged.set(d.id, d)
    for (const d of byCreator.docs) merged.set(d.id, d)
    items = [...merged.values()]
      .map((d) => serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 300)
  }

  items = await enrichItemsWithCreatorNames(items)
  items = await enrichFulfilledStatusWithDeliveryAck(items)

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    requestingDepartment?: string
    lines?: Array<{ productId?: string; quantity?: number; notes?: string }>
    status?: string
    requestedByWorkerId?: string
    notes?: string
  }
  const requestingDepartment = String(body.requestingDepartment || '').trim()
  if (!requestingDepartment) {
    return NextResponse.json({ error: 'Cal requestingDepartment.' }, { status: 400 })
  }

  if (auth.access.scope === 'deptLead') {
    if (!departmentsInSameRobaScope(requestingDepartment, auth.access.leadDeptNorm)) {
      return NextResponse.json(
        { error: 'No podeu crear sol·licituds per a un altre departament.' },
        { status: 403 }
      )
    }
  }

  let requestedByWorkerId = String(body.requestedByWorkerId || '').trim()
  if (auth.access.scope === 'workerSelf') {
    requestedByWorkerId = auth.access.linkedPersonnelId
    if (!departmentsInSameRobaScope(requestingDepartment, auth.access.workerDeptNorm)) {
      return NextResponse.json(
        { error: 'El departament sol·licitant ha de coincidir amb el vostre.' },
        { status: 403 }
      )
    }
  }
  if (!requestedByWorkerId) {
    return NextResponse.json({ error: 'Cal triar el treballador.' }, { status: 400 })
  }
  if (auth.access.scope === 'workerSelf' && requestedByWorkerId !== auth.access.linkedPersonnelId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const workerSnap = await db.collection(DOTACIO_COLLECTIONS.workers).doc(requestedByWorkerId).get()
  if (!workerSnap.exists) {
    return NextResponse.json({ error: 'Treballador no trobat.' }, { status: 400 })
  }
  const wdata = workerSnap.data() as { name?: string; department?: string }
  const requestedByWorkerName = String(wdata?.name || '').trim()
  const workerDept = String(wdata?.department || '').trim()
  if (auth.access.scope === 'deptLead') {
    if (!departmentsInSameRobaScope(workerDept, auth.access.leadDeptNorm)) {
      return NextResponse.json(
        { error: 'El treballador no pertany al vostre departament.' },
        { status: 403 }
      )
    }
    if (!departmentsInSameRobaScope(workerDept, requestingDepartment)) {
      return NextResponse.json(
        { error: 'El treballador i el departament sol·licitant no coincideixen.' },
        { status: 400 }
      )
    }
  }
  const linesIn = Array.isArray(body.lines) ? body.lines : []
  const lines = linesIn
    .map((l) => {
      const productId = String(l.productId || '').trim()
      const quantity = Number(l.quantity)
      const notesTrim = String(l.notes || '').trim()
      const entry: { productId: string; quantity: number; notes?: string } = {
        productId,
        quantity,
      }
      if (notesTrim) entry.notes = notesTrim
      return entry
    })
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cal almenys una línia vàlida.' }, { status: 400 })
  }

  if (auth.access.scope === 'deptLead') {
    const lead = auth.access.leadDeptNorm
    for (const line of lines) {
      const psnap = await db.collection(PROD).doc(line.productId).get()
      if (!psnap.exists) {
        return NextResponse.json({ error: `Producte no trobat: ${line.productId}` }, { status: 400 })
      }
      const pdata = psnap.data() as { departments?: string[] }
      if (!productDepartmentsVisibleToRobaLead(pdata.departments, lead)) {
        return NextResponse.json(
          { error: `Producte no permès per al vostre departament: ${line.productId}` },
          { status: 403 }
        )
      }
    }
  } else if (auth.access.scope === 'workerSelf') {
    if (!departmentsInSameRobaScope(workerDept, requestingDepartment)) {
      return NextResponse.json(
        { error: 'El treballador i el departament sol·licitant no coincideixen.' },
        { status: 400 }
      )
    }
    const lead = auth.access.workerDeptNorm
    for (const line of lines) {
      const psnap = await db.collection(PROD).doc(line.productId).get()
      if (!psnap.exists) {
        return NextResponse.json({ error: `Producte no trobat: ${line.productId}` }, { status: 400 })
      }
      const pdata = psnap.data() as { departments?: string[] }
      if (!productDepartmentsVisibleToRobaLead(pdata.departments, lead)) {
        return NextResponse.json(
          { error: `Producte no permès per al vostre departament: ${line.productId}` },
          { status: 403 }
        )
      }
    }
  }

  const creatorSnap = await db.collection('users').doc(auth.access.userId).get()
  const createdByUserName = creatorSnap.exists
    ? String((creatorSnap.data() as { name?: string })?.name || '').trim()
    : ''

  const now = FieldValue.serverTimestamp()
  const reqRef = db.collection(COL).doc()
  const doc: Record<string, unknown> = {
    requestingDepartment,
    requestingDepartmentNorm: normDeptLabel(requestingDepartment),
    lines,
    status: String(body.status || 'submitted').trim() || 'submitted',
    requestedByWorkerId,
    requestedByWorkerName: requestedByWorkerName || null,
    createdByUserId: auth.access.userId,
    createdByUserName: createdByUserName || null,
    notes: String(body.notes || '').trim() || null,
    reference: requestReferenceFromDocId(reqRef.id),
    createdAt: now,
    updatedAt: now,
  }

  await reqRef.set(doc)

  try {
    await notifyRecursosHumansNewRobaRequest({
      requestId: reqRef.id,
      reference: requestReferenceFromDocId(reqRef.id),
      requestingDepartment,
      requestedByWorkerName: requestedByWorkerName || 'Sense nom',
      lineCount: lines.length,
    })
  } catch (e) {
    console.error('[roba-personal/requests POST] notify RRHH', e)
  }

  const created = await reqRef.get()
  return NextResponse.json(
    serializeFirestoreDoc(created.id, created.data() as Record<string, unknown>),
    { status: 201 }
  )
}
