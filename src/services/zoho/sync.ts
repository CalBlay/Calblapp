// file: src/services/zoho/sync.ts
import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import {
  SPACES_MANUAL_RESERVES_COLLECTION,
} from '@/lib/spacesPermissions'
import { syncZohoAccountsFromDeals } from '@/services/spaces/zohoClients'
import {
  applyManualCreatedAtPreserve,
  resolveManualReserveReplacements,
  stripInvalidManualMerge,
  type ManualReserveDoc,
} from '@/services/spaces/manualReserveZohoMatch'
import { zohoFetch } from '@/services/zoho/auth'
import { buildZohoAttachmentFields } from '@/services/zoho/sync-attachments'
import {
  buildFincaMatcher,
  hasRestaurantKeyword,
} from '@/services/zoho/sync-finca-matching'
import { syncFinquesFromDeals } from '@/services/zoho/sync-finques'
import { classifyStage, normalizeZohoDeals } from '@/services/zoho/sync-normalization'
import { syncServeisFromDeals } from '@/services/zoho/sync-serveis'
import {
  cleanUndefined,
  type NormalizedDeal,
  type ZohoDeal,
  type ZohoNamedValue,
} from '@/services/zoho/sync-types'
const LOCAL_CALENDAR_FIELDS = new Set([
  'LN',
  'code',
  'NomEvent',
  'DataInici',
  'DataFi',
  'HoraInici',
  'HoraFi',
  'NumPax',
  'Ubicacio',
  'Servei',
  'Comercial',
])

function preserveLocalCalendarChanges(
  incoming: Record<string, unknown>,
  existing?: FirebaseFirestore.DocumentData
): Record<string, unknown> {
  if (!existing) return incoming

  const out: Record<string, unknown> = { ...incoming }
  const manualOverrides =
    existing.manualOverrides && typeof existing.manualOverrides === 'object'
      ? (existing.manualOverrides as Record<string, unknown>)
      : {}

  for (const field of LOCAL_CALENDAR_FIELDS) {
    if (manualOverrides[field] === true && existing[field] !== undefined) {
      out[field] = existing[field]
    }
  }

  for (const [key, value] of Object.entries(existing)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('file') && typeof value === 'string' && value.trim()) {
      out[key] = value
    }
  }

  for (const field of [
    'code',
    'codeSource',
    'codeConfirmed',
    'manualOverrides',
    'manualUpdatedAt',
  ]) {
    if (existing[field] !== undefined && out[field] === undefined) {
      out[field] = existing[field]
    }
  }

  // Regla de negoci: Marta Granato â†’ Grups Restaurants (sempre, tambÃ© si LN estava desada abans)
  const commercial = String(out.Comercial ?? existing.Comercial ?? '')
  if (isMartaGranatoCommercial(commercial)) {
    out.LN = 'Grups Restaurants'
    if (out.FincaLN !== undefined || existing.FincaLN !== undefined) {
      out.FincaLN = 'Grups Restaurants'
    }
  }

  return out
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HELPERS GLOBALS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
const normalizeCommercialName = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()

/** Marta Granato â†’ LN Grups Restaurants (Owner / Comercial). */
const isMartaGranatoCommercial = (value?: string | null): boolean => {
  const n = normalizeCommercialName(value)
  if (!n || n === 'â€”') return false
  if (n === 'marta granato') return true
  return n.includes('marta') && n.includes('granato')
}

const lnForMartaGranatoCommercial = (
  ln: string,
  commercial?: string | null
): string => (isMartaGranatoCommercial(commercial) ? 'Grups Restaurants' : ln)

const fincaLnForDeal = (
  ln: string,
  commercial: string | null | undefined,
  forceGrupsRestaurants: boolean,
  fincaLN?: string
): string => {
  if (forceGrupsRestaurants || isMartaGranatoCommercial(commercial)) {
    return 'Grups Restaurants'
  }
  return fincaLN || ln
}

/** Si el Responsable operatiu Ã©s un camp API diferent del `Responsable` principal, definir-lo al `.env`. */
const ZOHO_EXTRA_RESPONSABLE_FIELD = String(
  process.env.ZOHO_DEAL_FIELD_RESPONSABLE_OPERATIU || ''
).trim()

