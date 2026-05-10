export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin, resolveRobaAccess } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import {
  departmentsInSameRobaScope,
  normDeptLabelsInRobaEquivalenceClass,
} from '@/lib/roba-personal/deptScope'
import { allocateUniqueWorkerCode, workerCodeTaken } from '@/lib/roba-personal/workerCode'
import {
  basePersonnelFieldsFromRoba,
  serializeRobaWorkerRow,
  str,
} from '@/lib/roba-personal/robaWorkerFromPersonnel'
import { isRobaProductDepartmentValue } from '@/data/departments'

const COL = DOTACIO_COLLECTIONS.workers

export async function GET() {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res

  let items: ReturnType<typeof serializeRobaWorkerRow>[]

  if (auth.access.scope === 'workerSelf') {
    const pid = auth.access.linkedPersonnelId
    const snap = await db.collection(COL).doc(pid).get()
    items = snap.exists
      ? [serializeRobaWorkerRow(snap.id, snap.data() as Record<string, unknown>)]
      : []
  } else if (auth.access.scope === 'deptLead') {
    const lead = auth.access.leadDeptNorm
    const labels = normDeptLabelsInRobaEquivalenceClass(lead)
    const snap =
      labels.length > 0 && labels.length <= 10
        ? await db.collection(COL).where('departmentLower', 'in', labels).get()
        : await db.collection(COL).get()
    items = snap.docs
      .map((d) => serializeRobaWorkerRow(d.id, d.data() as Record<string, unknown>))
      .filter((row) => departmentsInSameRobaScope(String(row.department || ''), lead))
  } else {
    const snap = await db.collection(COL).get()
    items = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>
      return serializeRobaWorkerRow(d.id, raw)
    })
  }
  items.sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'ca', { sensitivity: 'base' })
  )
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const name = str(body.name)
    const department = str(body.department)
    if (!name || !department) {
      return NextResponse.json(
        { error: 'Calen name i department.' },
        { status: 400 }
      )
    }
    if (!isRobaProductDepartmentValue(department)) {
      return NextResponse.json(
        { error: 'Departament no permès per a roba personal.' },
        { status: 400 }
      )
    }
    let code = str(body.code)
    if (!code) {
      code = await allocateUniqueWorkerCode(name)
    }
    if (await workerCodeTaken(code)) {
      return NextResponse.json(
        { error: 'Ja existeix un treballador amb aquest codi.' },
        { status: 409 }
      )
    }

    const now = FieldValue.serverTimestamp()
    const createdAtMs = Date.now()
    const ref = db.collection(COL).doc()
    const doc = {
      ...basePersonnelFieldsFromRoba({
        name,
        department,
        email: str(body.email) || null,
        phone: str(body.phone) || null,
        workerCode: code,
        available: body.isActive !== false,
        jobTitle: str(body.jobTitle) || null,
        robaNotes: str(body.notes) || null,
        robaSource: 'manual',
        createdAtMs,
        updatedAt: now,
      }),
      robaHasAppUser: body.hasAppUser === false ? false : true,
    }

    await ref.set(doc)
    const created = await ref.get()
    const row = serializeRobaWorkerRow(
      created.id,
      created.data() as Record<string, unknown>
    )
    return NextResponse.json(serializeFirestoreDoc(created.id, row), { status: 201 })
  } catch (e: unknown) {
    console.error('POST roba-personal workers', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
