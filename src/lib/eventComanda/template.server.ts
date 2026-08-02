import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { ParsedErpLine } from '@/lib/eventComanda/parseErpExcel'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import type { EventComandaStatus } from '@/lib/eventComanda/types'

const COL = EVENT_COMANDA_COLLECTIONS.templates

export type EventComandaTemplateDoc = {
  eventId: string
  sourceFileName: string
  dateRangeLabel?: string | null
  families: string[]
  lines: Array<{
    articleCode: string
    articleName: string
    family: string
    qtyInitial: number
    qtyUnit?: string
    sortOrder: number
  }>
  lineCount: number
  familyCount: number
  totalQty: number
  version: number
  importedAt: number
  importedByUserId?: string | null
  importedByUserName?: string | null
  warnings?: string[]
}

export async function getEventComandaTemplate(eventId: string) {
  const snap = await db.collection(COL).doc(eventId).get()
  if (!snap.exists) return null
  return snap.data() as EventComandaTemplateDoc
}

export function templateToStatus(template: EventComandaTemplateDoc | null): EventComandaStatus {
  if (!template || !template.lineCount) return 'no_template'
  return 'template_ready'
}

export async function saveEventComandaTemplate(params: {
  eventId: string
  fileName: string
  dateRangeLabel?: string
  families: string[]
  lines: ParsedErpLine[]
  warnings?: string[]
  userId?: string
  userName?: string
}) {
  const { eventId, fileName, lines } = params
  const ref = db.collection(COL).doc(eventId)
  const existing = await ref.get()
  const version = Number((existing.data() as EventComandaTemplateDoc | undefined)?.version || 0) + 1
  const now = Date.now()

  const payload: EventComandaTemplateDoc = {
    eventId,
    sourceFileName: fileName,
    dateRangeLabel: params.dateRangeLabel || null,
    families: params.families,
    lines: lines.map((line, index) => ({
      articleCode: line.articleCode,
      articleName: line.articleName,
      family: line.family,
      qtyInitial: line.qtyInitial,
      qtyUnit: eventComandaQtyUnit(line.qtyUnit),
      sortOrder: index,
    })),
    lineCount: lines.length,
    familyCount: params.families.length,
    totalQty: lines.reduce((sum, line) => sum + line.qtyInitial, 0),
    version,
    importedAt: now,
    importedByUserId: params.userId || null,
    importedByUserName: params.userName || null,
    warnings: params.warnings || [],
  }

  await ref.set(payload, { merge: false })
  return payload
}