const extractZohoDisplayName = (
  value?: string | ZohoNamedValue | Array<string | ZohoNamedValue> | null
): string | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractZohoDisplayName(item)
      if (extracted) return extracted
    }
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (value && typeof value === 'object') {
    const trimmed = String(value.name || '').trim()
    return trimmed || null
  }

  return null
}

function operativeResponsableFromZohoDeal(
  d: ZohoDeal & Record<string, unknown>
): string {
  const primary = extractZohoDisplayName(d.Responsable)
  if (primary) return primary
  if (ZOHO_EXTRA_RESPONSABLE_FIELD) {
    const raw = d[ZOHO_EXTRA_RESPONSABLE_FIELD]
    return (
      extractZohoDisplayName(
        raw as
          | string
          | ZohoNamedValue
          | Array<string | ZohoNamedValue>
          | null
      ) || ''
    )
  }
  return ''
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

const parseCeuNumber = (code?: string | null): number | null => {
  const value = String(code || '').trim().toUpperCase()
  const m = value.match(/^CEU(\d+)$/)
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
    // Des de Zoho nomÃ©s acceptem CEUXXXX (4 dÃ­gits exactes)
    return /^CEU\d{4}$/.test(value) ? value : null
  }
  return value
}

async function cleanupGrocTaronjaStageDocs(
  idsVerd: Set<string>,
  idsGroc: Set<string>,
  idsTaronja: Set<string>,
  existingDocs?: {
    groc?: StageSnapshotMap
    taronja?: StageSnapshotMap
  }
): Promise<void> {
  const colNeteja = [
    {
      name: 'stage_groc',
      idsActuals: idsGroc,
      docs: existingDocs?.groc ? Array.from(existingDocs.groc.values()) : null,
    },
    {
      name: 'stage_taronja',
      idsActuals: idsTaronja,
      docs: existingDocs?.taronja ? Array.from(existingDocs.taronja.values()) : null,
    },
  ] as const

  for (const { name, idsActuals, docs } of colNeteja) {
    const stageDocs = docs ?? (await firestore.collection(name).get()).docs
    let batch = firestore.batch()
    let pendingWrites = 0

    const flush = async () => {
      if (pendingWrites === 0) return
      await batch.commit()
      batch = firestore.batch()
      pendingWrites = 0
    }

    for (const doc of stageDocs) {
      const id = doc.id

      if (idsVerd.has(id)) {
        batch.delete(doc.ref)
        pendingWrites += 1
        console.log(`ðŸ§¹ Eliminat de ${name} (ara Ã©s verd): ${id}`)
      } else if (!idsActuals.has(id)) {
        batch.delete(doc.ref)
        pendingWrites += 1
        console.log(`ðŸ§¹ Eliminat de ${name} (ja no Ã©s ${name} a Zoho): ${id}`)
      }

      if (pendingWrites >= MAX_BATCH_WRITES) {
        await flush()
      }
    }

    await flush()
  }

  console.info('âœ¨ Neteja stage_groc i stage_taronja completada')
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SYNC PRINCIPAL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SyncZohoDealsOptions = {
  includeAttachments?: boolean
}

const EMPTY_ATTACHMENT_SYNC_RESULT = {
  fields: {} as Record<string, unknown>,
  stats: {
    checked: 0,
    downloaded: 0,
    reused: 0,
    deletedFromStorage: 0,
  },
}

type AttachmentSyncTotals = {
  attachmentsChecked: number
  attachmentsDownloaded: number
  attachmentsReused: number
  attachmentsDeletedFromStorage: number
}

const MAX_BATCH_WRITES = 450

type StageSnapshotMap = Map<string, FirebaseFirestore.QueryDocumentSnapshot>

type ManualReplacementMap = Map<
  string,
  { createdAt: string; mergedFromManualId: string }
>

async function readStageDocs(collection: string): Promise<StageSnapshotMap> {
  const snap = await firestore.collection(collection).get()
  return new Map(snap.docs.map((doc) => [doc.id, doc]))
}

function addAttachmentStats(
  totals: AttachmentSyncTotals,
  stats: typeof EMPTY_ATTACHMENT_SYNC_RESULT.stats
) {
  totals.attachmentsChecked += stats.checked
  totals.attachmentsDownloaded += stats.downloaded
  totals.attachmentsReused += stats.reused
  totals.attachmentsDeletedFromStorage += stats.deletedFromStorage
}

async function buildStageDataToSave({
  deal,
  existingDoc,
  includeAttachments,
  moduleName,
  zohoById,
  manualReplacements,
  manuals,
  totals,
}: {
  deal: NormalizedDeal
  existingDoc?: FirebaseFirestore.DocumentData
  includeAttachments: boolean
  moduleName: string
  zohoById: Map<string, ZohoDeal>
  manualReplacements: ManualReplacementMap
  manuals: ManualReserveDoc[]
  totals: AttachmentSyncTotals
}) {
  const zohoAttachments = includeAttachments
    ? await buildZohoAttachmentFields(
        moduleName,
        deal.idZoho,
        zohoById.get(deal.idZoho),
        existingDoc
      )
    : EMPTY_ATTACHMENT_SYNC_RESULT

  addAttachmentStats(totals, zohoAttachments.stats)

  return applyManualCreatedAtPreserve(
    {
      ...preserveLocalCalendarChanges(cleanUndefined(deal), existingDoc),
      ...zohoAttachments.fields,
    },
    deal.idZoho,
    manualReplacements,
    stripInvalidManualMerge(
      existingDoc,
      {
        idZoho: deal.idZoho,
        Comercial: deal.Comercial,
        NomEvent: deal.NomEvent,
        NomClient: deal.NomClient,
        Ubicacio: deal.Ubicacio,
        DataInici: deal.DataInici,
      },
      manuals
    )
  )
}

async function syncStageCollections({
  normalized,
  zohoById,
  includeAttachments,
  moduleName,
  manualReplacements,
  manuals,
  totals,
  classifyStage,
}: {
  normalized: NormalizedDeal[]
  zohoById: Map<string, ZohoDeal>
  includeAttachments: boolean
  moduleName: string
  manualReplacements: ManualReplacementMap
  manuals: ManualReserveDoc[]
  totals: AttachmentSyncTotals
  classifyStage: (stage: string) => 'groc' | 'taronja' | 'verd' | null
}) {
  const idsVerd = new Set<string>()
  const idsGroc = new Set<string>()
  const idsTaronja = new Set<string>()

  for (const deal of normalized) {
    if (deal.collection === 'verd') idsVerd.add(deal.idZoho)
    else if (deal.collection === 'groc') idsGroc.add(deal.idZoho)
    else if (deal.collection === 'taronja') idsTaronja.add(deal.idZoho)
  }

  const existingVerd = await readStageDocs('stage_verd')
  const existingGroc = await readStageDocs('stage_groc')
  const existingTaronja = await readStageDocs('stage_taronja')

  const getExistingStageDoc = (id: string) =>
    existingVerd.get(id)?.data() ||
    existingGroc.get(id)?.data() ||
    existingTaronja.get(id)?.data()

  let batchVerd = firestore.batch()
  let batchVerdCount = 0

  const flushVerd = async () => {
    if (batchVerdCount === 0) return
    await batchVerd.commit()
    batchVerd = firestore.batch()
    batchVerdCount = 0
  }

  for (const deal of normalized) {
    if (deal.collection !== 'verd') continue
    const ref = firestore.collection('stage_verd').doc(deal.idZoho)
    const existingDoc = getExistingStageDoc(deal.idZoho)
    const dataToSave = await buildStageDataToSave({
      deal,
      existingDoc,
      includeAttachments,
      moduleName,
      zohoById,
      manualReplacements,
      manuals,
      totals,
    })
    batchVerd.set(ref, dataToSave, { merge: true })
    batchVerdCount += 1
    if (batchVerdCount >= MAX_BATCH_WRITES) {
      await flushVerd()
    }
  }

  await flushVerd()
  console.info(`stage_verd actualitzat: ${idsVerd.size} deals`)

  let batchOthers = firestore.batch()
  let batchOthersCount = 0

  const flushOthers = async () => {
    if (batchOthersCount === 0) return
    await batchOthers.commit()
    batchOthers = firestore.batch()
    batchOthersCount = 0
  }

  for (const deal of normalized) {
    const id = deal.idZoho
    if (idsVerd.has(id)) continue

    const existingDoc = getExistingStageDoc(id)
    const dataToSave = await buildStageDataToSave({
      deal,
      existingDoc,
      includeAttachments,
      moduleName,
      zohoById,
      manualReplacements,
      manuals,
      totals,
    })

    if (deal.collection === 'groc') {
      const ref = firestore.collection('stage_groc').doc(id)
      batchOthers.set(ref, dataToSave, { merge: true })
      batchOthersCount += 1
    }

    if (deal.collection === 'taronja') {
      const ref = firestore.collection('stage_taronja').doc(id)
      batchOthers.set(ref, dataToSave, { merge: true })
      batchOthersCount += 1
    }

    if (batchOthersCount >= MAX_BATCH_WRITES) {
      await flushOthers()
    }
  }

  if (batchOthersCount > 0) {
    await flushOthers()
    console.info('Groc/taronja escrits respectant la prioritat de verd')
  } else {
    console.info('Cap actualitzacio groc/taronja en aquest sync')
  }

  await cleanupGrocTaronjaStageDocs(idsVerd, idsGroc, idsTaronja, {
    groc: existingGroc,
    taronja: existingTaronja,
  })

  let verdCleanupBatch = firestore.batch()
  let verdCleanupCount = 0
  const flushVerdCleanup = async () => {
    if (verdCleanupCount === 0) return
    await verdCleanupBatch.commit()
    verdCleanupBatch = firestore.batch()
    verdCleanupCount = 0
  }

  for (const doc of existingVerd.values()) {
    const id = doc.id
    const data = doc.data() as { origen?: string }
    if (data?.origen !== 'zoho') continue

    const zoho = zohoById.get(id)
    if (!zoho) continue

    const group = classifyStage(zoho.Stage || '')
    if (group !== 'verd') {
      verdCleanupBatch.delete(doc.ref)
      verdCleanupCount += 1
      const reason =
        group === 'groc'
          ? 'ara es groc'
          : group === 'taronja'
            ? 'ara es taronja'
            : 'ja no es verd'
      console.log(`Eliminat de stage_verd (${reason}): ${id}`)
      if (verdCleanupCount >= MAX_BATCH_WRITES) {
        await flushVerdCleanup()
      }
    }
  }

  await flushVerdCleanup()
}

export async function syncZohoDealsToFirestore(options: SyncZohoDealsOptions = {}): Promise<{
  totalCount: number
  createdCount: number
  deletedCount: number
  manualReplacedCount: number
  attachmentsChecked: number
  attachmentsDownloaded: number
  attachmentsReused: number
  attachmentsDeletedFromStorage: number
}> {
  console.info('ðŸš€ Iniciant sincronitzaciÃ³ Zoho â†’ Firestore')
  const includeAttachments = options.includeAttachments === true

  const todayISO = new Date().toISOString().slice(0, 10)
  const moduleName = process.env.ZOHO_CRM_MODULE || 'Deals'
  const attachmentTotals: AttachmentSyncTotals = {
    attachmentsChecked: 0,
    attachmentsDownloaded: 0,
    attachmentsReused: 0,
    attachmentsDeletedFromStorage: 0,
  }
  const baseFields =
    'id,Deal_Name,Account_Name,Stage,Servicio_texto,Men_texto,C_digo,N_mero_de_invitados,N_mero_de_personas_del_evento,Finca_2,Espai_2,Fecha_del_evento,Fecha_y_hora_del_evento,Duraci_n_del_evento,Owner,Responsable,Comercial_Interna,Fecha_de_petici_n,Precio_Total,Amount,Observacions,Description,Fulla_d_enc_rrec,Full_de_Tast'
  const fields = ZOHO_EXTRA_RESPONSABLE_FIELD
    ? `${baseFields},${ZOHO_EXTRA_RESPONSABLE_FIELD}`
    : baseFields


  // 1ï¸âƒ£ Llegir oportunitats amb paginaciÃ³
  const allDeals: ZohoDeal[] = []
  for (let page = 1; ; page++) {
    const res = await zohoFetch<{ data?: ZohoDeal[] }>(
      `/${moduleName}?fields=${fields}&page=${page}&per_page=200`
    )
    const data = res.data ?? []
    if (data.length === 0) break
    allDeals.push(...data)
  }

  console.info(`ðŸ“¦ Rebudes ${allDeals.length} oportunitats`)

  // 2ï¸âƒ£ Filtrar nomÃ©s oportunitats amb data dâ€™avui o futura
  const today = new Date().toISOString().slice(0, 10)
  const filteredDeals = allDeals.filter((d) => {
    const eventDate =
      parseZohoDate(d.Fecha_del_evento) ||
      parseZohoDate(d.Fecha_y_hora_del_evento)
    return !!eventDate && eventDate >= today
  })

  // 3ï¸âƒ£ FunciÃ³ per determinar LN segons propietari (Owner)
  const ownerLnCache = new Map<string, Promise<string>>()
  const getLN = (ownerId?: string): Promise<string> => {
    if (!ownerId) return Promise.resolve('Altres')

    const cached = ownerLnCache.get(ownerId)
    if (cached) return cached

    const pending = (async () => {
      try {
        const res = await zohoFetch<{ users: { role?: { name?: string } }[] }>(
          `/users/${ownerId}`
        )
        const role = res.users?.[0]?.role?.name?.toLowerCase() ?? ''

        if (role.includes('bodas')) return 'Casaments'
        if (role.includes('corporativo') || role.includes('empresa')) return 'Empresa'
        if (role.includes('comida preparada') || role.includes('preparada')) {
          return 'Menjar Preparat'
        }
        return 'Agenda'
      } catch {
        return 'Agenda'
      }
    })()

    ownerLnCache.set(ownerId, pending)
    return pending
  }

  // 3ï¸âƒ£ bis â€“ Index de finques per matching avanÃ§at (per bloc 5 i bloc 8)
  const finquesMatchSnap = await firestore.collection('finques').get()

  const findFincaForUbicacio = buildFincaMatcher({
    docs: finquesMatchSnap.docs,
    normalizeSyncedCode,
    normalizeIncomingZohoCode,
    extractCodeFromName,
    isBadCode,
  })

  const normalized = await normalizeZohoDeals(filteredDeals, {
    parseZohoDate,
    parseZohoTime,
    getLN,
    lnForMartaGranatoCommercial,
    stripCode,
    normalizeIncomingZohoCode,
    extractCodeFromName,
    isBadCode,
    hasRestaurantKeyword,
    findFincaForUbicacio,
    extractZohoDisplayName,
    operativeResponsableFromZohoDeal,
    fincaLnForDeal,
  })

  console.info(`âœ… Oportunitats vÃ lides: ${normalized.length}`)

  let manualReplacedCount = 0
  let manualReplacements = new Map<
    string,
    { createdAt: string; mergedFromManualId: string }
  >()
  let manualIdsToDeleteAfterStageWrite: string[] = []
  let manuals: ManualReserveDoc[] = []

  try {
    const manualSnap = await firestore
      .collection(SPACES_MANUAL_RESERVES_COLLECTION)
      .get()
    manuals = manualSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ManualReserveDoc, 'id'>),
    }))
    const replacementResult = resolveManualReserveReplacements(
      manuals,
      normalized.map((deal) => ({
        idZoho: deal.idZoho,
        Comercial: deal.Comercial,
        NomEvent: deal.NomEvent,
        NomClient: deal.NomClient,
        Ubicacio: deal.Ubicacio,
        DataInici: deal.DataInici,
      }))
    )
    manualReplacements = replacementResult.byZohoId
    manualReplacedCount = replacementResult.replacedCount
    manualIdsToDeleteAfterStageWrite = replacementResult.manualIdsToDelete
  } catch (manualErr) {
    console.error(
      'âš ï¸ Error reconciliant reserves manuals amb Zoho (sync continua):',
      manualErr
    )
  }

  const zohoById = new Map<string, ZohoDeal>()
  for (const d of allDeals) {
    if (d?.id) zohoById.set(String(d.id), d)
  }

  // 6ï¸âƒ£ Esborrar antics (nomÃ©s taronja i groc per DataInici < avui)
  let deleted = 0
  for (const col of ['stage_taronja', 'stage_groc']) {
    const snap = await firestore.collection(col).get()
    let deleteBatch = firestore.batch()
    let deleteBatchCount = 0

    const flushDeleteBatch = async () => {
      if (deleteBatchCount === 0) return
      await deleteBatch.commit()
      deleteBatch = firestore.batch()
      deleteBatchCount = 0
    }

    for (const doc of snap.docs) {
      if ((doc.data().DataInici || '') >= todayISO) continue
      deleteBatch.delete(doc.ref)
      deleteBatchCount += 1
      deleted += 1

      if (deleteBatchCount >= MAX_BATCH_WRITES) {
        await flushDeleteBatch()
      }
    }

    await flushDeleteBatch()
  }

  await syncStageCollections({
    normalized,
    zohoById,
    includeAttachments,
    moduleName,
    manualReplacements,
    manuals,
    totals: attachmentTotals,
    classifyStage,
  })

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 8ï¸âƒ£ Actualitzar colÂ·lecciÃ³ FINQUES (matching avanÃ§at)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  try {
    const created = await syncFinquesFromDeals({
      deals: normalized,
      normalizeSyncedCode,
      normalizeIncomingZohoCode,
      isBadCode,
      stripCode,
    })
    if (created > 0) {
      console.info(`ðŸ¡ Finques: afegides ${created} noves (sense duplicats).`)
    } else {
      console.info('ðŸ¡ Finques: cap alta nova (matching correcte).')
    }
  } catch (err) {
    console.error('âš ï¸ Error actualitzant finques:', err)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 9ï¸âƒ£ Actualitzar colÂ·lecciÃ³ SERVEIS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  try {
    const created = await syncServeisFromDeals({
      deals: allDeals,
      slugify,
    })
    if (created > 0) {
      console.info(`ðŸ§¾ Serveis: afegits ${created} nous (sense esborrar).`)
    } else {
      console.info('ðŸ§¾ Serveis: cap alta nova.')
    }
  } catch (err) {
    console.error('âš ï¸ Error actualitzant serveis:', err)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ðŸ”Ÿ Actualitzar colÂ·lecciÃ³ COMPTES (Account_Name)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  try {
    const { upserted } = await syncZohoAccountsFromDeals(allDeals)
    if (upserted > 0) {
      console.info(
        `ðŸ‘¤ Comptes Zoho: ${upserted} actualitzats a spaces_zoho_accounts.`
      )
    } else {
      console.info('ðŸ‘¤ Comptes Zoho: cap Account_Name nou per desar.')
    }
  } catch (err) {
    console.error('âš ï¸ Error actualitzant comptes Zoho:', err)
  }

  if (manualIdsToDeleteAfterStageWrite.length > 0) {
    let manualDeleteBatch = firestore.batch()
    let manualDeleteCount = 0

    const flushManualDeletes = async () => {
      if (manualDeleteCount === 0) return
      await manualDeleteBatch.commit()
      manualDeleteBatch = firestore.batch()
      manualDeleteCount = 0
    }

    for (const manualId of manualIdsToDeleteAfterStageWrite) {
      manualDeleteBatch.delete(
        firestore.collection(SPACES_MANUAL_RESERVES_COLLECTION).doc(manualId)
      )
      manualDeleteCount += 1
      if (manualDeleteCount >= MAX_BATCH_WRITES) {
        await flushManualDeletes()
      }
    }
    await flushManualDeletes()
    console.info(
      `ðŸŸ£ Reserves manuals substituÃ¯des per Zoho: ${manualReplacedCount}`
    )
  }

  console.info('ðŸ”¥ Firestore sincronitzat correctament')
  return {
    totalCount: allDeals.length,
    createdCount: normalized.length,
    deletedCount: deleted,
    manualReplacedCount,
    attachmentsChecked: attachmentTotals.attachmentsChecked,
    attachmentsDownloaded: attachmentTotals.attachmentsDownloaded,
    attachmentsReused: attachmentTotals.attachmentsReused,
    attachmentsDeletedFromStorage: attachmentTotals.attachmentsDeletedFromStorage,
  }
}


