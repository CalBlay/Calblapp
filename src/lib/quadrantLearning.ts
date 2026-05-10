/**
 * Motor d'aprenentatge per a l'opcio Auto del modul de quadrants.
 *
 * Llegeix les mostres confirmades de `quadrantTrainingSamples`, busca les
 * mes semblants al context de l'esdeveniment actual i genera un suggeriment
 * d'estructura (responsable, conductors, treballadors) i de noms preferits.
 *
 * Aquest motor NO confirma res ni decideix sol: nomes proposa noms perque
 * la capa de validacio (`autoAssign`) els filtri per disponibilitat i regles.
 */
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

const QUADRANT_TRAINING_COLLECTION = 'quadrantTrainingSamples'

/** Llindar minim de mostres semblants per proposar estructura amb confiança. */
const MIN_SAMPLES_STRUCTURE = 5
/** Llindar minim de mostres semblants per proposar noms amb confiança. */
const MIN_SAMPLES_NAMES = 10
/** Puntuacio minima per considerar una mostra com a "semblant". */
const MIN_SIMILARITY_SCORE = 25
/** Mostres a llegir per departament (recents primer; limita cost de Firestore). */
const SAMPLE_FETCH_LIMIT = 200
/** Mostres mes semblants que retornem en el debug. */
const TOP_SAMPLE_DEBUG = 5

export type QuadrantLearningContext = {
  department: string
  eventId?: string | null
  ln?: string | null
  service?: string | null
  location?: string | null
  numPax?: number | null
  startDate?: string | null
  startTime?: string | null
  phaseType?: string | null
}

export type LearningConfidence = 'insufficient' | 'low' | 'medium' | 'high'

export type QuadrantLearningSuggestion = {
  hasEnoughData: boolean
  hasNameSuggestions: boolean
  confidence: LearningConfidence
  sampleCount: number
  similarSampleCount: number
  totalSamplesInDept: number
  recommendation: 'use_auto' | 'consider_semi' | 'use_semi_or_manual'
  structure: {
    typicalResponsibles: number | null
    typicalDrivers: number | null
    typicalWorkers: number | null
    typicalGroups: number | null
  }
  preferredNames: {
    responsible: string | null
    drivers: string[]
    staff: string[]
  }
  topSamples: Array<{
    score: number
    eventName: string
    code: string
    ln: string
    service: string
    location: string
    numPax: number | null
    confirmedAt: string | null
  }>
  reason?: string
}

const unaccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const norm = (value?: unknown) =>
  unaccent(String(value ?? '').toLowerCase().trim())

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const paxBucket = (pax: number | null): number | null => {
  if (pax === null) return null
  if (pax <= 30) return 0
  if (pax <= 80) return 1
  if (pax <= 150) return 2
  if (pax <= 300) return 3
  return 4
}

const timeBucket = (time?: string | null): 'mati' | 'tarda' | 'nit' | null => {
  const t = String(time ?? '').trim()
  if (!/^\d{1,2}:\d{2}/.test(t)) return null
  const hour = Number(t.split(':')[0])
  if (!Number.isFinite(hour)) return null
  if (hour < 12) return 'mati'
  if (hour < 19) return 'tarda'
  return 'nit'
}

