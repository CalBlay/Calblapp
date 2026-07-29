import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { normalizeLocationKey } from '@/services/zoho/sync-finca-matching'
import {
  nextCEUCode,
  parseCeuNumber,
  parseCeuNumberStrict4,
  resolveFincaLnForNewCode,
} from '@/services/zoho/sync-finques-codes'
import type { NormalizedDeal } from '@/services/zoho/sync-types'

export {
  CEU_BASE_FALLBACK,
  nextCEUCode,
  parseCeuNumber,
  parseCeuNumberStrict4,
  resolveFincaLnForNewCode,
} from '@/services/zoho/sync-finques-codes'

type SyncFinquesOptions = {
  deals: NormalizedDeal[]
  normalizeSyncedCode: (code?: string | null) => string | null
  normalizeIncomingZohoCode: (code?: string | null) => string | null
  isBadCode: (code?: string | null) => boolean
  stripCode: (text: string) => string
}

export async function syncFinquesFromDeals({
  deals,
  normalizeSyncedCode,
  normalizeIncomingZohoCode,
  isBadCode,
  stripCode,
}: SyncFinquesOptions): Promise<number> {
  const finquesSnap = await firestore.collection('finques').get()

  const existingCodes = new Set<string>()
  const createdNoCodeNames = new Set<string>()
  let maxCEUNum: number | null = null

  for (const doc of finquesSnap.docs) {
    const data = doc.data()
    const rawCode = String(data.code || '').trim().toUpperCase()
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

  for (const deal of deals) {
    const rawNom = deal.Ubicacio || ''
    if (!rawNom) continue

    const nomNetZoho = normalizeLocationKey(rawNom)
    let code = normalizeIncomingZohoCode(deal.FincaCode || deal.UbicacioCode) || null

    if (isBadCode(code)) {
      code = null
    }

    if (code && existingCodes.has(code)) continue

    if (!code) {
      if (!nomNetZoho || createdNoCodeNames.has(nomNetZoho)) continue
      createdNoCodeNames.add(nomNetZoho)
    }

    if (!code) {
      const next = nextCEUCode(maxCEUNum)
      code = next
      maxCEUNum = parseCeuNumber(next)
    }

    code = normalizeSyncedCode(code) || code
    if (existingCodes.has(code)) continue

    const ln = resolveFincaLnForNewCode({
      code,
      locationName: rawNom,
      dealLn: deal.LN,
    })

    const ref = firestore.collection('finques').doc(code)
    batchFinques.set(ref, {
      code,
      nom: stripCode(rawNom).trim(),
      nomNet: nomNetZoho,
      LN: ln,
      searchable: `${rawNom} ${code}`.toLowerCase(),
      origen: 'zoho',
      updatedAt: new Date().toISOString(),
    })

    existingCodes.add(code)
    created += 1
  }

  if (created > 0) {
    await batchFinques.commit()
  }

  return created
}
