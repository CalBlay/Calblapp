import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap'])

type ImportRow = {
  code?: unknown
  eventName?: unknown
  serviceName?: unknown
  serviceDate?: unknown
  serviceTime?: unknown
  location?: unknown
  pax?: unknown
  status?: unknown
  Código?: unknown
  Codigo?: unknown
  Evento?: unknown
  Servicio?: unknown
  Fecha?: unknown
  Hora?: unknown
  Ubicación?: unknown
  Ubicacion?: unknown
  Comensales?: unknown
  'Estado Servicio'?: unknown
}

type ParentEvent = {
  id: string
  code: string
  name: string
  date: string
  time: string
  location: string
}

const isIsoDate = (value?: string | null) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())
const isTime = (value?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim())

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const raw = trim(value)
  if (!raw) return ''
  if (isIsoDate(raw)) return raw

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw)
  if (slash) {
    const [, dd, mm, yyyyRaw] = slash
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function normalizeTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.round(value * 24 * 60)
    const hours = Math.floor(minutes / 60) % 24
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const raw = trim(value)
  if (!raw) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (!match) return ''
  return `${match[1]!.padStart(2, '0')}:${match[2]}`
}

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!EDIT_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  const userName = String((token as { name?: string }).name || '').trim()
  return { role, userName }
}

function trim(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePax(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const raw = trim(value)
  if (!raw) return 0
  const normalized = raw.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function buildServiceDocId(code: string, serviceDate: string, serviceTime: string, serviceName: string) {
  const day = serviceDate.replaceAll('-', '')
  const time = (serviceTime || '00:00').replace(':', '')
  const name = slugify(serviceName) || 'servei'
  return `serviceprep_${slugify(code) || 'sense-codi'}_${day}_${time}_${name}`
}

function normalizeRows(body: unknown) {
  if (Array.isArray(body)) return body as ImportRow[]
  if (body && typeof body === 'object' && Array.isArray((body as { rows?: ImportRow[] }).rows)) {
    return (body as { rows: ImportRow[] }).rows
  }
  return []
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function loadParentEventsByCode(codes: string[]) {
  const byCode = new Map<string, ParentEvent>()
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
  for (const codesChunk of chunk(uniqueCodes, 10)) {
    const snap = await db.collection('stage_verd').where('code', 'in', codesChunk).get()
    snap.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const code = trim(data.code)
      if (!code || byCode.has(code)) return
      byCode.set(code, {
        id: doc.id,
        code,
        name: trim(data.NomEvent),
        date: trim(data.DataInici),
        time: trim(data.HoraInici),
        location: trim(data.Ubicacio),
      })
    })
  }
  return byCode
}

async function loadExistingServicesByCode(codes: string[]) {
  const docs = new Map<string, { id: string; code: string }>()
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
  for (const codesChunk of chunk(uniqueCodes, 10)) {
    const snap = await db.collection('logistics_preparation_services').where('code', 'in', codesChunk).get()
    snap.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      docs.set(doc.id, { id: doc.id, code: trim(data.code) })
    })
  }
  return docs
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const body = await req.json().catch(() => null)
    const rows = normalizeRows(body)
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: 'No hi ha files per importar' }, { status: 400 })
    }

    let droppedMissing = 0
    let droppedPrefixed = 0
    let droppedDate = 0
    let droppedTime = 0
    let droppedStatus = 0

    const validRows = rows
      .map((row) => {
        const hasNormalizedShape =
          trim(row.code) !== '' || trim(row.serviceName) !== '' || trim(row.serviceDate) !== ''

        const status = trim(row.status ?? row['Estado Servicio']).toLowerCase()
        if (!hasNormalizedShape && status && status !== 'planned') {
          droppedStatus += 1
          return null
        }

        const code = trim(row.code ?? row.Código ?? row.Codigo)
        const serviceName = trim(row.serviceName ?? row.Servicio)
        const serviceDate = normalizeDate(row.serviceDate ?? row.Fecha)
        const serviceTime = normalizeTime(row.serviceTime ?? row.Hora)
        if (!code || !serviceName || !serviceDate) {
          droppedMissing += 1
          return null
        }
        if (serviceName.startsWith('C ')) {
          droppedPrefixed += 1
          return null
        }
        if (!isIsoDate(serviceDate)) {
          droppedDate += 1
          return null
        }
        if (serviceTime && !isTime(serviceTime)) {
          droppedTime += 1
          return null
        }
        return {
          code,
          eventName: trim(row.eventName ?? row.Evento),
          serviceName,
          serviceDate,
          serviceTime,
          location: trim(row.location ?? row.Ubicación ?? row.Ubicacion),
          pax: normalizePax(row.pax ?? row.Comensales),
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    if (!validRows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No hi ha files valides per importar',
          receivedRows: rows.length,
          debug: {
            droppedMissing,
            droppedPrefixed,
            droppedDate,
            droppedTime,
            droppedStatus,
            sample: rows.slice(0, 3),
          },
        },
        { status: 400 }
      )
    }

    const codes = validRows.map((row) => row.code)
    const [parentEventsByCode, existingDocsById] = await Promise.all([
      loadParentEventsByCode(codes),
      loadExistingServicesByCode(codes),
    ])

    const batch = db.batch()
    const importedIds = new Set<string>()
    const touchedCodes = new Set<string>()
    const nowIso = new Date().toISOString()
    let createdOrUpdated = 0
    let linkedToParent = 0

    for (const row of validRows) {
      const parent = parentEventsByCode.get(row.code)
      const serviceId = buildServiceDocId(row.code, row.serviceDate, row.serviceTime, row.serviceName)
      importedIds.add(serviceId)
      touchedCodes.add(row.code)
      if (parent) linkedToParent += 1

      const payload = {
        code: row.code,
        codeConfirmed: true,
        codeSource: 'service_import',
        planningMode: 'service',
        sourceCollection: 'logistics_preparation_services',
        ParentEventId: parent?.id || '',
        ParentEventCode: row.code,
        ParentEventDate: parent?.date || '',
        ParentEventTime: parent?.time || '',
        ServiceName: row.serviceName,
        ServiceDate: row.serviceDate,
        ServiceTime: row.serviceTime,
        DataInici: row.serviceDate,
        DataFi: row.serviceDate,
        HoraInici: row.serviceTime,
        HoraFi: row.serviceTime,
        Ubicacio: row.location || parent?.location || '',
        NumPax: row.pax,
        importedAt: nowIso,
        importedBy: auth.userName,
        updatedAt: nowIso,
        ...(parent?.name
          ? {
              ParentEventName: parent.name,
              NomEvent: parent.name,
            }
          : {}),
      }

      batch.set(db.collection('logistics_preparation_services').doc(serviceId), payload, { merge: true })
      createdOrUpdated += 1
    }

    existingDocsById.forEach((doc) => {
      if (!touchedCodes.has(doc.code)) return
      if (importedIds.has(doc.id)) return
      batch.delete(db.collection('logistics_preparation_services').doc(doc.id))
    })

    await batch.commit()

    return NextResponse.json({
      ok: true,
      imported: createdOrUpdated,
      linkedToParent,
      touchedCodes: touchedCodes.size,
    })
  } catch (error) {
    console.error('[logistics/import-services] POST error', error)
    return NextResponse.json({ ok: false, error: 'Error important serveis' }, { status: 500 })
  }
}
