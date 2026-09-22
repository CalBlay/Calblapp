import { COLORS_STAGE } from '@/lib/colors'

export type CalendarStageCollection = 'stage_verd' | 'stage_groc' | 'stage_taronja'
export type CalendarStageFilter = 'confirmat' | 'pressupost' | 'calentet'

const PRESENTATION: Record<
  CalendarStageCollection,
  { filter: CalendarStageFilter; label: string; dotClass: string; colorClass: string }
> = {
  stage_verd: {
    filter: 'confirmat',
    label: 'Confirmat',
    dotClass: COLORS_STAGE.confirmat,
    colorClass: 'border-green-300 bg-green-50 text-green-800',
  },
  stage_groc: {
    filter: 'pressupost',
    label: 'Pressupost / Pendent',
    dotClass: COLORS_STAGE.pendent,
    colorClass: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  },
  stage_taronja: {
    filter: 'calentet',
    label: 'Prereserva / Calentet',
    dotClass: COLORS_STAGE.prereserva,
    colorClass: 'border-orange-300 bg-orange-50 text-orange-800',
  },
}

export function normalizeCalendarStageCollection(value?: string): CalendarStageCollection | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'stage_verd' || normalized === 'verd') return 'stage_verd'
  if (normalized === 'stage_groc' || normalized === 'groc') return 'stage_groc'
  if (normalized === 'stage_taronja' || normalized === 'taronja') return 'stage_taronja'
  return null
}

export function calendarStagePresentation(value?: string) {
  const collection = normalizeCalendarStageCollection(value)
  return collection ? PRESENTATION[collection] : null
}

export function calendarStageFilterForCollection(value?: string): CalendarStageFilter | null {
  return calendarStagePresentation(value)?.filter ?? null
}

export function calendarStageDotClass(value?: string): string {
  return calendarStagePresentation(value)?.dotClass ?? 'bg-gray-300'
}
