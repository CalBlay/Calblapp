import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import admin from 'firebase-admin'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type CompletedPayload = {
  id?: string
  plannedId?: string | null
  templateId?: string | null
  title: string
  worker?: string | null
  startTime?: string
  endTime?: string
  status?: string
  notes?: string
  completedAt?: string | number
  nextDue?: string | null
  checklist?: Record<string, boolean>
}

type CompletedRecord = {
  status?: string
  templateId?: string | null
  plannedId?: string | null
  createdAt?: number
}

type MaintenanceStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat'

const normalizeCompletedStatus = (value?: string) => {
  const status = String(value || 'pendent').trim().toLowerCase()
  if (status === 'nou') return 'nou'
  if (status === 'assignat' || status === 'pendent') return 'assignat'
  if (status === 'espera') return 'espera'
  if (status === 'resolut' || status === 'validat') return 'validat'
  if (status === 'en curs') return 'en_curs'
  if (status === 'fet') return 'fet'
  if (status === 'no_fet' || status === 'no fet') return 'no_fet'
  if (status === 'en_curs') return 'en_curs'
  return 'assignat'
}

const isCompletionOnlyStatus = (status: MaintenanceStatus) =>
  status === 'fet' || status === 'no_fet' || status === 'validat'

const computeProgress = (checklist?: Record<string, boolean>) => {
  if (!checklist || typeof checklist !== 'object') return 0
  const values = Object.values(checklist)
  if (values.length === 0) return 0
  const done = values.filter(Boolean).length
  return Math.round((done / values.length) * 100)
}

const toIsoDate = (value: string | number | undefined) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10)
  }
  return null
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap' && role !== 'treballador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const templateId = (searchParams.get('templateId') || '').trim()
  const plannedId = (searchParams.get('plannedId') || '').trim()

  try {
    let query: FirebaseFirestore.Query = db.collection('maintenancePreventiusCompleted')
    if (templateId) query = query.where('templateId', '==', templateId)
    if (plannedId) query = query.where('plannedId', '==', plannedId)

    const snap = await query.get()
    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          ...data,
          status: normalizeCompletedStatus(data.status),
        }
      })
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const da =
          typeof a.completedAt === 'number' ? a.completedAt : Date.parse(String(a.completedAt || '')) || 0
        const dbTime =
          typeof b.completedAt === 'number' ? b.completedAt : Date.parse(String(b.completedAt || '')) || 0
        return dbTime - da
      })
    return NextResponse.json({ records: items })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = (user.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap' && role !== 'treballador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as CompletedPayload
    const now = Date.now()
    const requestedId = (body.id || '').trim()
    const currentSnap = requestedId
      ? await db.collection('maintenancePreventiusCompleted').doc(requestedId).get()
      : null
    const currentRecord = currentSnap?.exists ? (currentSnap.data() as CompletedRecord) : null
    const currentStatus = normalizeCompletedStatus(currentRecord?.status)
    const completedAt =
      typeof body.completedAt === 'string' || typeof body.completedAt === 'number'
        ? body.completedAt
        : now

    const normalizedStatus = normalizeCompletedStatus(body.status) as MaintenanceStatus
    const canValidate =
      role === 'admin' ||
      role === 'direccio' ||
      (role === 'cap' && isMaintenanceCapDepartment(dept))
    if (normalizedStatus === 'validat') {
      if (!canValidate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (currentStatus !== 'fet') {
        return NextResponse.json({ error: 'Nomes es pot validar des de Fet' }, { status: 400 })
      }
    }

    if (currentStatus === 'validat') {
      const canReopen =
        role === 'admin' ||
        role === 'direccio' ||
        (role === 'cap' && isMaintenanceCapDepartment(dept))
      const onlyReopen =
        normalizedStatus === 'fet' &&
        body.title === undefined &&
        body.worker === undefined &&
        body.startTime === undefined &&
        body.endTime === undefined &&
        body.notes === undefined &&
        body.completedAt === undefined &&
        body.nextDue === undefined &&
        body.checklist === undefined

      if (!onlyReopen) {
        return NextResponse.json(
          { error: 'Cal reobrir el preventiu abans de modificar-lo' },
          { status: 400 }
        )
      }

      if (!canReopen) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const trimId = (v: unknown) => String(v ?? '').trim()
    let resolvedTemplateId = trimId(body.templateId)
    if (!resolvedTemplateId && currentRecord) {
      resolvedTemplateId = trimId(currentRecord.templateId)
    }
    const plannedLookupId = trimId(body.plannedId) || trimId(currentRecord?.plannedId)
    if (!resolvedTemplateId && plannedLookupId) {
      const planSnap = await db.collection('maintenancePreventiusPlanned').doc(plannedLookupId).get()
      if (planSnap.exists) {
        resolvedTemplateId = trimId((planSnap.data() as { templateId?: string })?.templateId)
      }
    }

    const resolvedPlannedId = trimId(body.plannedId) || trimId(currentRecord?.plannedId) || null

    const payload = {
      plannedId: resolvedPlannedId,
      templateId: resolvedTemplateId || null,
      title: body.title || '',
      worker: body.worker || null,
      startTime: body.startTime || '',
      endTime: body.endTime || '',
      status: normalizedStatus,
      notes: body.notes || '',
      completedAt,
      nextDue: body.nextDue || null,
      checklist: body.checklist || {},
      createdById: user.id,
      createdByName: user.name || '',
      createdAt: currentRecord?.createdAt || now,
      updatedAt: now,
      updatedById: user.id,
      updatedByName: user.name || '',
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status: normalizedStatus,
        at: now,
        byId: user.id,
        byName: user.name || '',
        startTime: isCompletionOnlyStatus(normalizedStatus) ? null : body.startTime || null,
        endTime: isCompletionOnlyStatus(normalizedStatus) ? body.endTime || null : null,
        note: body.notes || '',
      }),
    }

    let docId = ''

    if (requestedId) {
      await db.collection('maintenancePreventiusCompleted').doc(requestedId).set(payload, { merge: true })
      docId = requestedId
    } else {
      const doc = await db.collection('maintenancePreventiusCompleted').add(payload)
      docId = doc.id
    }

    if (resolvedPlannedId) {
      const progress = computeProgress(body.checklist)
      await db.collection('maintenancePreventiusPlanned').doc(resolvedPlannedId).set(
        {
          lastRecordId: docId,
          lastStatus: normalizedStatus,
          lastProgress: progress,
          lastCompletedAt: completedAt,
          lastUpdatedAt: now,
        },
        { merge: true }
      )
    }

    if (resolvedTemplateId && normalizedStatus === 'validat') {
      const resolvedOn = toIsoDate(completedAt) || toIsoDate(Date.now())
      if (resolvedOn) {
        await db.collection('maintenancePreventiusTemplates').doc(resolvedTemplateId).set(
          {
            lastDone: resolvedOn,
            updatedAt: now,
            updatedById: user.id,
            updatedByName: user.name || '',
          },
          { merge: true }
        )
      }
    }

    return NextResponse.json({ id: docId }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
