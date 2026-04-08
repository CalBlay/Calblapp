// filename: src/app/api/torns/getTorns/route.ts

import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { fetchAllTorns, type Torn } from '@/services/tornsService'
import type { NormalizedWorker } from '@/utils/normalizeTornWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const norm = (s?: string | null): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

function isISO(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function clampISO(s: string): string {
  if (!isISO(s)) return ''
  const y = Number(s.slice(0, 4))
  return y >= 2000 && y <= 2100 ? s : ''
}

function ensureOrdered(a: string, b: string): [string, string] {
  if (!a || !b) return ['', '']
  return a <= b ? [a, b] : [b, a]
}

const TORNS_CAP_DEPARTMENTS = new Set(['logistica', 'cuina', 'serveis'])

type TokenLike = {
  role?: string
  department?: string
  name?: string
  user?: {
    role?: string
    department?: string
    name?: string
  }
}

type ApiTorn = {
  id: string
  code?: string
  eventId: string
  eventName: string
  date: string
  dayNote?: string
  phaseLabel?: string
  time?: string
  arrivalTime?: string
  location?: string
  meetingPoint?: string
  department: string
  workerId?: string
  workerName?: string
  workerRole?: 'responsable' | 'conductor' | 'treballador' | null
  workerPlate?: string
  startTime?: string
  endTime?: string
  vestimentModel?: string
  __rawWorkers?: NormalizedWorker[]
}

type WorkerExpanded = Torn & {
  workerId?: string
  workerName?: string
  workerRole?: string | null
  workerPlate?: string
  startTime?: string
  endTime?: string
}

/**
 * GET /api/torns/getTorns
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const token = (await getToken({ req })) as TokenLike | null

    // ─────────────────────────────────────────────
    // 1. Rol i departament de sessió
    // ─────────────────────────────────────────────
    const roleRaw = norm(token?.role || token?.user?.role || '')
    const role:
      | 'Admin'
      | 'Direcció'
      | 'Cap Departament'
      | 'Treballador'
      | 'Other' =
      roleRaw.startsWith('admin')
        ? 'Admin'
        : roleRaw.includes('dire')
        ? 'Direcció'
        : roleRaw.includes('cap')
        ? 'Cap Departament'
        : roleRaw.includes('treballador') ||
          roleRaw.includes('trabajador') ||
          roleRaw.includes('worker') ||
          roleRaw.includes('empleat')
        ? 'Treballador'
        : 'Other'

    const rawDept = token?.department || token?.user?.department || ''
    const sessionDept =
      role === 'Admin' || role === 'Direcció'
        ? '' // Admin / Direcció veuen tots els departaments
        : norm(rawDept)
    if (role === 'Other') {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 403 })
    }

    if (role === 'Cap Departament' && !TORNS_CAP_DEPARTMENTS.has(sessionDept)) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 403 })
    }

    const userName = String(token?.name || token?.user?.name || '')

    // ─────────────────────────────────────────────
    // 2. Rangs de dates
    // ─────────────────────────────────────────────
    const rawStart = clampISO(searchParams.get('start') || '')
    const rawEnd = clampISO(searchParams.get('end') || '')
    const [start, end] = ensureOrdered(rawStart, rawEnd)

    if (!start || !end) {
      return Response.json(
        { ok: false, error: 'Missing or invalid start/end' },
        { status: 400 }
      )
    }

    // ─────────────────────────────────────────────
    // 3. Paràmetres de filtre
    // ─────────────────────────────────────────────
    const departmentIn = searchParams.get('department') || ''
    const department = norm(departmentIn)

    const roleTypeParam =
      (searchParams.get('roleType') as
        | 'treballador'
        | 'conductor'
        | 'responsable'
        | 'all'
        | null) || null

    const workerIdParam = searchParams.get('workerId') || ''
    const workerNameParam = searchParams.get('workerName') || ''

    // ─────────────────────────────────────────────
    // 4. Obtenim els torns des del servei
    // ─────────────────────────────────────────────
    const torns = await fetchAllTorns(
      start,
      end,
      role,
      role === 'Admin' || role === 'Direcció'
        ? (department || undefined)
        : sessionDept || undefined,
      role === 'Treballador' ? userName : undefined
    )

    // ─────────────────────────────────────────────
    // 5. Construïm META (departaments + treballadors)
    // ─────────────────────────────────────────────
    const depSet = new Set<string>()
    const workerMap = new Map<string, { id?: string; name: string; role?: string }>()

    for (const t of torns) {
      if (t.department) depSet.add(t.department)

      const arr = t.__rawWorkers
      if (Array.isArray(arr)) {
        for (const w of arr) {
          const id = w.id ? String(w.id) : undefined
          const name = w.name ? String(w.name) : ''
          const roleW = w.role ? String(w.role) : undefined
          const key = id ? `id:${id}` : `name:${norm(name)}`
          if (!workerMap.has(key)) workerMap.set(key, { id, name, role: roleW })
        }
      }
    }

    const meta = {
      departments: Array.from(depSet).sort((a, b) => a.localeCompare(b, 'ca')),
      workers: Array.from(workerMap.values()).filter((w) => w.name),
    }

    // ─────────────────────────────────────────────
    // 6. Expandim per treballador (per rols no Treballador)
    // ─────────────────────────────────────────────
    let data: WorkerExpanded[] = torns

    if (role !== 'Treballador') {
      data = torns.flatMap((t: Torn) => {
        if (!Array.isArray(t.__rawWorkers) || !t.__rawWorkers.length) {
          return [
            {
              ...t,
              workerId: undefined,
              workerName: undefined,
              workerRole: null,
            } as WorkerExpanded,
          ]
        }

        return t.__rawWorkers.map((w) => {
          const obj: WorkerExpanded = {
            ...t,
            id: `${t.id}:${w.key}`,
            workerId: w.id || w.key,
            workerName: w.name,
            workerRole: w.role,
            workerPlate: w.plate,
            startTime: w.startTime,
            endTime: w.endTime,
            meetingPoint: w.meetingPoint || t.meetingPoint,
            department: w.department || t.department,
          }
          return obj
        })
      })
    }

    // ─────────────────────────────────────────────
    // 7. Filtre per tipus de rol (treballador/conductor/responsable)
    // ─────────────────────────────────────────────
    if (roleTypeParam && roleTypeParam !== 'all') {
      const rt = norm(roleTypeParam)
      data = data.filter((t) => norm(t.workerRole || '') === rt)
    }

    // ─────────────────────────────────────────────
    // 8. Filtre per treballador (simple i robust)
    // ─────────────────────────────────────────────
    const workerSearchRaw = workerNameParam || workerIdParam
    const workerSearch = norm(workerSearchRaw || '')

    if (workerSearch) {
      data = data.filter((t) => {
        const combined = norm(
          `${(t as any).workerName || ''} ${(t as any).workerId || ''}`
        )
        return combined.includes(workerSearch)
      })
    }

    // ─────────────────────────────────────────────
    // 9. Mapegem a DTO per al front
    // ─────────────────────────────────────────────
    const toTimeRange = (t: WorkerExpanded): string | undefined => {
      const s = (t as any).startTime as string | undefined
      const e = (t as any).endTime as string | undefined
      if (s && e) return `${s} - ${e}`
      if (s) return s
      if (e) return e
      return undefined
    }

    const dto: ApiTorn[] = data.map((t) => ({
      id: String(t.id), // id de torn ja únic (event + workerKey si cal)
      code: t.code,
      eventId: t.eventId,
      eventName: t.eventName,
      date: t.date,
      dayNote: (t as any).dayNote,
      phaseLabel: (t as any).phaseLabel,
      time: toTimeRange(t),
      arrivalTime: (t as any).arrivalTime,
      location: t.location,
      meetingPoint: t.meetingPoint,
      department: t.department,
      workerId: (t as any).workerId,
      workerName: (t as any).workerName,
      workerRole: (t as any).workerRole as any,
      workerPlate: (t as any).workerPlate,
      startTime: (t as any).startTime,
      endTime: (t as any).endTime,
      vestimentModel: (t as any).vestimentModel,
      __rawWorkers: t.__rawWorkers as NormalizedWorker[] | undefined,
    }))

    return Response.json({ ok: true, data: dto, meta }, { status: 200 })
  } catch (err: unknown) {
    console.error('[api/torns/getTorns] error:', err)
    return Response.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}