const dayOfWeek = (dateISO?: string | null): number | null => {
  const d = String(dateISO ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const date = new Date(`${d}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.getDay()
}

const monthsSince = (epochOrIso: unknown): number => {
  let ms: number | null = null
  if (typeof epochOrIso === 'number' && Number.isFinite(epochOrIso)) {
    ms = epochOrIso
  } else if (typeof epochOrIso === 'string' && epochOrIso) {
    const parsed = Date.parse(epochOrIso)
    if (Number.isFinite(parsed)) ms = parsed
  }
  if (ms === null) return 12
  const diff = Date.now() - ms
  if (!Number.isFinite(diff) || diff <= 0) return 0
  return diff / (1000 * 60 * 60 * 24 * 30)
}

const recencyWeight = (months: number): number => {
  if (months <= 1) return 1
  if (months <= 3) return 0.9
  if (months <= 6) return 0.75
  if (months <= 12) return 0.6
  if (months <= 18) return 0.45
  return 0.3
}

type SampleRow = {
  id: string
  data: Record<string, unknown>
}

const readSampleString = (data: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (text) return text
    }
  }
  return ''
}

const readSampleNumber = (data: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const parsed = toNumber(data[key])
    if (parsed !== null) return parsed
  }
  return null
}

const readSampleSnapshot = (data: Record<string, unknown>) => {
  const snapshot = data.snapshot
  return typeof snapshot === 'object' && snapshot !== null
    ? (snapshot as Record<string, unknown>)
    : {}
}

const scoreSample = (
  ctx: QuadrantLearningContext,
  data: Record<string, unknown>
): number => {
  let score = 0

  const ctxLn = norm(ctx.ln)
  const sampleLn = norm(readSampleString(data, 'ln', 'lineOfBusiness'))
  if (ctxLn && sampleLn && ctxLn === sampleLn) score += 30

  const ctxService = norm(ctx.service)
  const sampleService = norm(readSampleString(data, 'service', 'serviceType'))
  if (ctxService && sampleService) {
    if (ctxService === sampleService) score += 25
    else if (sampleService.includes(ctxService) || ctxService.includes(sampleService)) score += 12
  }

  const ctxLocation = norm(ctx.location)
  const sampleLocation = norm(readSampleString(data, 'location'))
  if (ctxLocation && sampleLocation) {
    if (ctxLocation === sampleLocation) score += 20
    else if (sampleLocation.includes(ctxLocation) || ctxLocation.includes(sampleLocation)) score += 10
  }

  const ctxBucket = paxBucket(ctx.numPax ?? null)
  const sampleBucket = paxBucket(readSampleNumber(data, 'numPax'))
  if (ctxBucket !== null && sampleBucket !== null) {
    if (ctxBucket === sampleBucket) score += 15
    else if (Math.abs(ctxBucket - sampleBucket) === 1) score += 8
  }

  const ctxDay = dayOfWeek(ctx.startDate)
  const sampleDay = dayOfWeek(readSampleString(data, 'startDate'))
  if (ctxDay !== null && sampleDay !== null && ctxDay === sampleDay) score += 5

  const ctxTime = timeBucket(ctx.startTime)
  const sampleTime = timeBucket(readSampleString(data, 'startTime'))
  if (ctxTime && sampleTime && ctxTime === sampleTime) score += 5

  const ctxPhase = norm(ctx.phaseType)
  const samplePhase = norm(readSampleString(data, 'phaseType'))
  if (ctxPhase && samplePhase && ctxPhase === samplePhase) score += 5

  const months = monthsSince(data.createdAt ?? data.confirmedAt)
  return Math.round(score * recencyWeight(months))
}

const median = (values: number[]): number | null => {
  const filtered = values.filter((v) => Number.isFinite(v))
  if (filtered.length === 0) return null
  const sorted = [...filtered].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return sorted[mid]
}

const mostFrequent = (entries: string[], topN = 1): string[] => {
  const counter = new Map<string, { count: number; display: string }>()
  for (const raw of entries) {
    const display = String(raw || '').trim()
    if (!display || display === 'Extra') continue
    const key = norm(display)
    const current = counter.get(key)
    if (current) {
      current.count += 1
    } else {
      counter.set(key, { count: 1, display })
    }
  }
  return Array.from(counter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map((entry) => entry.display)
}

const addWeightedName = (
  counter: Map<string, { weight: number; display: string }>,
  rawName: string | null | undefined,
  weight: number
) => {
  const display = String(rawName || '').trim()
  if (!display || display === 'Extra') return
  const key = norm(display)
  if (!key) return
  const current = counter.get(key)
  if (current) {
    current.weight += weight
  } else {
    counter.set(key, { weight, display })
  }
}

const topWeightedNames = (
  counter: Map<string, { weight: number; display: string }>,
  topN: number
) =>
  Array.from(counter.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
    .map((entry) => entry.display)

const pairKey = (a: string, b: string) => {
  const left = norm(a)
  const right = norm(b)
  return [left, right].sort().join('::')
}

const addTeamPairs = (
  pairCounter: Map<string, number>,
  teamNames: string[],
  weight: number
) => {
  const uniqueNames = Array.from(
    new Map(
      teamNames
        .map((name) => String(name || '').trim())
        .filter((name) => Boolean(name) && name !== 'Extra')
        .map((name) => [norm(name), name] as const)
    ).values()
  )

  for (let i = 0; i < uniqueNames.length; i += 1) {
    for (let j = i + 1; j < uniqueNames.length; j += 1) {
      const key = pairKey(uniqueNames[i], uniqueNames[j])
      pairCounter.set(key, (pairCounter.get(key) || 0) + weight)
    }
  }
}

const pairWeight = (
  pairCounter: Map<string, number>,
  a: string,
  b: string
) => pairCounter.get(pairKey(a, b)) || 0

const rankStaffByTeamCompatibility = ({
  staffCounter,
  pairCounter,
  anchors,
  topN,
}: {
  staffCounter: Map<string, { weight: number; display: string }>
  pairCounter: Map<string, number>
  anchors: string[]
  topN: number
}) => {
  const selected: string[] = []
  const selectedKeys = new Set<string>()
  const candidates = Array.from(staffCounter.values())

  while (selected.length < topN && selected.length < candidates.length) {
    const best = candidates
      .filter((candidate) => !selectedKeys.has(norm(candidate.display)))
      .map((candidate) => {
        const team = [...anchors, ...selected]
        const compatibility = team.reduce(
          (sum, teammate) => sum + pairWeight(pairCounter, candidate.display, teammate),
          0
        )
        return {
          ...candidate,
          score: candidate.weight + compatibility * 0.7,
        }
      })
      .sort((a, b) => b.score - a.score)[0]

    if (!best) break
    selected.push(best.display)
    selectedKeys.add(norm(best.display))
  }

  return selected
}

type ScoredSample = {
  id: string
  score: number
  data: Record<string, unknown>
}

const fetchDepartmentSamples = async (department: string): Promise<SampleRow[]> => {
  const deptKey = norm(department)
  if (!deptKey) return []
  const snap = await db
    .collection(QUADRANT_TRAINING_COLLECTION)
    .where('department', '==', deptKey)
    .orderBy('createdAt', 'desc')
    .limit(SAMPLE_FETCH_LIMIT)
    .get()
  return snap.docs.map((doc) => ({
    id: doc.id,
    data: (doc.data() || {}) as Record<string, unknown>,
  }))
}

const buildEmptySuggestion = (
  totalSamplesInDept: number,
  reason: string
): QuadrantLearningSuggestion => ({
  hasEnoughData: false,
  hasNameSuggestions: false,
  confidence: 'insufficient',
  sampleCount: 0,
  similarSampleCount: 0,
  totalSamplesInDept,
  recommendation: 'use_semi_or_manual',
  structure: {
    typicalResponsibles: null,
    typicalDrivers: null,
    typicalWorkers: null,
    typicalGroups: null,
  },
  preferredNames: {
    responsible: null,
    drivers: [],
    staff: [],
  },
  topSamples: [],
  reason,
})

export async function getQuadrantLearningSuggestion(
  ctx: QuadrantLearningContext
): Promise<QuadrantLearningSuggestion> {
  const samples = await fetchDepartmentSamples(ctx.department)
  if (samples.length === 0) {
    return buildEmptySuggestion(
      0,
      'Encara no hi ha quadrants confirmats en aquest departament'
    )
  }

  const scored: ScoredSample[] = samples
    .map((row) => ({ id: row.id, data: row.data, score: scoreSample(ctx, row.data) }))
    .filter((row) => row.score >= MIN_SIMILARITY_SCORE)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return buildEmptySuggestion(
      samples.length,
      'No hi ha quadrants confirmats prou semblants a aquest esdeveniment'
    )
  }

  const totalWorkersList = scored
    .map((s) => readSampleNumber(s.data, 'totalWorkers'))
    .filter((v): v is number => v !== null)
  const numDriversList = scored
    .map((s) => readSampleNumber(s.data, 'numDrivers'))
    .filter((v): v is number => v !== null)
  const groupsCountList = scored
    .map((s) => readSampleNumber(s.data, 'groupCount'))
    .filter((v): v is number => v !== null)

  const responsibleNames: string[] = []
  const driverNames: string[] = []
  const staffNames: string[] = []
  const responsibleCounter = new Map<string, { weight: number; display: string }>()
  const driverCounter = new Map<string, { weight: number; display: string }>()
  const staffCounter = new Map<string, { weight: number; display: string }>()
  const teammatePairCounter = new Map<string, number>()

  for (const sample of scored) {
    const snapshot = readSampleSnapshot(sample.data)
    const assigned = sample.data.assigned as
      | { responsible?: string | null; drivers?: string[]; staff?: string[] }
      | undefined
    const sampleWeight = Math.max(sample.score, 1)

    const respFromAssigned = assigned?.responsible || null
    const respFromSnapshot = readSampleString(snapshot, 'responsableName')
    const respFromResponsable = (() => {
      const r = snapshot.responsable
      if (typeof r === 'object' && r !== null && 'name' in r) {
        return String((r as { name?: unknown }).name || '').trim()
      }
      return ''
    })()
    const responsible = respFromAssigned || respFromSnapshot || respFromResponsable
    if (responsible) {
      responsibleNames.push(responsible)
      addWeightedName(responsibleCounter, responsible, sampleWeight)
    }

    const driversArray = Array.isArray(assigned?.drivers) ? assigned!.drivers! : []
    driversArray.forEach((name) => {
      if (typeof name === 'string' && name.trim()) {
        driverNames.push(name.trim())
        addWeightedName(driverCounter, name.trim(), sampleWeight)
      }
    })

    const staffArray = Array.isArray(assigned?.staff) ? assigned!.staff! : []
    staffArray.forEach((name) => {
      if (typeof name === 'string' && name.trim()) {
        staffNames.push(name.trim())
        addWeightedName(staffCounter, name.trim(), sampleWeight)
      }
    })

    addTeamPairs(teammatePairCounter, [
      responsible,
      ...driversArray,
      ...staffArray,
    ].filter((name): name is string => typeof name === 'string' && Boolean(name.trim())), sampleWeight)
  }

  const hasEnoughData = scored.length >= MIN_SAMPLES_STRUCTURE
  const hasNameSuggestions = scored.length >= MIN_SAMPLES_NAMES

  const confidence: LearningConfidence = hasNameSuggestions
    ? 'high'
    : hasEnoughData
      ? 'medium'
      : scored.length > 0
        ? 'low'
        : 'insufficient'

  const recommendation: QuadrantLearningSuggestion['recommendation'] = hasNameSuggestions
    ? 'use_auto'
    : hasEnoughData
      ? 'consider_semi'
      : 'use_semi_or_manual'

  const typicalDrivers = median(numDriversList)
  const typicalWorkers = median(totalWorkersList)
  const typicalGroups = median(groupsCountList)
  const typicalResponsibles = responsibleNames.length > 0 ? 1 : 0
  const preferredResponsible = hasNameSuggestions
    ? topWeightedNames(responsibleCounter, 1)[0] || mostFrequent(responsibleNames, 1)[0] || null
    : null
  const preferredDrivers = hasNameSuggestions
    ? topWeightedNames(driverCounter, 6)
    : []
  const preferredStaff = hasNameSuggestions
    ? rankStaffByTeamCompatibility({
        staffCounter,
        pairCounter: teammatePairCounter,
        anchors: [
          preferredResponsible,
          ...preferredDrivers,
        ].filter((name): name is string => Boolean(name)),
        topN: 12,
      })
    : []

  return {
    hasEnoughData,
    hasNameSuggestions,
    confidence,
    sampleCount: scored.length,
    similarSampleCount: scored.length,
    totalSamplesInDept: samples.length,
    recommendation,
    structure: {
      typicalResponsibles,
      typicalDrivers,
      typicalWorkers,
      typicalGroups,
    },
    preferredNames: {
      responsible: preferredResponsible,
      drivers: preferredDrivers,
      staff: preferredStaff,
    },
    topSamples: scored.slice(0, TOP_SAMPLE_DEBUG).map((s) => ({
      score: s.score,
      eventName: readSampleString(s.data, 'eventName'),
      code: readSampleString(s.data, 'code'),
      ln: readSampleString(s.data, 'ln', 'lineOfBusiness'),
      service: readSampleString(s.data, 'service', 'serviceType'),
      location: readSampleString(s.data, 'location'),
      numPax: readSampleNumber(s.data, 'numPax'),
      confirmedAt: readSampleString(s.data, 'confirmedAt') || null,
    })),
  }
}
