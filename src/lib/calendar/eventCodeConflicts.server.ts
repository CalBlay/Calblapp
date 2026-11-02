import type { Firestore, Query, Transaction } from 'firebase-admin/firestore'
import {
  isRepeatablePmCode,
  normalizeAdaEventCode,
} from '@/services/sync/adaCodePolicy'

const CALENDAR_STAGE_COLLECTIONS = ['stage_verd', 'stage_taronja', 'stage_groc'] as const
const EVENT_CODE_FIELDS = ['code', 'C_digo', 'Codi', 'codi'] as const

export type CalendarCodeConflict = {
  id: string
  collection: string
  name: string
  date: string
  location: string
}

export class CalendarCodeConflictError extends Error {
  code: string
  conflicts: CalendarCodeConflict[]

  constructor(code: string, conflicts: CalendarCodeConflict[]) {
    super(`El codi ${code} ja esta assignat a un altre esdeveniment`)
    this.name = 'CalendarCodeConflictError'
    this.code = code
    this.conflicts = conflicts
  }
}

export async function assertCalendarEventCodeAvailable(args: {
  db: Firestore
  transaction: Transaction
  code: string
  exclude?: { collection: string; id: string }
}) {
  const code = normalizeAdaEventCode(args.code)
  if (!code || isRepeatablePmCode(code)) return code

  const variants = Array.from(new Set([code, code.toUpperCase(), code.toLowerCase()]))
  const conflictSnaps = await Promise.all(
    CALENDAR_STAGE_COLLECTIONS.flatMap((collection) =>
      EVENT_CODE_FIELDS.map((field) =>
        args.transaction
          .get(args.db.collection(collection).where(field, 'in', variants) as Query)
          .then((result) => ({ collection, result }))
      )
    )
  )
  const conflictsByKey = new Map<string, CalendarCodeConflict>()
  for (const { collection, result } of conflictSnaps) {
    for (const conflictDoc of result.docs) {
      if (args.exclude?.collection === collection && args.exclude.id === conflictDoc.id) {
        continue
      }
      const data = conflictDoc.data() || {}
      const conflictCode = normalizeAdaEventCode(
        String(data.code || data.C_digo || data.Codi || data.codi || '')
      )
      if (conflictCode !== code) continue
      conflictsByKey.set(`${collection}/${conflictDoc.id}`, {
        id: conflictDoc.id,
        collection,
        name: String(
          data.NomEvent || data.nomEvent || data.summary || 'Esdeveniment sense nom'
        ).trim(),
        date: String(data.DataInici || data.Data || data.start || '').slice(0, 10),
        location: String(data.Ubicacio || data.location || '').trim(),
      })
    }
  }

  const conflicts = Array.from(conflictsByKey.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ca')
  )
  if (conflicts.length > 0) throw new CalendarCodeConflictError(code, conflicts)
  return code
}
