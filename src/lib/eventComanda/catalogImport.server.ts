import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { articleDocId, articleNameSearchKey } from '@/lib/eventComanda/articles.server'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { ParsedCatalogArticle } from '@/lib/eventComanda/parseArticlesCatalogExcel'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import { unitDocId } from '@/lib/eventComanda/units.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

const ARTICLES_COL = EVENT_COMANDA_COLLECTIONS.articles
const WAREHOUSES_COL = EVENT_COMANDA_COLLECTIONS.warehouses
const UNITS_COL = EVENT_COMANDA_COLLECTIONS.units
const BATCH_LIMIT = 400

export type CatalogImportResult = {
  warehouses: { created: number; updated: number }
  units: { created: number; updated: number }
  articles: { created: number; updated: number }
  warnings: string[]
}

function warehouseNameCandidates(lines: ParsedCatalogArticle[]) {
  const byWarehouse = new Map<string, Map<string, number>>()

  for (const line of lines) {
    const code = warehouseDocId(line.warehouseCode)
    if (!code) continue
    const name = String(line.erpGroupName || '').trim()
    if (!name) continue
    const counts = byWarehouse.get(code) || new Map<string, number>()
    counts.set(name, (counts.get(name) || 0) + 1)
    byWarehouse.set(code, counts)
  }

  const result = new Map<string, string>()
  for (const [code, counts] of byWarehouse.entries()) {
    let bestName = ''
    let bestCount = 0
    for (const [name, count] of counts.entries()) {
      if (count > bestCount) {
        bestName = name
        bestCount = count
      }
    }
    if (bestName) result.set(code, bestName)
  }
  return result
}

async function upsertWarehousesFromCatalog(
  lines: ParsedCatalogArticle[],
  userId?: string
): Promise<{ created: number; updated: number }> {
  const nameByCode = warehouseNameCandidates(lines)
  const codes = new Set<string>()
  for (const line of lines) {
    const code = warehouseDocId(line.warehouseCode)
    if (code) codes.add(code)
  }

  let created = 0
  let updated = 0
  const now = Date.now()
  const codeList = [...codes]

  for (let offset = 0; offset < codeList.length; offset += BATCH_LIMIT) {
    const chunk = codeList.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map((code) => db.collection(WAREHOUSES_COL).doc(code))
    const snaps = await db.getAll(...refs)
    const batch = db.batch()

    chunk.forEach((code, index) => {
      const snap = snaps[index]
      const name = nameByCode.get(code) || `Magatzem ${code}`
      const ref = refs[index]

      if (snap.exists) {
        const existingName = String(snap.data()?.name || '').trim()
        const patch: Record<string, unknown> = {
          updatedAt: now,
          updatedByUserId: userId || null,
        }
        if (!existingName || existingName === `Magatzem ${code}`) {
          patch.name = name
        }
        batch.set(ref, patch, { merge: true })
        updated += 1
      } else {
        batch.set(ref, {
          code,
          name,
          isActive: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
          createdByUserId: userId || null,
          updatedByUserId: userId || null,
        })
        created += 1
      }
    })

    await batch.commit()
  }

  return { created, updated }
}

async function upsertUnitsFromCatalog(
  lines: ParsedCatalogArticle[],
  userId?: string
): Promise<{ created: number; updated: number }> {
  const codes = new Set<string>()
  for (const line of lines) {
    const code = unitDocId(eventComandaQtyUnit(line.unit))
    if (code) codes.add(code)
  }

  let created = 0
  let updated = 0
  const now = Date.now()
  const codeList = [...codes]

  for (let offset = 0; offset < codeList.length; offset += BATCH_LIMIT) {
    const chunk = codeList.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map((code) => db.collection(UNITS_COL).doc(code))
    const snaps = await db.getAll(...refs)
    const batch = db.batch()

    chunk.forEach((code, index) => {
      const snap = snaps[index]
      const ref = refs[index]

      if (snap.exists) {
        batch.set(
          ref,
          {
            updatedAt: now,
            updatedByUserId: userId || null,
          },
          { merge: true }
        )
        updated += 1
      } else {
        batch.set(ref, {
          code,
          name: code,
          isActive: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
          createdByUserId: userId || null,
          updatedByUserId: userId || null,
        })
        created += 1
      }
    })

    await batch.commit()
  }

  return { created, updated }
}

async function upsertArticlesFromCatalog(
  lines: ParsedCatalogArticle[],
  userId?: string
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const now = Date.now()

  const uniqueByCode = new Map<string, ParsedCatalogArticle>()
  for (const line of lines) {
    const id = articleDocId(line.articleCode)
    if (!id) continue
    uniqueByCode.set(id, line)
  }

  const entries = [...uniqueByCode.entries()]
  for (let offset = 0; offset < entries.length; offset += BATCH_LIMIT) {
    const chunk = entries.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map(([id]) => db.collection(ARTICLES_COL).doc(id))
    const snaps = await db.getAll(...refs)
    const existingById = new Map(
      snaps.map((s) => [
        s.id,
        s.exists ? (s.data() as { warehouseId?: string; warehouseSource?: string }) : null,
      ])
    )

    const batch = db.batch()
    for (const [id, line] of chunk) {
      const ref = db.collection(ARTICLES_COL).doc(id)
      const existing = existingById.get(id)
      const warehouseId = warehouseDocId(line.warehouseCode)
      const keepManualWarehouse =
        existing?.warehouseSource === 'manual' && Boolean(existing.warehouseId)

      const payload: Record<string, unknown> = {
        code: line.articleCode,
        name: line.articleName,
        nameSearch: articleNameSearchKey(line.articleName),
        family: line.erpGroupCode || line.articleCode.slice(0, 2),
        unit: eventComandaQtyUnit(line.unit),
        erpGroupCode: line.erpGroupCode || null,
        erpGroupName: line.erpGroupName || null,
        erpFamilyCode: line.erpFamilyCode || null,
        erpFamilyName: line.erpFamilyName || null,
        erpSubfamilyCode: line.erpSubfamilyCode || null,
        erpSubfamilyName: line.erpSubfamilyName || null,
        isActive: true,
        catalogImportedAt: now,
        updatedAt: now,
        updatedByUserId: userId || null,
      }

      if (keepManualWarehouse) {
        payload.warehouseId = existing?.warehouseId
        payload.warehouseSource = 'manual'
      } else if (warehouseId) {
        payload.warehouseId = warehouseId
        payload.warehouseSource = 'import'
      }

      if (existing) {
        batch.set(ref, payload, { merge: true })
        updated += 1
      } else {
        batch.set(ref, {
          ...payload,
          usageCount: 0,
          createdAt: now,
          createdByUserId: userId || null,
        })
        created += 1
      }
    }
    await batch.commit()
  }

  return { created, updated }
}

export async function importEventComandaCatalog(
  lines: ParsedCatalogArticle[],
  userId?: string
): Promise<CatalogImportResult> {
  if (!lines.length) {
    throw new Error('No hi ha articles per importar.')
  }

  const warnings: string[] = []
  const warehouses = await upsertWarehousesFromCatalog(lines, userId)
  const units = await upsertUnitsFromCatalog(lines, userId)
  const articles = await upsertArticlesFromCatalog(lines, userId)

  return { warehouses, units, articles, warnings }
}
