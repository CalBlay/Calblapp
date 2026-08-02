import { normalizeEventId } from '@/lib/quadrantsPost/utils'
import type { QuadrantSave } from '@/lib/quadrantsPost/types'

export function createStageDataApplier(
  getStageVerdCached: (stageDocId: string) => Promise<Record<string, unknown> | null>,
  body: Record<string, unknown>,
  canonicalEventId: string
) {
  return async (toSave: QuadrantSave) => {
    const baseEventId = normalizeEventId(String(body.eventId || ''))
    const stageDocId = baseEventId || canonicalEventId
    const stageData = await getStageVerdCached(stageDocId)
    const stageText = (...keys: string[]) => {
      for (const key of keys) {
        const value = stageData?.[key]
        const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
        if (text) return text
      }
      return ''
    }
    const stageNumber = (...keys: string[]) => {
      const text = stageText(...keys)
      if (!text) return null
      const parsed = Number(String(text).replace(',', '.'))
      return Number.isFinite(parsed) ? parsed : null
    }

    if (!toSave.code) {
      toSave.code = String(stageData?.code || stageData?.C_digo || '')
    }
    if (!toSave.location) {
      toSave.location = stageText('Ubicacio', 'location', 'eventLocation')
    }
    if (!toSave.service) {
      toSave.service = stageText('Servei', 'servei', 'service', 'serviceType') || null
    }
    if (!toSave.ln) {
      toSave.ln = stageText('LN', 'FincaLN', 'ln', 'lineOfBusiness') || null
    }
    if (toSave.numPax === null || toSave.numPax === undefined) {
      toSave.numPax = stageNumber('NumPax', 'numPax', 'pax')
    }
    if (baseEventId) {
      toSave.eventId = baseEventId
    }
  }
}
