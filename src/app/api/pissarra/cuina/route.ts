import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador', 'comercial', 'observer', 'usuari'])

type QuadrantDoc = {
  code?: string
  eventName?: string
  startDate?: string
  startTime?: string
  location?: string
  service?: string
  numPax?: number
  pax?: number
  status?: string
  conductors?: Array<{ name?: string }>
  treballadors?: Array<{ name?: string }>
  groups?: Array<{
    meetingPoint?: string
    startTime?: string
    workers?: number
    drivers?: number
    responsibleName?: string | null
  }>
}

const norm = (v?: string | null) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }
  const role = normalizeRole(String((token as any)?.role || 'treballador'))
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return { token, role }
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function loadPaxByCodes(codes: string[]) {
  const map = new Map<string, number>()
  const clean = Array.from(new Set(codes.map((c) => String(c || '').trim()).filter(Boolean)))
  if (clean.length === 0) return map

  // Firestore IN supports up to 10 values per query
  for (const part of chunk(clean, 10)) {
    try {
      const snap = await db.collection('stage_verd').where('code', 'in', part).get()
      snap.forEach((doc: any) => {
        const ev = doc.data() as any
        const code = String(ev?.code || '').trim()
        if (!code) return
        const pax = Number(ev?.NumPax || ev?.numPax || ev?.pax || 0)
        map.set(code, pax)
      })
    } catch {
      // fallback single lookups if IN fails due index constraints
      await Promise.all(
        part.map(async (code) => {
          try {
            const snap = await db.collection('stage_verd').where('code', '==', code).limit(1).get()
            if (!snap.empty) {
              const ev = snap.docs[0].data() as any
              map.set(code, Number(ev?.NumPax || ev?.numPax || ev?.pax || 0))
            }
          } catch {
            // ignore individual failures
          }
        })
      )
    }
  }

  return map
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start or end' }, { status: 400 })
    }

    const col = db.collection('quadrantsCuina')
    let snap
    try {
      snap = await col.where('startDate', '>=', start).where('startDate', '<=', end).get()
    } catch (e) {
      console.warn('[pissarra/cuina] fallback full scan', e)
      snap = await col.get()
    }

    const sourceDocs: Array<{ id: string; d: QuadrantDoc }> = []
    const missingPaxCodes: string[] = []

    snap.docs.forEach((doc: any) => {
      const d = doc.data() as QuadrantDoc
      const st = norm(d.status)
      if (st && st !== 'confirmed' && st !== 'draft') return

      const startDate = d.startDate || ''
      if (!startDate || startDate < start || startDate > end) return

      sourceDocs.push({ id: doc.id, d })
      const pax = Number(d.numPax || (d as any).NumPax || d.pax || 0)
      const code = String(d.code || '').trim()
      if (!pax && code) missingPaxCodes.push(code)
    })

    const paxByCode = await loadPaxByCodes(missingPaxCodes)

    const items = sourceDocs.map(({ id, d }) => {
      const groups = Array.isArray(d.groups) ? d.groups : []
      const group1 = groups[0]
      const group2 = groups[1]

      const conductors = Array.isArray(d.conductors)
        ? d.conductors.map((c) => c?.name || '').filter(Boolean)
        : []
      const treballadors = Array.isArray(d.treballadors)
        ? d.treballadors.map((t) => t?.name || '').filter(Boolean)
        : []

      let driverIdx = 0
      let workerIdx = 0

      const buildGroup = (group?: NonNullable<QuadrantDoc['groups']>[number]) => {
        if (!group) return null
        const driversTotal = Number(group.drivers || 0)
        const workersTotal = Number(group.workers || 0)
        const responsibleName = group.responsibleName || null

        const driverNames = conductors.slice(driverIdx, driverIdx + driversTotal)
        driverIdx += driversTotal

        const responsibleIsDriver = !!responsibleName && driverNames.some((n) => norm(n) === norm(responsibleName))
        const workersNeeded = Math.max(workersTotal - driversTotal - (responsibleIsDriver ? 0 : 1), 0)
        const workerNames = treballadors.slice(workerIdx, workerIdx + workersNeeded)
        workerIdx += workersNeeded

        return {
          responsibleName,
          drivers: driverNames.length ? driverNames : driversTotal ? ['Extra'] : [],
          workers: workerNames.length ? workerNames : workersNeeded ? ['Extra'] : [],
          meetingPoint: group.meetingPoint || '',
          startTime: group.startTime || '',
        }
      }

      const g1 = buildGroup(group1)
      const g2 = buildGroup(group2)

      const code = String(d.code || '').trim()
      const rawPax = Number(d.numPax || (d as any).NumPax || d.pax || 0)
      const pax = rawPax || Number(paxByCode.get(code) || 0)

      return {
        id,
        code,
        LN: 'cuina',
        eventName: d.eventName || '',
        startDate: d.startDate || '',
        startTime: d.startTime || '',
        status: d.status || '',
        location: d.location || '',
        pax,
        servei: d.service || '',
        group1Responsible: g1?.responsibleName || null,
        group1Drivers: g1?.drivers || [],
        group1Workers: g1?.workers || [],
        group1MeetingPoint: g1?.meetingPoint || '',
        group1StartTime: g1?.startTime || '',
        group2Responsible: g2?.responsibleName || null,
        group2Drivers: g2?.drivers || [],
        group2Workers: g2?.workers || [],
        group2MeetingPoint: g2?.meetingPoint || '',
        group2StartTime: g2?.startTime || '',
      }
    })

    return NextResponse.json({ items }, { status: 200 })
  } catch (err) {
    console.error('[api/pissarra/cuina] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
