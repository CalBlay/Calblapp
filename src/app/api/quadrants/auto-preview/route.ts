/**
 * Previsualitzacio del mode Auto sense escriure res a Firestore.
 *
 * Llegeix el motor d'aprenentatge (`quadrantTrainingSamples`) i, si hi ha
 * prou casos similars, retorna una proposta amb noms i ids resolts a partir
 * del personal del departament. La UI usa aquesta resposta per pre-omplir el
 * formulari del modal en clicar la pestanya Auto.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getToken } from 'next-auth/jwt'
import {
  getQuadrantLearningSuggestion,
  type QuadrantLearningSuggestion,
} from '@/lib/quadrantLearning'
import { loadDepartmentPersonnel, type DepartmentPersonnelRef } from '@/services/premises'
import { QUADRANTS_LIST_CACHE_TAG } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

const AUTO_PREVIEW_REVALIDATE_SEC = 120

type AutoPreviewProposal = {
  responsible: { id: string; name: string; available: boolean } | null
  drivers: Array<{ id: string; name: string; available: boolean }>
  staff: Array<{ id: string; name: string; available: boolean }>
  totalWorkers: number | null
  numDrivers: number | null
}

type AutoPreviewPayload = {
  ok: true
  learningStatus: QuadrantLearningSuggestion
  proposal: AutoPreviewProposal | null
}

const unaccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const norm = (value?: string | null) =>
  unaccent(String(value ?? '').toLowerCase().trim())

const QUADRANT_CORE_DEPARTMENTS = new Set(['serveis', 'cuina', 'logistica'])

const findPersonByName = (
  pool: DepartmentPersonnelRef[],
  rawName?: string | null
): DepartmentPersonnelRef | null => {
  const target = norm(rawName || '')
  if (!target) return null
  const exact = pool.find((person) => norm(person.name) === target)
  if (exact) return exact
  const startsWith = pool.filter((person) => norm(person.name).startsWith(target))
  if (startsWith.length === 1) return startsWith[0]
  const contains = pool.filter((person) => norm(person.name).includes(target))
  if (contains.length === 1) return contains[0]
  return null
}

const resolveName = (
  pool: DepartmentPersonnelRef[],
  rawName: string,
  used: Set<string>
) => {
  const person = findPersonByName(pool, rawName)
  const id = person?.id || ''
  const name = person?.name || rawName
  const key = id || norm(name)
  if (key && used.has(key)) return null
  if (key) used.add(key)
  return { id, name, available: person?.available !== false }
}

/**
 * Cache servidor: la previsualitzacio depen nomes del context
 * (dept + eventId + dades de l'esdeveniment); el resultat es estable
 * fins que es confirma un nou quadrant (que invalida el tag).
 */
const computeAutoPreviewCached = unstable_cache(
  async (
    department: string,
    eventId: string,
    ln: string,
    service: string,
    location: string,
    numPax: number | null,
    startDate: string,
    startTime: string,
    phaseType: string
  ): Promise<AutoPreviewPayload> => {
    const learning = await getQuadrantLearningSuggestion({
      department,
      eventId: eventId || null,
      ln: ln || null,
      service: service || null,
      location: location || null,
      numPax,
      startDate: startDate || null,
      startTime: startTime || null,
      phaseType: phaseType || null,
    })

    if (!learning.hasNameSuggestions) {
      return { ok: true, learningStatus: learning, proposal: null }
    }

    const personnel = await loadDepartmentPersonnel(department)
    const used = new Set<string>()

    const responsibleResolved = learning.preferredNames.responsible
      ? resolveName(personnel, learning.preferredNames.responsible, used)
      : null

    const driversResolved = learning.preferredNames.drivers
      .map((name) => resolveName(personnel, name, used))
      .filter((entry): entry is { id: string; name: string; available: boolean } =>
        Boolean(entry)
      )

    const staffResolved = learning.preferredNames.staff
      .map((name) => resolveName(personnel, name, used))
      .filter((entry): entry is { id: string; name: string; available: boolean } =>
        Boolean(entry)
      )

    const totalWorkers =
      learning.structure.typicalWorkers ??
      driversResolved.length + staffResolved.length + (responsibleResolved ? 1 : 0)
    const numDrivers = learning.structure.typicalDrivers ?? driversResolved.length

    return {
      ok: true,
      learningStatus: learning,
      proposal: {
        responsible: responsibleResolved,
        drivers: driversResolved,
        staff: staffResolved,
        totalWorkers,
        numDrivers,
      },
    }
  },
  ['api-quadrants-auto-preview-v1'],
  { revalidate: AUTO_PREVIEW_REVALIDATE_SEC, tags: [QUADRANTS_LIST_CACHE_TAG] }
)

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const department = norm(url.searchParams.get('department') || '')
    if (!department || !QUADRANT_CORE_DEPARTMENTS.has(department)) {
      return NextResponse.json(
        { ok: false, error: 'Department invalid (cal serveis, cuina o logistica)' },
        { status: 400 }
      )
    }

    const numPaxParam = url.searchParams.get('numPax')
    const numPaxParsed = numPaxParam !== null ? Number(numPaxParam) : null
    const numPax =
      numPaxParsed !== null && Number.isFinite(numPaxParsed) ? numPaxParsed : null

    const payload = await computeAutoPreviewCached(
      department,
      url.searchParams.get('eventId') || '',
      url.searchParams.get('ln') || '',
      url.searchParams.get('service') || '',
      url.searchParams.get('location') || '',
      numPax,
      url.searchParams.get('startDate') || '',
      url.searchParams.get('startTime') || '',
      url.searchParams.get('phaseType') || ''
    )

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[quadrants/auto-preview] error', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
