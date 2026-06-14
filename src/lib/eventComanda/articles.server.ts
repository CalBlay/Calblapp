import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { ParsedErpLine } from '@/lib/eventComanda/parseErpExcel'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'

const COL = EVENT_COMANDA_COLLECTIONS.articles
const BATCH_LIMIT = 400

export const articleDocId = (code: string) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[/\\]/g, '_')

export async function upsertArticlesFromLines(
  lines: ParsedErpLine[],
  userId?: string
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const now = Date.now()

  const uniqueByCode = new Map<string, ParsedErpLine>()
  for (const line of lines) {
    const id = articleDocId(line.articleCode)
    if (!id) continue
    uniqueByCode.set(id, line)
  }

  const entries = [...uniqueByCode.entries()]
  for (let offset = 0; offset < entries.length; offset += BATCH_LIMIT) {
    const chunk = entries.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map(([id]) => db.collection(COL).doc(id))
    const snaps = await db.getAll(...refs)
    const existsById = new Map(snaps.map((s) => [s.id, s.exists]))

    const batch = db.batch()
    for (const [id, line] of chunk) {
      const ref = db.collection(COL).doc(id)
      const payload = {
        code: line.articleCode,
        name: line.articleName,
        family: line.family,
        unit: eventComandaQtyUnit(line.qtyUnit),
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
        updatedByUserId: userId || null,
      }
      if (existsById.get(id)) {
        batch.set(
          ref,
          { ...payload, usageCount: FieldValue.increment(1) },
          { merge: true }
        )
        updated += 1
      } else {
        batch.set(ref, {
          ...payload,
          usageCount: 1,
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

export type EventComandaArticleRecord = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit: string
}

export async function listEventComandaArticles(limit = 1500): Promise<EventComandaArticleRecord[]> {
  const snap = await db.collection(COL).limit(limit).get()

  return snap.docs
    .map((doc) => {
      const data = doc.data() as {
        code?: string
        name?: string
        family?: string
        unit?: string
        isActive?: boolean
      }
      if (data.isActive === false) return null
      const articleCode = String(data.code || '').trim().toUpperCase()
      if (!articleCode) return null
      return {
        articleCode,
        articleName: String(data.name || '').trim(),
        family: String(data.family || '').trim(),
        qtyUnit: eventComandaQtyUnit(data.unit),
      }
    })
    .filter((article): article is EventComandaArticleRecord => article != null)
    .sort((a, b) => a.articleCode.localeCompare(b.articleCode))
}
