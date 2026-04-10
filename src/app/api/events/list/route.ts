// â file: src/app/api/events/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { queryQuadrantCollectionDocsInDateRange } from '@/lib/firestoreQuadrantsRangeQuery'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'

const EVENTS_LIST_REVALIDATE_SEC = 90

export const runtime = 'nodejs'

interface TokenLike {
  role?: string
  userRole?: string
  user?: { role?: string; name?: string; department?: string }
  department?: string
  userDepartment?: string
  dept?: string
  departmentName?: string
}

/* ================== Utils ================== */
const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normalize = (s?: string | null) => unaccent(s).toLowerCase().trim()

const normCode = (s?: string | null) =>
  (s ? unaccent(String(s)).toLowerCase().trim().replace(/\s+/g, '') : '')

const dayKey = (iso?: string) => (iso || '').slice(0, 10)

const addDaysUTC = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

function normalizeColId(id: string): string {
  const rest = id.replace(/^quadrants?/i, '')
  return rest
    .replace(/[_\-\s]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/* ================== Tipus ================== */
interface QuadrantDoc {
  id: string
  code?: string
  eventId?: string
  status?: string
  responsable?: { name?: string }
  conductors?: Array<{ name?: string }>
  treballadors?: Array<{ name?: string }>
}

type AvisoSummary = {
  content: string
  department: string
  createdAt: string
}

type StageVerdDoc = Record<string, unknown>

/** Primer valor string (o número convertit) no buit entre claus d’un doc Firestore. */
function firstDocString(d: StageVerdDoc, keys: string[]): string | null {
  for (const k of keys) {
    const v = d[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) return t
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      const t = String(v).trim()
      if (t) return t
    }
  }
  return null
}

/* ================== Collections map ================== */
const COLS_MAP: Record<string, string> = {}
let COLS_LOADED = false

async function loadCollectionsMap() {
  if (COLS_LOADED) return
  const cols = await db.listCollections()
  cols.forEach((c) => {
    const key = normalizeColId(c.id)
    if (key) COLS_MAP[key] = c.id
  })
  COLS_LOADED = true
  console.log('[events/list] ð Collections map carregat:', COLS_MAP)
}

async function resolveColForDept(dept: string): Promise<string | undefined> {
  await loadCollectionsMap()
  const normDept = normalize(dept)
  let result = COLS_MAP[normDept]
  if (!result) {
    const alt = Object.entries(COLS_MAP).find(([k]) => k.includes(normDept))
    if (alt) {
      result = alt[1]
      console.log('[resolveColForDept] â ï¸ Fallback match:', { dept, normDept, result })
    } else {
      console.log('[resolveColForDept] â No colÂ·lecciÃ³ per dept:', { dept, normDept })
    }
  }
  return result
}

/* ================== Quadrants query ================== */
async function fetchQuadrantsRange(
  coll: string,
  start: string,
  end: string
): Promise<QuadrantDoc[]> {
  const { docs, usedFullCollectionScan } = await queryQuadrantCollectionDocsInDateRange(
    db.collection(coll),
    start,
    end
  )
  if (usedFullCollectionScan) {
    console.warn(`[events/list] ${coll}: lectura completa quadrants (índexs)`)
  }
  const out: QuadrantDoc[] = docs.map((doc) => {
    const data = doc.data() as unknown as Omit<QuadrantDoc, 'id'>
    return { id: doc.id, ...data }
  })
  console.log(`[events/list] ð ${coll} â ${out.length} docs`)
  return out
}

async function fetchLatestAvisosByCodes(codes: string[]): Promise<Map<string, AvisoSummary>> {
  const normalizedCodes = Array.from(
    new Set(codes.map((code) => String(code || '').trim()).filter(Boolean))
  )
  const out = new Map<string, AvisoSummary>()
  if (normalizedCodes.length === 0) return out

  for (let i = 0; i < normalizedCodes.length; i += 10) {
    const chunk = normalizedCodes.slice(i, i + 10)
    const snap = await db.collection('avisos').where('code', 'in', chunk).get()

    snap.forEach((doc) => {
      const data = doc.data() as {
        code?: string
        content?: string
        department?: string
        createdAt?: { toDate?: () => Date } | string
        editedAt?: { toDate?: () => Date } | string
        createdBy?: { department?: string }
      }
      const code = String(data.code || '').trim()
      if (!code) return

      const createdAtValue =
        typeof data.editedAt === 'object' && data.editedAt?.toDate
          ? data.editedAt.toDate().toISOString()
          : typeof data.editedAt === 'string'
          ? data.editedAt
          : typeof data.createdAt === 'object' && data.createdAt?.toDate
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt === 'string'
          ? data.createdAt
          : ''

      const current = out.get(code)
      if (current && current.createdAt >= createdAtValue) return

      out.set(code, {
        content: String(data.content || ''),
        department: String(data.createdBy?.department || data.department || ''),
        createdAt: createdAtValue,
      })
    })
  }

  return out
}

/* ================== Roles ================== */
type Role = 'admin' | 'direccio' | 'cap' | 'treballador' | 'comercial' | 'usuari'

function roleFrom(token: TokenLike | null): Role {
  const raw = token?.role ?? token?.userRole ?? token?.user?.role ?? ''
  const r = normalize(raw)

  if (r === 'admin') return 'admin'
  if (r === 'direccio' || r.includes('dir')) return 'direccio'
  if (r === 'cap' || r.includes('head')) return 'cap'
  if (r === 'comercial' || r === 'commercial' || r === 'sales') return 'comercial'
  if (r === 'usuari' || r === 'user' || r === 'invitado' || r === 'usuario') return 'usuari'

  return 'treballador'
}

type EventsListCachedPayload = {
  events: Record<string, unknown>[]
  responsables: string[]
  responsablesDetailed: Array<{ name: string; department: string }>
  locations: string[]
  _log: { baseRows: number; filteredRows: number; quadrantCollections: number }
}

const getEventsListCached = unstable_cache(
  async (
    start: string,
    end: string,
    role: Role,
    userNameNorm: string,
    qsDept: string,
    sessDept: string
  ): Promise<EventsListCachedPayload> => {
    let deptsToUse: string[] = []
    if (role === 'cap') {
      if (!sessDept) {
        return {
          events: [],
          responsables: [],
          responsablesDetailed: [],
          locations: [],
          _log: { baseRows: 0, filteredRows: 0, quadrantCollections: 0 },
        }
      }
      deptsToUse = [sessDept]
    } else if (role === 'admin' || role === 'direccio') {
      if (qsDept && qsDept !== 'total') deptsToUse = [qsDept]
      else deptsToUse = []
    }

    const timeMin = `${start}T00:00:00.000Z`
    const timeMaxExclusive = addDaysUTC(end, 1)

    const stageDocs = await queryStageCollectionDocsInDateRange(
      db,
      'stage_verd',
      start.slice(0, 10),
      end.slice(0, 10)
    )

    const base = stageDocs.map((doc) => {
      const d = doc.data() as StageVerdDoc

      const startISO = d?.DataInici ? `${d.DataInici}T00:00:00.000Z` : null
      const endISO = d?.DataFi ? `${d.DataFi}T00:00:00.000Z` : startISO
      const pax = Number(d?.NumPax ?? 0) || 0
      const importAmount = Number(d?.Import ?? d?.import ?? d?.importAmount ?? 0) || 0
      const eventCode = firstDocString(d, [
        'code',
        'Code',
        'C_digo',
        'codi',
        'Codi',
      ])
      const commercial = firstDocString(d, [
        'Comercial',
        'COMERCIAL',
        'comercial',
        'comercialNom',
        'Comercial_nom',
        'Commercial',
        'Sales',
        'ResponsableComercial',
        'ComercialName',
        'ComercialNom',
      ])
      const codeConfirmed =
        typeof d?.codeConfirmed === 'boolean' ? d.codeConfirmed : undefined
      const codeMatchScore =
        typeof d?.codeMatchScore === 'number' ? d.codeMatchScore : null

      const rawSummary = String(d?.NomEvent ?? '(Sense títol)')
      const summary = rawSummary.split('/')[0].trim()

      const rawLocation = typeof d?.Ubicacio === 'string' ? d.Ubicacio : String(d?.Ubicacio ?? '')
      const location = rawLocation
        .split('(')[0]
        .split('/')[0]
        .replace(/^ZZRestaurant\s*/i, '')
        .replace(/^ZZ\s*/i, '')
        .trim()

      const rawHora =
        typeof d?.HoraInici === 'string'
          ? d.HoraInici
          : typeof d?.horaInici === 'string'
          ? d.horaInici
          : typeof d?.Hora === 'string'
          ? d.Hora
          : typeof d?.hora === 'string'
          ? d.hora
          : ''
      const horaInici =
        typeof rawHora === 'string' ? rawHora.trim().slice(0, 5) : ''
      const lnValue = d?.LN != null && d.LN !== '' ? String(d.LN) : 'Altres'

      return {
        id: doc.id,
        summary,
        start: startISO,
        end: endISO,
        day: startISO ? dayKey(startISO) : '',
        location,
        pax,
        importAmount,
        eventCode,
        commercial,
        codeConfirmed,
        codeMatchScore,
        htmlLink: null,
        lnKey: lnValue.toLowerCase(),
        lnLabel: lnValue,
        horaInici,
        fincaId: d?.FincaId ?? null,
        fincaCode: d?.FincaCode ?? null,
      }
    })

    const filteredByRange = base.filter((ev) => {
      if (!ev.start) return false
      const s = new Date(ev.start as string).toISOString()
      return s >= timeMin && s < timeMaxExclusive
    })

    await loadCollectionsMap()
    let collNames: string[] = []
    if (deptsToUse.length > 0) {
      collNames = (await Promise.all(deptsToUse.map(resolveColForDept))).filter(Boolean) as string[]
    } else {
      collNames = Object.values(COLS_MAP).filter((c) => c.toLowerCase().startsWith('quadrants'))
    }

    const responsablesSet: Set<string> = new Set()
    const responsablesMap: Map<string, Set<string>> = new Map()
    const stateMap: Map<string, 'pending' | 'draft' | 'confirmed'> = new Map()
    const responsablesDetailedSet: Set<string> = new Set()
    const myEvents: Set<string> = new Set()

    for (const coll of collNames) {
      const rows = await fetchQuadrantsRange(coll, start, end)
      const dept = normalizeColId(coll)
      const foundInColl: string[] = []

      for (const q of rows) {
        if (q?.responsable?.name && q?.code) {
          const name = String(q.responsable.name).trim()
          const c = normCode(String(q.code))

          if (!responsablesMap.has(c)) responsablesMap.set(c, new Set())
          responsablesMap.get(c)!.add(name)

          responsablesSet.add(name)
          responsablesDetailedSet.add(JSON.stringify({ name, department: dept }))
          foundInColl.push(name)

          const allNames: string[] = [
            q?.responsable?.name,
            ...(q?.conductors || []).map((c) => c.name),
            ...(q?.treballadors || []).map((t) => t.name),
          ].filter(Boolean) as string[]

          if (role === 'treballador' && allNames.some((n) => normalize(n) === userNameNorm)) {
            if (q?.code) myEvents.add(normCode(String(q.code)))
            if (q?.eventId) myEvents.add(String(q.eventId))

            const isResp = normalize(q?.responsable?.name) === userNameNorm
            if (isResp) {
              if (q?.code) myEvents.add(`RESP:${normCode(String(q.code))}`)
              if (q?.eventId) myEvents.add(`RESP:${String(q.eventId)}`)
            }
          }

          stateMap.set(c, q?.status === 'confirmed' ? 'confirmed' : 'draft')
        }
      }

      console.log(`[events/list] ð Responsables trobats a ${coll} (${dept}):`, foundInColl)
    }

    const avisoMap = await fetchLatestAvisosByCodes(
      filteredByRange.map((ev) => String(ev.eventCode || '').trim()).filter(Boolean)
    )

    const enriched = filteredByRange.map((ev) => {
      const keyByCode = normCode(ev.eventCode || '')
      const responsablesForCode = Array.from(responsablesMap.get(keyByCode) || [])
      const responsableName = responsablesForCode.join(', ')
      const state = stateMap.get(keyByCode) || 'pending'
      const aviso = ev.eventCode ? avisoMap.get(String(ev.eventCode).trim()) ?? null : null
      return { ...ev, responsableName, state, lastAviso: aviso }
    })

    let finalEvents = enriched
    if (role === 'treballador') {
      finalEvents = enriched
        .filter((ev) => myEvents.has(normCode(ev.eventCode || '')) || myEvents.has(ev.id as string))
        .map((ev) => {
          const isResp =
            myEvents.has(`RESP:${normCode(ev.eventCode || '')}`) ||
            myEvents.has(`RESP:${ev.id as string}`)
          return { ...ev, isResponsible: isResp }
        })
    } else {
      finalEvents = enriched.map((ev) => ({ ...ev, isResponsible: false }))
    }

    return {
      events: finalEvents,
      responsables: Array.from(responsablesSet),
      responsablesDetailed: Array.from(responsablesDetailedSet).map((r) => JSON.parse(r)),
      locations: Array.from(new Set(finalEvents.map((e) => e.location).filter(Boolean) as string[])),
      _log: {
        baseRows: base.length,
        filteredRows: filteredByRange.length,
        quadrantCollections: collNames.length,
      },
    }
  },
  ['api-events-list-v1'],
  { revalidate: EVENTS_LIST_REVALIDATE_SEC }
)

/* ================== Handler ================== */
export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    const scope = url.searchParams.get('scope') as 'all' | 'mine' | null
    const qsDeptRaw = url.searchParams.get('department') || ''
    let qsDept = normalize(qsDeptRaw)
    if (qsDept === 'unused') qsDept = ''

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten start i end' }, { status: 400 })
    }
    if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
      return NextResponse.json(
        { error: 'start i end han de ser dates YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role: Role = roleFrom(token)
    const userName: string =
      (token as { name?: string; user?: { name?: string } })?.name ||
      (token as { user?: { name?: string } })?.user?.name || ''

    const sessDept = normalize(
      (token as {
        department?: string
        userDepartment?: string
        dept?: string
        departmentName?: string
      }).department ??
        (token as { userDepartment?: string }).userDepartment ??
        (token as { dept?: string }).dept ??
        (token as { departmentName?: string }).departmentName ??
        ''
    )

    console.log('[events/list] ð¢ Token info:', { role, sessDept, qsDept, scope, userName })

    if (role === 'cap' && !sessDept) {
      return NextResponse.json(
        { events: [], responsables: [], responsablesDetailed: [], locations: [] },
        { status: 200 }
      )
    }

    const userNameNorm = role === 'treballador' ? normalize(userName) : ''
    const cached = await getEventsListCached(start, end, role, userNameNorm, qsDept, sessDept)
    const { _log, ...payload } = cached

    console.info('[events/list] completed', {
      durationMs: Date.now() - startedAt,
      role,
      scope,
      department: qsDept || sessDept || '',
      start,
      end,
      returned: payload.events.length,
      baseRows: _log.baseRows,
      filteredRows: _log.filteredRows,
      quadrantCollections: _log.quadrantCollections,
    })

    return NextResponse.json(payload, { status: 200 })
  } catch (err: unknown) {
    console.error('[api/events/list] â error', err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
  }
}
