// file: src/services/sync/adaSync.ts
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { Agent, request } from 'node:https'
import {
  canProvisionalPmShareAdaCode,
  isProvisionalPmCode,
  isRepeatablePmCode,
  normalizeAdaEventCode,
  reserveAdaEventCode,
} from './adaCodePolicy'
import { revalidateEventsListCache } from '@/lib/eventsListCache'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import {
  buildAdaMatch,
  stageAdaDateKeys,
  type AdaMatchResult,
} from './adaMatchPolicy'

export { isRepeatablePmCode } from './adaCodePolicy'

type AdaEvent = {
  codigo?: string
  descripcion?: string
  fechaInicio?: string
  codigoCliente?: string
  nombreCliente?: string
  codigoComercial?: string
  nombreComercial?: string
}

type StageEvent = {
  id: string
  NomEvent?: string
  Comercial?: string
  DataInici?: string
  NomClient?: string
  MenuTasting1Date?: string
  MenuTasting2Date?: string
  MenuTastingCompanyDate?: string
  Data_1_Prova_Men?: string
  Data_2a_Part_Tast?: string
  Data_i_hora?: string
  code?: string
  codeConfirmed?: boolean
  codeSource?: string
  codeMatchScore?: number
  codeMatchFields?: string[]
  manualOverrides?: Record<string, unknown>
  manualOverrideValues?: Record<string, unknown>
  adaLinkedMenuTasting?: boolean
}

const ADA_API_URL = process.env.ADA_API_URL || 'https://api.calblay.com/evento'
const ADA_API_TOKEN = process.env.ADA_API_TOKEN || ''
const ADA_TIMEZONE = 'Europe/Madrid'
const ADA_RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const ADA_MAX_ATTEMPTS = 3
const ADA_DEFAULT_MONTHS_AHEAD = 12
const ADA_SYNC_STAGE_COLLECTIONS = [
  'stage_verd',
  'stage_taronja',
  'stage_groc',
] as const

export class AdaApiError extends Error {
  status: number
  retryAfter: string | null
  responseBody: string | null

