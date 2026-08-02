import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import { hasRestaurantKeyword, normalizeLocationKey } from '@/services/zoho/sync-finca-matching'
import type { NormalizedDeal } from '@/services/zoho/sync-types'

const CEU_BASE_FALLBACK = 172

function parseCeuNumber(code?: string | null): number {
  return Number(String(code || '').replace(/^CEU/i, ''))
}

function parseCeuNumberStrict4(code?: string | null): number | null {
  const normalized = String(code || '').trim().toUpperCase()
  const match = normalized.match(/^CEU(\d{4})$/)
  if (!match) return null
  const num = Number(match[1])
  return Number.isFinite(num) ? num : null
}

function nextCEUCode(currentMaxNum: number | null): string {
  const nextNum = (currentMaxNum ?? CEU_BASE_FALLBACK) + 1
  return `CEU${String(nextNum).padStart(4, '0')}`
}

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

    const forceGrupsRestaurants =
      code.startsWith('CCR') || hasRestaurantKeyword(rawNom)

    let ln = ''
    if (forceGrupsRestaurants) ln = 'Grups Restaurants'
    else if (code.startsWith('CCB')) ln = 'Casaments'
    else if (code.startsWith('CCE')) ln = 'Empreses'
    else if (code.startsWith('CCF')) ln = 'Foodlovers'
    else if (code.startsWith('CEU')) ln = deal.LN

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
