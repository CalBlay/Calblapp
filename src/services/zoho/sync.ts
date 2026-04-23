// file: src/services/zoho/sync.ts
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { zohoFetch } from '@/services/zoho/auth'

interface ZohoOwner {
  id: string
  name: string
  email?: string
}

interface ZohoDeal {
  id: string
  Deal_Name: string
  Stage: string
  Servicio_texto?: string | null
  Men_texto?: string | null
  N_mero_de_invitados?: number | string | null
  N_mero_de_personas_del_evento?: number | string | null
  Finca_2?: string[] | null
  Espai_2?: string[] | null
  Fecha_del_evento?: string | null
  Fecha_y_hora_del_evento?: string | null
  Duraci_n_del_evento?: number | string | null
  C_digo?: string | null
  Owner: ZohoOwner
  Fecha_de_petici_n?: string | null
  Precio_Total?: number | string | null
  Amount?: number | string | null
  Observacions?: string | null
  Description?: string | null

}

interface NormalizedDeal {
  idZoho: string
  NomEvent: string
  Stage: string
  LN: string
  Servei: string
  Comercial: string
  DataInici: string | null
  DataFi: string | null
  HoraInici?: string | null
  NumPax: number | string | null
  ObservacionsZoho?: string | null
  Ubicacio: string
  FincaId?: string
  FincaCode?: string
  FincaLN?: string
  UbicacioCode?: string | null

  Color: string
  StageDot: string
  StageGroup: string
  origen: string
  editable: boolean
  updatedAt: string
  collection: 'taronja' | 'taronja' | 'verd' | string
  DataPeticio?: string | null
  PreuMenu?: number | string | null
  Import?: number | string | null
}

function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
  const clean = {} as T
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      ;(clean as Record<string, unknown>)[key] = value
    }
  }
  return clean
}

// ─────────────────────────────
// HELPERS GLOBALS
// ─────────────────────────────

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const stripCode = (t: string) =>
  t.replace(/\s*\([^)]+\)\s*/g, '').trim()