  constructor(
    message: string,
    opts: { status: number; retryAfter?: string | null; responseBody?: string | null }
  ) {
    super(message)
    this.name = 'AdaApiError'
    this.status = opts.status
    this.retryAfter = opts.retryAfter ?? null
    this.responseBody = opts.responseBody ?? null
  }
}

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normalizeText = (s?: string | null) =>
  unaccent(String(s || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const dateKey = (iso?: string | null) => (iso || '').slice(0, 10)

const formatDateInTZ = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value || '1970'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = parts.find((p) => p.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

const addMonthsToISO = (iso: string, months: number, timeZone: string) => {
  const [y, m, d] = iso.split('-').map((n) => Number(n))
  const base = new Date(Date.UTC(y, (m || 1) - 1 + months, d || 1))
  return formatDateInTZ(base, timeZone)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getRetryDelayMs = (attempt: number, retryAfter: string | null) => {
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  return attempt * 1000
}

async function fetchAdaEvents(startDate: string, endDate: string): Promise<AdaEvent[]> {
  if (!ADA_API_TOKEN) {
    throw new Error('Missing ADA_API_TOKEN env var')
  }

  const url = new URL(ADA_API_URL)
  url.searchParams.set('fechaDesde', startDate)
  url.searchParams.set('fechaHasta', endDate)

  const allowInsecure =
    process.env.ADA_INSECURE_TLS === 'true' && process.env.NODE_ENV !== 'production'
  const requestOnce = async () => {
    if (allowInsecure) {
      const agent = new Agent({ rejectUnauthorized: false })
      return new Promise<{
        status: number
        body: string
        retryAfter: string | null
      }>((resolve, reject) => {
        const req = request(
          url,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${ADA_API_TOKEN}` },
            agent,
          },
          (res) => {
            let data = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
              data += chunk
            })
            res.on('end', () => {
              const header = res.headers['retry-after']
              resolve({
                status: res.statusCode || 0,
                body: data,
                retryAfter: Array.isArray(header) ? header[0] : header || null,
              })
            })
          }
        )
        req.on('error', reject)
        req.end()
      })
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${ADA_API_TOKEN}` },
    })

    return {
      status: res.status,
      body: await res.text(),
      retryAfter: res.headers.get('retry-after'),
    }
  }

  let lastError: AdaApiError | null = null

  for (let attempt = 1; attempt <= ADA_MAX_ATTEMPTS; attempt++) {
    const { status, body, retryAfter } = await requestOnce()

    if (status >= 200 && status < 300) {
      const data = JSON.parse(body) as AdaEvent[]
      return Array.isArray(data) ? data : []
    }

    lastError = new AdaApiError(`ADA API error: ${status}`, {
      status,
      retryAfter,
      responseBody: body.slice(0, 500) || null,
    })

    if (!ADA_RETRYABLE_STATUS.has(status) || attempt === ADA_MAX_ATTEMPTS) {
      throw lastError
    }

    await sleep(getRetryDelayMs(attempt, retryAfter))
  }

  throw lastError || new AdaApiError('ADA API error: unknown', { status: 0 })
}

export async function syncAdaEventsToFirestore(opts?: {
  startDate?: string
  endDate?: string
}) {
  const startDate = opts?.startDate || formatDateInTZ(new Date(), ADA_TIMEZONE)
  const endDate =
    opts?.endDate || addMonthsToISO(startDate, ADA_DEFAULT_MONTHS_AHEAD, ADA_TIMEZONE)

  const adaEvents = await fetchAdaEvents(startDate, endDate)

  const adaByDate = new Map<string, AdaEvent[]>()
  const uniqueAdaCodes = new Set<string>()
  let duplicateAdaCodes = 0
  const orderedAdaEvents = [...adaEvents].sort((a, b) => {
    const dateDiff = dateKey(a.fechaInicio).localeCompare(dateKey(b.fechaInicio))
    if (dateDiff) return dateDiff
    return normalizeText(a.descripcion).localeCompare(normalizeText(b.descripcion))
  })
  for (const ev of orderedAdaEvents) {
    const code = normalizeAdaEventCode(ev.codigo)
    if (code && !isRepeatablePmCode(code)) {
      if (uniqueAdaCodes.has(code)) {
        duplicateAdaCodes++
        continue
      }
      uniqueAdaCodes.add(code)
    }
    const key = dateKey(ev.fechaInicio)
    if (!key) continue
    if (!adaByDate.has(key)) adaByDate.set(key, [])
    adaByDate.get(key)!.push(ev)
  }

  const stageSnapshots = await Promise.all(
    ADA_SYNC_STAGE_COLLECTIONS.map(async (collectionName) => ({
      collectionName,
      snapshot: await firestore
        .collection(collectionName)
        .where('DataInici', '>=', startDate)
        .where('DataInici', '<=', endDate)
        .get(),
    }))
  )

  let batch = firestore.batch()
  let pending = 0
  const flush = async () => {
    if (pending > 0) {
      await batch.commit()
      batch = firestore.batch()
      pending = 0
    }
  }

  let total = 0
  let skippedManual = 0
  let skippedConfirmed = 0
  let noMatch = 0
  let matched3 = 0
  let matched2 = 0
  let updated = 0
  let skippedConfirmedCode = 0
  let repairedDuplicateCodes = 0
  let replacedProvisionalCodes = 0

  const now = new Date().toISOString()
  const codeOwner = new Map<string, string | null>()

  const getCodeOwner = async (code: string) => {
    const normalizedCode = normalizeAdaEventCode(code)
    if (!normalizedCode || isRepeatablePmCode(normalizedCode)) return null
    if (codeOwner.has(normalizedCode)) {
      return codeOwner.get(normalizedCode) || null
    }
    const variants = Array.from(
      new Set([code.trim(), normalizedCode, normalizedCode.toLowerCase()])
    )
    const snapshots = await Promise.all(
      ADA_SYNC_STAGE_COLLECTIONS.map(async (collectionName) => ({
        collectionName,
        snapshot: await firestore
          .collection(collectionName)
          .where('code', 'in', variants)
          .limit(1)
          .get(),
      }))
    )
    const match = snapshots.find(({ snapshot }) => !snapshot.empty)
    const owner = match
      ? `${match.collectionName}/${match.snapshot.docs[0].id}`
      : null
    codeOwner.set(normalizedCode, owner)
    return owner
  }

  const stageDocs = stageSnapshots
    .flatMap(({ collectionName, snapshot }) =>
      snapshot.docs.map((doc) => ({ collectionName, doc }))
    )
    .sort((a, b) => {
      const dateDiff = dateKey((a.doc.data() as StageEvent).DataInici).localeCompare(
        dateKey((b.doc.data() as StageEvent).DataInici)
      )
      return (
        dateDiff ||
        ADA_SYNC_STAGE_COLLECTIONS.indexOf(a.collectionName) -
          ADA_SYNC_STAGE_COLLECTIONS.indexOf(b.collectionName) ||
        a.doc.id.localeCompare(b.doc.id)
      )
    })

  // Carrega primer els propietaris dels codis ja assignats dins del rang. Els manuals tenen
  // prioritat i, entre els automatics antics duplicats, conservem de manera
  // determinista el primer per data. La resta s'autocorregira en el bucle.
  for (const manualFirst of [true, false]) {
    for (const { collectionName, doc } of stageDocs) {
      const data = doc.data() as StageEvent
      const currentCode = String(data.code || '').trim()
      const isManual =
        String(data.codeSource || '').toLowerCase() === 'manual' ||
        data.manualOverrides?.code === true
      if (
        !currentCode ||
        isRepeatablePmCode(currentCode) ||
        isManual !== manualFirst
      ) {
        continue
      }
      const normalizedCode = normalizeAdaEventCode(currentCode)
      if (!codeOwner.has(normalizedCode)) {
        codeOwner.set(normalizedCode, `${collectionName}/${doc.id}`)
      }
    }
  }

  for (const { collectionName, doc } of stageDocs) {
    total++
    const data = doc.data() as StageEvent
    const documentKey = `${collectionName}/${doc.id}`
    const currentCode = String(data.code || '').trim()
    const provisionalPmCode = isProvisionalPmCode(currentCode)
    const codeSource = String(data.codeSource || '').toLowerCase()
    const linkedMenuTasting =
      data.adaLinkedMenuTasting === true || codeSource === 'ada-menu-tasting'
    const shareableMenuTastingCode = provisionalPmCode || linkedMenuTasting
    const matchDates = stageAdaDateKeys(data, shareableMenuTastingCode)
    if (matchDates.length === 0) {
      noMatch++
      continue
    }
    const codeManuallyOverridden = data.manualOverrides?.code === true
    // Els codis manuals normals continuen protegits. Un PM es provisional i
    // ADA el pot substituir quan trobi el codi definitiu del mateix registre.
    if ((codeSource === 'manual' || codeManuallyOverridden) && !provisionalPmCode) {
      skippedManual++
      continue
    }
    const currentOwner = await getCodeOwner(currentCode)
    if (
      currentCode &&
      currentOwner &&
      currentOwner !== documentKey &&
      !linkedMenuTasting
    ) {
      // Autocorreccio de duplicats creats per syncs anteriors. Els codis manuals
      // no s'han d'alterar mai des d'una sincronitzacio automatica.
      batch.update(doc.ref, {
        code: '',
        codeConfirmed: false,
        codeMatchScore: 0,
        codeMatchFields: [],
        codeSource: 'auto',
        codeMatchedAt: now,
      })
      pending++
      repairedDuplicateCodes++
      if (pending >= 450) await flush()
    } else if (currentCode && !linkedMenuTasting) {
      reserveAdaEventCode(codeOwner, currentCode, documentKey)
    }

    if (data.codeConfirmed === true && !provisionalPmCode) {
      if (linkedMenuTasting || !currentOwner || currentOwner === documentKey) {
        skippedConfirmed++
        continue
      }
    }

    const candidates = Array.from(
      new Set(matchDates.flatMap((matchDate) => adaByDate.get(matchDate) || []))
    )
    if (!candidates.length) {
      noMatch++
      continue
    }

    let best: AdaMatchResult | null = null
    for (const cand of candidates) {
      const match = buildAdaMatch(data, cand, shareableMenuTastingCode)
      if (!best || match.score > best.score) best = match
      if (match.score === 4) break
    }

    if (!best || best.score < 2) {
      noMatch++
      continue
    }

    const code = String(best.ada.codigo || '').trim()
    if (!code || isProvisionalPmCode(code)) {
      noMatch++
      continue
    }

    const matchScore = best.score
    const matchFields = best.fields
    const confirmed = matchScore >= 3
    const canShareExistingAdaCode = canProvisionalPmShareAdaCode(
      currentCode,
      matchScore
    )

    if (confirmed) matched3++
    else matched2++

    const existingOwner = await getCodeOwner(code)
    if (
      existingOwner &&
      existingOwner !== documentKey &&
      !canShareExistingAdaCode
    ) {
      skippedConfirmedCode++
      continue
    }

    // Reserva immediata dins la mateixa execucio. Sense aquesta reserva, dos
    // updates del mateix batch veien el codi com a lliure fins al commit.
    if (!isRepeatablePmCode(code) && !canShareExistingAdaCode) {
      reserveAdaEventCode(codeOwner, code, documentKey)
    }

    const existingFields = Array.isArray(data.codeMatchFields) ? data.codeMatchFields : []
    const nextCodeSource = canShareExistingAdaCode ? 'ada-menu-tasting' : 'auto'
    const needsUpdate =
      String(data.code || '').trim() !== code ||
      data.codeConfirmed !== confirmed ||
      Number(data.codeMatchScore || 0) !== matchScore ||
      JSON.stringify(existingFields) !== JSON.stringify(matchFields) ||
      String(data.codeSource || '').toLowerCase() !== nextCodeSource ||
      data.adaLinkedMenuTasting !== canShareExistingAdaCode

    if (!needsUpdate) continue

    const updatePayload: Record<string, unknown> = {
      code,
      codeConfirmed: confirmed,
      codeMatchScore: matchScore,
      codeMatchFields: matchFields,
      codeSource: nextCodeSource,
      adaLinkedMenuTasting: canShareExistingAdaCode,
      codeMatchedAt: now,
    }
    if (provisionalPmCode && data.manualOverrides?.code === true) {
      updatePayload['manualOverrides.code'] = FieldValue.delete()
    }
    if (
      provisionalPmCode &&
      data.manualOverrideValues &&
      Object.prototype.hasOwnProperty.call(data.manualOverrideValues, 'code')
    ) {
      updatePayload['manualOverrideValues.code'] = FieldValue.delete()
    }
    batch.update(doc.ref, updatePayload)
    pending++
    updated++
    if (provisionalPmCode) replacedProvisionalCodes++

    if (pending >= 450) await flush()
  }

  await flush()

  if (updated > 0 || repairedDuplicateCodes > 0) {
    revalidateEventsListCache()
    revalidateQuadrantsListCache()
  }

  return {
    startDate,
    endDate,
    total,
    updated,
    matched3,
    matched2,
    noMatch,
    skippedManual,
    skippedConfirmed,
    skippedConfirmedCode,
    repairedDuplicateCodes,
    replacedProvisionalCodes,
    duplicateAdaCodes,
    adaCount: adaEvents.length,
  }
}
