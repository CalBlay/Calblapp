// file: src/services/sync/adaSync.ts
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { Agent, request } from 'node:https'

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
  code?: string
  codeConfirmed?: boolean
  codeSource?: string
  codeMatchScore?: number
  codeMatchFields?: string[]
}

type MatchResult = {
  ada: AdaEvent
  score: number
  fields: string[]
}

const ADA_API_URL = process.env.ADA_API_URL || 'https://api.calblay.com/evento'
const ADA_API_TOKEN = process.env.ADA_API_TOKEN || ''
const ADA_TIMEZONE = 'Europe/Madrid'

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normalizeText = (s?: string | null) =>
  unaccent(String(s || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const normalizeStageName = (raw?: string | null) => {
  const base = String(raw || '').split('/')[0] || ''
  return normalizeText(base)
}

const normalizeAdaDescription = (raw?: string | null) => {
  let text = String(raw || '').trim()
  text = text.replace(/^[A-Z]\s*\d{6}\s*/i, '')
  text = text.split(/\s+-\s+/)[0] || text
  return normalizeText(text)
}

const normalizeCommercial = (raw?: string | null) => normalizeText(raw)

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

const buildMatch = (stage: StageEvent, ada: AdaEvent): MatchResult => {
  const stageDate = dateKey(stage.DataInici)
  const adaDate = dateKey(ada.fechaInicio)
  const dateMatches = stageDate && adaDate && stageDate === adaDate

  const stageCom = normalizeCommercial(stage.Comercial)
  const adaCom = normalizeCommercial(ada.codigoComercial)
  const comercialMatches = stageCom && adaCom && stageCom === adaCom

  const stageName = normalizeStageName(stage.NomEvent)
  const adaName = normalizeAdaDescription(ada.descripcion)
  const nameMatches = stageName && adaName && stageName === adaName

  const fields: string[] = []
  if (dateMatches) fields.push('date')
  if (comercialMatches) fields.push('commercial')
  if (nameMatches) fields.push('name')

  const score = fields.length
  return { ada, score, fields }
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
  if (allowInsecure) {
    const agent = new Agent({ rejectUnauthorized: false })
    const { status, body } = await new Promise<{
      status: number
      body: string
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
            resolve({ status: res.statusCode || 0, body: data })
          })
        }
      )
      req.on('error', reject)
      req.end()
    })

    if (status < 200 || status >= 300) {
      throw new Error(`ADA API error: ${status}`)
    }

    const data = JSON.parse(body) as AdaEvent[]
    return Array.isArray(data) ? data : []
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${ADA_API_TOKEN}` },
  })

  if (!res.ok) {
    throw new Error(`ADA API error: ${res.status}`)
  }

  const data = (await res.json()) as AdaEvent[]
  return Array.isArray(data) ? data : []
}

export async function syncAdaEventsToFirestore(opts?: {
  startDate?: string
  endDate?: string
}) {
  const startDate = opts?.startDate || formatDateInTZ(new Date(), ADA_TIMEZONE)
  const endDate = opts?.endDate || addMonthsToISO(startDate, 3, ADA_TIMEZONE)

  const adaEvents = await fetchAdaEvents(startDate, endDate)

  const adaByDate = new Map<string, AdaEvent[]>()
  for (const ev of adaEvents) {
    const key = dateKey(ev.fechaInicio)
    if (!key) continue
    if (!adaByDate.has(key)) adaByDate.set(key, [])
    adaByDate.get(key)!.push(ev)
  }

  const stageSnap = await firestore
    .collection('stage_verd')
    .where('DataInici', '>=', startDate)
    .where('DataInici', '<=', endDate)
    .get()

  const batch = firestore.batch()
  let pending = 0
  const flush = async () => {
    if (pending > 0) {
      await batch.commit()
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

  const now = new Date().toISOString()
  const confirmedCodeOwner = new Map<string, string | null>()

  const getConfirmedOwner = async (code: string) => {
    if (confirmedCodeOwner.has(code)) return confirmedCodeOwner.get(code) || null
    const snap = await firestore
      .collection('stage_verd')
      .where('code', '==', code)
      .where('codeConfirmed', '==', true)
      .limit(1)
      .get()
    const owner = snap.empty ? null : snap.docs[0].id
    confirmedCodeOwner.set(code, owner)
    return owner
  }

  for (const doc of stageSnap.docs) {
    total++
    const data = doc.data() as StageEvent
    const stageDate = dateKey(data.DataInici)
    if (!stageDate) {
      noMatch++
      continue
    }

    const codeSource = String(data.codeSource || '').toLowerCase()
    if (codeSource === 'manual') {
      skippedManual++
      continue
    }
    if (data.codeConfirmed === true) {
      skippedConfirmed++
      continue
    }

    const candidates = adaByDate.get(stageDate) || []
    if (!candidates.length) {
      noMatch++
      continue
    }

    let best: MatchResult | null = null
    for (const cand of candidates) {
      const match = buildMatch(data, cand)
      if (match.score === 3) {
        best = match
        break
      }
      if (match.score === 2 && !best) {
        best = match
      }
    }

    if (!best || best.score < 2) {
      noMatch++
      continue
    }

    const code = String(best.ada.codigo || '').trim()
    if (!code) {
      noMatch++
      continue
    }

    const matchScore = best.score
    const matchFields = best.fields
    const confirmed = matchScore === 3

    if (confirmed) matched3++
    else matched2++

    const confirmedOwner = await getConfirmedOwner(code)
    if (confirmedOwner && confirmedOwner !== doc.id) {
      skippedConfirmedCode++
      continue
    }

    const existingFields = Array.isArray(data.codeMatchFields) ? data.codeMatchFields : []
    const needsUpdate =
      String(data.code || '').trim() !== code ||
      data.codeConfirmed !== confirmed ||
      Number(data.codeMatchScore || 0) !== matchScore ||
      JSON.stringify(existingFields) !== JSON.stringify(matchFields) ||
      String(data.codeSource || '').toLowerCase() !== 'auto'

    if (!needsUpdate) continue

    const ref = firestore.collection('stage_verd').doc(doc.id)
    batch.update(ref, {
      code,
      codeConfirmed: confirmed,
      codeMatchScore: matchScore,
      codeMatchFields: matchFields,
      codeSource: 'auto',
      codeMatchedAt: now,
    })
    pending++
    updated++

    if (pending >= 450) await flush()
  }

  await flush()

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
    adaCount: adaEvents.length,
  }
}