const slugify = (t: string) =>
  unaccent(t)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const parseZohoDate = (raw?: string | null): string | null => {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null

  if (value.includes('T')) value = value.split('T')[0].trim()
  if (value.includes(' ')) value = value.split(' ')[0].trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return value.replace(/\//g, '-')

  const dmy = value.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/)
  if (dmy) {
    const [, day, month, year] = dmy
    return `${year}-${month}-${day}`
  }

  const ymd = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (ymd) {
    const [, year, monthRaw, dayRaw] = ymd
    const month = monthRaw.padStart(2, '0')
    const day = dayRaw.padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

const parseZohoTime = (raw?: string | null): string | null => {
  if (!raw) return null
  const value = String(raw)
  const timePart = value.split('T')[1] || value.split(' ')[1] || ''
  const match = timePart.match(/(\d{2}:\d{2})/)
  return match ? match[1] : null
}

const isBadCode = (code?: string | null) =>
  code === 'CCB00001' || code === 'CCE00004'

const extractCodeFromName = (raw: string): string | null => {
  const value = String(raw || '').trim()
  if (!value) return null

  const inParens = value.match(/\(([A-Z]{3}\d{3,})\)\s*$/i)
  if (inParens) return inParens[1].toUpperCase()

  const trailing = value.match(/\b([A-Z]{3}\d{3,})\b\s*$/i)
  return trailing ? trailing[1].toUpperCase() : null
}

const normalizeTextForMatch = (raw: string): string =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeLocationKey = (raw: string): string =>
  normalizeTextForMatch(stripCode(raw))
    .replace(/\b(empresa|empreses|casament|casaments|restaurant|restaurants|grup|grups)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeLocationCompactKey = (raw: string): string =>
  normalizeLocationKey(raw).replace(/\s+/g, '')

const normalizeLnBucket = (raw?: string | null): string => {
  const n = normalizeTextForMatch(raw || '')
  if (!n) return ''
  if (n.includes('casament')) return 'casaments'
  if (n.includes('empresa')) return 'empresa'
  if (n.includes('restaurant') || n.includes('grups restaurant')) return 'grups restaurants'
  return n
}

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const rows = b.length + 1
  const cols = a.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[b.length][a.length]
}

const nameSimilarity = (a: string, b: string): number => {
  const left = normalizeLocationKey(a)
  const right = normalizeLocationKey(b)
  if (!left || !right) return 0
  if (left === right) return 1
  const leftCompact = left.replace(/\s+/g, '')
  const rightCompact = right.replace(/\s+/g, '')
  if (leftCompact && leftCompact === rightCompact) return 1
  const maxLen = Math.max(left.length, right.length)
  if (maxLen === 0) return 1
  const dist = levenshteinDistance(left, right)
  const spacedScore = 1 - dist / maxLen
  const compactMaxLen = Math.max(leftCompact.length, rightCompact.length)
  const compactScore =
    compactMaxLen > 0
      ? 1 - levenshteinDistance(leftCompact, rightCompact) / compactMaxLen
      : 1
  return Math.max(spacedScore, compactScore)
}

const hasRestaurantKeyword = (raw: string): boolean => {
  const n = normalizeTextForMatch(raw)
  return (
    n.includes('restaurant') ||
    n.includes('restaurante') ||
    n.includes('restuarnat') ||
    n.includes('resautaurant')
  )
}

const CEU_BASE_FALLBACK = 172

const parseCeuNumber = (code?: string | null): number | null => {
  const value = String(code || '').trim().toUpperCase()
  const m = value.match(/^CEU(\d+)$/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

const parseCeuNumberStrict4 = (code?: string | null): number | null => {
  const value = String(code || '').trim().toUpperCase()
  const m = value.match(/^CEU(\d{4})$/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

const formatCeuCode = (num: number): string => `CEU${Math.max(0, num).toString().padStart(4, '0')}`

const normalizeSyncedCode = (code?: string | null): string | null => {
  const value = String(code || '').trim().toUpperCase()
  if (!value) return null
  const ceuNum = parseCeuNumber(value)
  if (ceuNum !== null) return formatCeuCode(ceuNum)
  return value
}

const normalizeIncomingZohoCode = (code?: string | null): string | null => {
  const value = String(code || '').trim().toUpperCase()
  if (!value) return null
  if (value.startsWith('CEU')) {
    // Des de Zoho només acceptem CEUXXXX (4 dígits exactes)
    return /^CEU\d{4}$/.test(value) ? value : null
  }
  return value
}

const nextCEUCode = (currentMaxNum: number | null): string =>
  formatCeuCode((currentMaxNum ?? CEU_BASE_FALLBACK) + 1)


// ─────────────────────────────
// SYNC PRINCIPAL
// ─────────────────────────────

export async function syncZohoDealsToFirestore(): Promise<{
  totalCount: number
  createdCount: number
  deletedCount: number
}> {
  console.info('🚀 Iniciant sincronització Zoho → Firestore')

  const todayISO = new Date().toISOString().slice(0, 10)
  const moduleName = process.env.ZOHO_CRM_MODULE || 'Deals'
  const fields =
  'id,Deal_Name,Stage,Servicio_texto,Men_texto,C_digo,N_mero_de_invitados,N_mero_de_personas_del_evento,Finca_2,Espai_2,Fecha_del_evento,Fecha_y_hora_del_evento,Duraci_n_del_evento,Owner,Fecha_de_petici_n,Precio_Total,Amount,Observacions,Description'


  // 1️⃣ Llegir oportunitats amb paginació
  const allDeals: ZohoDeal[] = []
  for (let page = 1; ; page++) {
    const res = await zohoFetch<{ data?: ZohoDeal[] }>(
      `/${moduleName}?fields=${fields}&page=${page}&per_page=200`
    )
    const data = res.data ?? []
    if (data.length === 0) break
    allDeals.push(...data)
  }

  console.info(`📦 Rebudes ${allDeals.length} oportunitats`)

  // 2️⃣ Filtrar només oportunitats amb data d’avui o futura
  const today = new Date().toISOString().slice(0, 10)
  const filteredDeals = allDeals.filter((d) => {
    const eventDate =
      parseZohoDate(d.Fecha_del_evento) ||
      parseZohoDate(d.Fecha_y_hora_del_evento)
    return !!eventDate && eventDate >= today
  })

  // 3️⃣ Funció per determinar LN segons propietari (Owner)
  const getLN = async (ownerId?: string): Promise<string> => {
    if (!ownerId) return 'Altres'
    // Micro delay per no saturar la API de Zoho
    await new Promise((r) => setTimeout(r, 100))
    try {
      const res = await zohoFetch<{ users: { role?: { name?: string } }[] }>(
        `/users/${ownerId}`
      )
      const role = res.users?.[0]?.role?.name?.toLowerCase() ?? ''

      if (role.includes('bodas')) return 'Casaments'
      if (role.includes('corporativo') || role.includes('empresa')) return 'Empresa'
      if (role.includes('comida preparada') || role.includes('preparada')) {
        // Correcte: Menjar Preparat (no Foodlovers)
        return 'Menjar Preparat'
      }
      return 'Agenda'
    } catch {
      return 'Agenda'
    }
  }

  // 3️⃣ bis – Index de finques per matching avançat (per bloc 5 i bloc 8)
  const finquesMatchSnap = await firestore.collection('finques').get()

  type FincaIndexEntry = {
    id: string
    code: string
    ln?: string
    nomKey?: string
  }

  const finquesByCode = new Map<string, FincaIndexEntry>()
  const finquesByName = new Map<string, FincaIndexEntry[]>()
  const finquesByCompactName = new Map<string, FincaIndexEntry[]>()
  const finquesList: FincaIndexEntry[] = []
  for (const doc of finquesMatchSnap.docs) {
    const d = doc.data() as {
      code?: string | number
      codi?: string | number
      nom?: string
      ln?: string
      LN?: string
    }
    const docIdCode = String(doc.id || '').trim().toUpperCase()
    const fallbackIdAsCode =
      /^(CCB|CCE|CCR|CCF|CEU)\d+$/i.test(docIdCode) ? docIdCode : ''
    const rawCode = (d.code || d.codi || fallbackIdAsCode || '').toString().trim().toUpperCase()
    const code = normalizeSyncedCode(rawCode) || rawCode
    const nom = (d.nom || '').toString()
    const nomKey = normalizeLocationKey(nom)
    const compactKey = normalizeLocationCompactKey(nom)
    if (!code) continue
    const entry: FincaIndexEntry = {
      id: doc.id,
      code,
      ln: (d.ln || d.LN || '') as string,
      nomKey,
    }
    finquesList.push(entry)
    finquesByCode.set(code, entry)
    if (rawCode && rawCode !== code) {
      finquesByCode.set(rawCode, entry)
    }
    if (nomKey) {
      const prev = finquesByName.get(nomKey) || []
      prev.push(entry)
      finquesByName.set(nomKey, prev)
    }
    if (compactKey) {
      const prevCompact = finquesByCompactName.get(compactKey) || []
      prevCompact.push(entry)
      finquesByCompactName.set(compactKey, prevCompact)
    }
  }

  const pickBestByLn = (items: FincaIndexEntry[], lnHint?: string): FincaIndexEntry | null => {
    if (!items.length) return null
    const lnBucket = normalizeLnBucket(lnHint)
    if (!lnBucket) return items[0]
    const sameLn = items.find((item) => normalizeLnBucket(item.ln) === lnBucket)
    return sameLn || items[0]
  }

  const fuzzyCache = new Map<string, FincaIndexEntry | null>()

  function findFincaForUbicacio(
    ubicacions: (string | null | undefined)[],
    lnHint?: string
  ): FincaIndexEntry | null {
    const candidates = ubicacions
      .filter(Boolean)
      .map((u) => u!.toString().trim())
      .filter(Boolean)

    if (candidates.length === 0) return null

    for (const raw of candidates) {
      const code = normalizeIncomingZohoCode(extractCodeFromName(raw))
      if (code && !isBadCode(code)) {
        const fincaByCode = finquesByCode.get(code)
        if (fincaByCode) return fincaByCode
      }

      // Si no troba per codi, provar també per nom.
      const nameKey = normalizeLocationKey(raw)
      const compactKey = normalizeLocationCompactKey(raw)
      if (!nameKey) continue
      const byName = finquesByName.get(nameKey)
      const exactMatch = byName ? pickBestByLn(byName, lnHint) : null
      if (exactMatch) return exactMatch
      const byCompact = compactKey ? finquesByCompactName.get(compactKey) : null
      const compactMatch = byCompact ? pickBestByLn(byCompact, lnHint) : null
      if (compactMatch) return compactMatch

      const lnBucket = normalizeLnBucket(lnHint)
      const cacheKey = `${nameKey}::${lnBucket}`
      if (fuzzyCache.has(cacheKey)) {
        const cached = fuzzyCache.get(cacheKey)
        if (cached) return cached
        continue
      }

      let best: FincaIndexEntry | null = null
      let bestScore = 0
      let bestLnMatch = false

      for (const finca of finquesList) {
        const fincaKey = finca.nomKey || ''
        if (!fincaKey) continue
        const score = nameSimilarity(nameKey, fincaKey)
        if (score < 0.9) continue

        const lnMatch =
          !!lnBucket && normalizeLnBucket(finca.ln) === lnBucket

        if (
          score > bestScore ||
          (score === bestScore && lnMatch && !bestLnMatch)
        ) {
          best = finca
          bestScore = score
          bestLnMatch = lnMatch
        }
      }

      fuzzyCache.set(cacheKey, best)
      if (best) return best
    }

    return null
  }

  // 4️⃣ Classifica etapes (Stage)
  const classifyStage = (stage: string): 'groc' | 'taronja' | 'verd' | null => {
    const s = stage.toLowerCase()
    if (s.includes('calentet')) return 'taronja'
    if (s.includes('pagament') || s.includes('cerrada ganada') || s.includes('rq'))
      return 'verd'
    if (
  s.includes('pendent') ||
  s.includes('prereserva') ||
  s.includes('proposta') ||
  s.includes('propuesta') ||
  s.includes('pressupost enviat')
) return 'groc'

    return null
  }

  // 5️⃣ Normalitzar oportunitats → NormalizedDeal
  const normalized: NormalizedDeal[] = []

  for (const d of filteredDeals) {
    const group = classifyStage(d.Stage)
    if (!group) continue

    // Data inici / fi i hora
    const dateISO =
      parseZohoDate(d.Fecha_del_evento) ||
      parseZohoDate(d.Fecha_y_hora_del_evento)
    const hora = parseZohoTime(d.Fecha_y_hora_del_evento)

    let dataFiISO = dateISO
    const duracio = Number(d.Duraci_n_del_evento ?? 1)
    if (dateISO && !isNaN(duracio) && duracio > 1) {
      const fi = new Date(dateISO)
      fi.setDate(fi.getDate() + (duracio - 1))
      dataFiISO = fi.toISOString().slice(0, 10)
    }

    // LN base segons comercial (Owner)
    let LN = await getLN(d.Owner?.id)

    // Ubicacions que venen de Zoho
    const ubicacions = [...(d.Espai_2 || []), ...(d.Finca_2 || [])]

    // Ubicació que es guarda a les col·leccions stage_*
   const ubicacioRaw =
  d.Finca_2?.[0] ||
  d.Espai_2?.[0] ||
  ''

const ubicacioLabel = stripCode(ubicacioRaw).trim()
    const ubicacioCodeRaw = normalizeIncomingZohoCode(extractCodeFromName(ubicacioRaw))
    const ubicacioCode =
      ubicacioCodeRaw && !isBadCode(ubicacioCodeRaw) ? ubicacioCodeRaw : null
    const forceGrupsRestaurants =
      (ubicacioCode || '').startsWith('CCR') ||
      ubicacions.some((u) => hasRestaurantKeyword(String(u || ''))) ||
      hasRestaurantKeyword(ubicacioRaw)

    if (forceGrupsRestaurants) {
      LN = 'Grups Restaurants'
    }


    // Matching de finca només per codi
    const fincaMatch = findFincaForUbicacio(ubicacions, LN)
    const fincaId = fincaMatch?.id
    const fincaCode = fincaMatch?.code
    const fincaLN = fincaMatch?.ln

    normalized.push({
      idZoho: String(d.id),
      NomEvent: d.Deal_Name || 'Sense nom',
      Stage: d.Stage,
      LN,
      Servei: d.Servicio_texto || d.Men_texto || '',
      Comercial: d.Owner?.name || '—',
      DataInici: dateISO,
      DataFi: dataFiISO,
      ObservacionsZoho: d.Description || d.Observacions || null,
      HoraInici: hora,
      NumPax:
        d.N_mero_de_invitados ||
        d.N_mero_de_personas_del_evento ||
        null,

      Ubicacio: ubicacioLabel,
      FincaId: fincaId,
      FincaCode: fincaCode,
      FincaLN: forceGrupsRestaurants ? 'Grups Restaurants' : (fincaLN || LN),
      UbicacioCode: ubicacioCode,

Color:
  group === 'taronja'
    ? 'border-orange-300 bg-orange-50 text-orange-800' // 🟠 
    : group === 'groc'
    ? 'border-yellow-300 bg-yellow-50 text-yellow-800' // 🟡
    : 'border-green-300 bg-green-50 text-green-800',   // 🟢 

StageDot:
  group === 'taronja'
    ? 'bg-orange-400'   // 🟠
    : group === 'groc'
    ? 'bg-yellow-400'   // 🟡
    : 'bg-green-500',   // 🟢

StageGroup:
  group === 'taronja'
    ? 'Prereserva / Calentet'
    : group === 'groc'
    ? 'Pressupost / Proposta / Pendent'
    : 'Confirmat',

      origen: 'zoho',
      editable: group === 'verd',
      updatedAt: new Date().toISOString(),
      collection: group,
      DataPeticio: d.Fecha_de_petici_n || null,
      PreuMenu: d.Precio_Total || null,
      Import: d.Amount || null,
    })
  }

  console.info(`✅ Oportunitats vàlides: ${normalized.length}`)

  const zohoById = new Map<string, ZohoDeal>()
  for (const d of allDeals) {
    if (d?.id) zohoById.set(String(d.id), d)
  }

  // 6️⃣ Esborrar antics (només taronja i groc per DataInici < avui)
  let deleted = 0
  for (const col of ['stage_taronja', 'stage_groc']) {
    const snap = await firestore.collection(col).get()
    const dels = snap.docs
      .filter((d) => (d.data().DataInici || '') < todayISO)
      .map((d) => d.ref.delete())
    deleted += dels.length
    await Promise.all(dels)
  }

  // ─────────────────────────────────────────────
  // 7️⃣ Escriure STAGE (verd/groc/taronja) respectant la prioritat
  // ─────────────────────────────────────────────

  const idsVerd = new Set<string>()
  const idsGroc = new Set<string>()
  const idstaronja = new Set<string>()

  for (const deal of normalized) {
    if (deal.collection === 'verd') idsVerd.add(deal.idZoho)
    else if (deal.collection === 'groc') idsGroc.add(deal.idZoho)
    else if (deal.collection === 'taronja') idstaronja.add(deal.idZoho)
  }

  // 7.1 — Escriure/actualitzar stage_verd (no s’esborren antics)
  const batchVerd = firestore.batch()

  for (const deal of normalized) {
    if (deal.collection !== 'verd') continue
    const ref = firestore.collection('stage_verd').doc(deal.idZoho)
    const dataToSave = cleanUndefined(deal)
    batchVerd.set(ref, dataToSave, { merge: true })
  }

  await batchVerd.commit()
  console.info(`🟢 stage_verd actualitzat: ${idsVerd.size} deals`)

  // 7.2 — Escriure groc/taronja només si no són verds
  const batchOthers = firestore.batch()

  for (const deal of normalized) {
    const id = deal.idZoho
    if (idsVerd.has(id)) continue

    const dataToSave = cleanUndefined(deal)

    if (deal.collection === 'groc') {
      const ref = firestore.collection('stage_groc').doc(id)
      batchOthers.set(ref, dataToSave, { merge: true })
    }

    if (deal.collection === 'taronja') {
      const ref = firestore.collection('stage_taronja').doc(id)
      batchOthers.set(ref, dataToSave, { merge: true })
    }
  }

  await batchOthers.commit()
  console.info('🟠🔵 Groc/taronja escrits respectant la prioritat de verd')

  // 7.3 — Neteja: només groc i taronja (mai verd)
  const colNeteja = [
    { name: 'stage_groc', idsActuals: idsGroc },
    { name: 'stage_taronja', idsActuals: idstaronja },
  ]

  for (const { name, idsActuals } of colNeteja) {
    const snap = await firestore.collection(name).get()

    for (const doc of snap.docs) {
      const id = doc.id

      // Si ara és verd → treure de groc/taronja
      if (idsVerd.has(id)) {
        await doc.ref.delete()
        console.log(`🧹 Eliminat de ${name} (ara és verd): ${id}`)
        continue
      }

      // Si ja no existeix a aquest estat a Zoho → eliminar
      if (!idsActuals.has(id)) {
        await doc.ref.delete()
        console.log(`🧹 Eliminat de ${name} (ja no és ${name} a Zoho): ${id}`)
      }
    }
  }

  console.info('✨ Neteja final de stage_groc i stage_taronja completada')

  // 7.4 — Neteja stage_verd: només si Zoho indica que ja no és verd (origen zoho)
  const verdSnap = await firestore.collection('stage_verd').get()
  for (const doc of verdSnap.docs) {
    const id = doc.id
    const data = doc.data() as { origen?: string }
    if (data?.origen !== 'zoho') continue

    const zoho = zohoById.get(id)
    if (!zoho) continue

    const group = classifyStage(zoho.Stage || '')
    if (group !== 'verd') {
      await doc.ref.delete()
      const reason = group === 'groc' ? 'ara és groc' : group === 'taronja' ? 'ara és taronja' : 'ja no és verd'
      console.log(`🧹 Eliminat de stage_verd (${reason}): ${id}`)
    }
  }

  // ─────────────────────────────────────────────
  // 8️⃣ Actualitzar col·lecció FINQUES (matching avançat)
  // ─────────────────────────────────────────────

  try {
    const finquesSnap = await firestore.collection('finques').get()

    const existingCodes = new Set<string>()
    const createdNoCodeNames = new Set<string>()
    let maxCEUNum: number | null = null

    for (const doc of finquesSnap.docs) {
      const d = doc.data()
      const rawCode = (d.code || '').toString().trim().toUpperCase()
      const code = normalizeSyncedCode(rawCode) || rawCode

      if (code) existingCodes.add(code)
      if (rawCode) existingCodes.add(rawCode)

      const ceuNum = parseCeuNumberStrict4(code)
      if (ceuNum !== null && (maxCEUNum === null || ceuNum > maxCEUNum)) {
        maxCEUNum = ceuNum
      }
    }

    const batchFinques = firestore.batch()
    let created = 0

    for (const deal of normalized) {
      const rawNom = deal.Ubicacio || ''
      if (!rawNom) continue

      const nomNetZoho = normalizeLocationKey(rawNom)
      let code = normalizeIncomingZohoCode(deal.FincaCode || deal.UbicacioCode) || null

      if (isBadCode(code)) {
        code = null
      }

      if (code && existingCodes.has(code)) {
        // Codi existent: reutilitzem registre actual
        continue
      }

      if (!code) {
        if (!nomNetZoho || createdNoCodeNames.has(nomNetZoho)) continue
        createdNoCodeNames.add(nomNetZoho)
      }

      // Si no tenim codi → generar CEU
      if (!code) {
        const next = nextCEUCode(maxCEUNum)
        code = next
        maxCEUNum = parseCeuNumber(next)
      }

      code = normalizeSyncedCode(code) || code

      if (existingCodes.has(code)) continue

      // LN amb prioritat absoluta per restaurants (codi CCR o paraula restaurant)
      const forceGrupsRestaurants =
        code.startsWith('CCR') || hasRestaurantKeyword(rawNom)

      let LN = ''
      if (forceGrupsRestaurants) LN = 'Grups Restaurants'
      else if (code.startsWith('CCB')) LN = 'Casaments'
      else if (code.startsWith('CCE')) LN = 'Empreses'
      else if (code.startsWith('CCF')) LN = 'Foodlovers'
      else if (code.startsWith('CEU')) LN = deal.LN

      const ref = firestore.collection('finques').doc(code)

      batchFinques.set(ref, {
        code,
        nom: stripCode(rawNom).trim(),
        nomNet: nomNetZoho,
        LN,
        searchable: `${rawNom} ${code}`.toLowerCase(),
        origen: 'zoho',
        updatedAt: new Date().toISOString(),
      })

      existingCodes.add(code)
      created++
    }

    if (created > 0) {
      await batchFinques.commit()
      console.info(`🏡 Finques: afegides ${created} noves (sense duplicats).`)
    } else {
      console.info('🏡 Finques: cap alta nova (matching correcte).')
    }
  } catch (err) {
    console.error('⚠️ Error actualitzant finques:', err)
  }

  // ─────────────────────────────────────────────
  // 9️⃣ Actualitzar col·lecció SERVEIS
  // ─────────────────────────────────────────────

  try {
    const serveisRaw = new Set<string>()
    for (const d of allDeals) {
      const nom = (d.Servicio_texto || d.Men_texto || '').trim()
      if (nom) serveisRaw.add(nom)
    }

    const existSnap = await firestore.collection('serveis').get()
    const existing = new Set<string>()
    existSnap.docs.forEach((doc) => {
      const n = (doc.data().nom as string) || ''
      existing.add(slugify(n))
    })

    const batchServeis = firestore.batch()
    let created = 0

    for (const nomRaw of Array.from(serveisRaw)) {
      const norm = slugify(nomRaw)
      if (!norm || existing.has(norm)) continue
      const ref = firestore.collection('serveis').doc(norm)
      batchServeis.set(ref, {
        nom: nomRaw,
        codi: norm,
        searchable: `${nomRaw} ${norm}`.toLowerCase(),
        updatedAt: new Date().toISOString(),
        origen: 'zoho',
      })
      created++
    }

    if (created > 0) {
      await batchServeis.commit()
      console.info(`🧾 Serveis: afegits ${created} nous (sense esborrar).`)
    } else {
      console.info('🧾 Serveis: cap alta nova.')
    }
  } catch (err) {
    console.error('⚠️ Error actualitzant serveis:', err)
  }

  console.info('🔥 Firestore sincronitzat correctament')
  return {
    totalCount: allDeals.length,
    createdCount: normalized.length,
    deletedCount: deleted,
  }
}
