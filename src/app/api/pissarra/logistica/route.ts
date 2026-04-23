import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador', 'comercial', 'observer', 'usuari'])

type QuadrantDoc = {
  eventId?: string
  code?: string
  eventName?: string
  phaseLabel?: string
  phaseType?: string
  phaseKey?: string
  phase?: string
  fase?: string
  phaseName?: string
  label?: string
  startDate?: string
  startTime?: string
  arrivalTime?: string
  location?: string
  status?: string
  conductors?: Array<{ plate?: string; vehicleType?: string; name?: string }>
  treballadors?: Array<{ name?: string }>
}

type VehicleRow = {
  plate: string
  type: string
  conductor: string
  source: string
}

type LogisticaAggregateRow = {
  id: string
  code: string
  LN: string
  eventName: string
  phaseLabel: string
  startDate: string
  startTime: string
  arrivalTime: string
  location: string
  status: string
  vehicles: VehicleRow[]
  workers: string[]
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
  const roleRaw =
    typeof token === 'object' && token !== null && 'role' in token
      ? (token as Record<string, unknown>)['role']
      : undefined
  const role = normalizeRole(typeof roleRaw === 'string' ? roleRaw : 'treballador')
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return { token, role }
}

async function loadRange(colName: string, start: string, end: string) {
  const col = db.collection(colName)
  try {
    return await col.where('startDate', '>=', start).where('startDate', '<=', end).get()
  } catch (e) {
    console.warn(`[pissarra/logistica] fallback full scan ${colName}`, e)
    return await col.get()
  }
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

    const collections = ['quadrantsLogistica', 'quadrantsCuina']
    const map = new Map<string, LogisticaAggregateRow>()

    const snaps = await Promise.all(collections.map((name) => loadRange(name, start, end)))

    for (let idx = 0; idx < collections.length; idx += 1) {
      const colName = collections[idx]
      const snap = snaps[idx]

      snap.forEach((doc: QueryDocumentSnapshot) => {
        const d = doc.data() as QuadrantDoc
        const st = norm(d.status)
        if (st && st !== 'confirmed' && st !== 'draft') return

        const startDate = d.startDate || ''
        if (!startDate || startDate < start || startDate > end) return

        const vehicles = Array.isArray(d.conductors)
          ? d.conductors.map((c) => ({
              plate: c?.plate || '',
              type: c?.vehicleType || '',
              conductor: c?.name || '',
              source: colName,
            }))
          : []

        // A la pissarra de logística només mostrem personal de logística.
        // De cuina només volem els conductors (ja entren a "vehicles").
        const isLogisticaSource = norm(colName) === 'quadrantslogistica'
        const hasVehicleRequest = vehicles.some(
          (vehicle) =>
            Boolean(String(vehicle.plate || '').trim()) ||
            Boolean(String(vehicle.type || '').trim()) ||
            Boolean(String(vehicle.conductor || '').trim())
        )
        if (!isLogisticaSource && !hasVehicleRequest) return
        const workers =
          isLogisticaSource && Array.isArray(d.treballadors)
            ? d.treballadors.map((t) => t?.name || '').filter(Boolean)
            : []

        const phaseLabelRaw =
          d.phaseLabel || d.phaseType || d.phaseKey || d.phase || d.fase || d.phaseName || d.label || ''
        const phaseLabel = phaseLabelRaw ? String(phaseLabelRaw).trim() : ''
        const logicalKey = [
          String(d.eventId || d.code || d.eventName || doc.id).trim(),
          startDate,
          phaseLabel || 'event',
        ].join('__')

        const existing = map.get(logicalKey) || {
          id: logicalKey,
          code: d.code || '',
          LN: 'logistica',
          eventName: d.eventName || '',
          phaseLabel,
          startDate,
          startTime: d.startTime || '',
          arrivalTime: d.arrivalTime || '',
          location: d.location || '',
          status: d.status || '',
          vehicles: [] as VehicleRow[],
          workers: [] as string[],
        }

        existing.vehicles = [...(existing.vehicles || []), ...vehicles]
        existing.workers = [...(existing.workers || []), ...workers]
        if (!existing.phaseLabel && phaseLabel) existing.phaseLabel = phaseLabel
        if (norm(existing.status) !== 'confirmed' && norm(d.status) === 'confirmed') {
          existing.status = d.status || ''
        }
        if (!existing.arrivalTime && d.arrivalTime) existing.arrivalTime = d.arrivalTime

        map.set(logicalKey, existing)
      })
    }

    return NextResponse.json({ items: Array.from(map.values()) }, { status: 200 })
  } catch (err) {
    console.error('[api/pissarra/logistica] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
