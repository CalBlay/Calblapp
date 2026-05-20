import type {
  CuinaCentralArticle,
  CuinaCentralMachine,
  CuinaCentralMachineArticleRate,
  CuinaCentralProductionLog,
  CuinaCentralProductionPlan,
  CuinaCentralShift,
  CustomFields,
} from './types'
import { cleanText, parseNumber, shiftDurationMinutes, toCustomFields } from './utils'

const ts = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toMillis' in (value as object)) {
    return Number((value as { toMillis: () => number }).toMillis())
  }
  return null
}

export const mapArticle = (id: string, data: Record<string, unknown>): CuinaCentralArticle => ({
  id,
  code: cleanText(data.code),
  name: cleanText(data.name),
  unit: cleanText(data.unit) || 'kg',
  packagingLabel: cleanText(data.packagingLabel),
  packagingQty: data.packagingQty == null ? null : parseNumber(data.packagingQty, 0),
  line: 'bases',
  active: data.active !== false,
  customFields: toCustomFields(data.customFields),
  createdAt: ts(data.createdAt),
  updatedAt: ts(data.updatedAt),
})

export const mapMachine = (id: string, data: Record<string, unknown>): CuinaCentralMachine => ({
  id,
  code: cleanText(data.code),
  name: cleanText(data.name),
  location: cleanText(data.location),
  zone: cleanText(data.zone),
  mapX: data.mapX == null ? null : parseNumber(data.mapX, 0),
  mapY: data.mapY == null ? null : parseNumber(data.mapY, 0),
  active: data.active !== false,
  customFields: toCustomFields(data.customFields),
  createdAt: ts(data.createdAt),
  updatedAt: ts(data.updatedAt),
})

export const mapShift = (id: string, data: Record<string, unknown>): CuinaCentralShift => {
  const startTime = cleanText(data.startTime)
  const endTime = cleanText(data.endTime)
  return {
    id,
    code: cleanText(data.code),
    name: cleanText(data.name),
    startTime,
    endTime,
    durationMinutes:
      parseNumber(data.durationMinutes, 0) ||
      shiftDurationMinutes(startTime, endTime),
    sortOrder: parseNumber(data.sortOrder, 0),
    active: data.active !== false,
    customFields: toCustomFields(data.customFields),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  }
}

export const mapRate = (id: string, data: Record<string, unknown>): CuinaCentralMachineArticleRate => ({
  id,
  machineId: cleanText(data.machineId),
  machineCode: cleanText(data.machineCode),
  machineName: cleanText(data.machineName),
  articleId: cleanText(data.articleId),
  articleCode: cleanText(data.articleCode),
  articleName: cleanText(data.articleName),
  unit: cleanText(data.unit),
  qtyPerHour: parseNumber(data.qtyPerHour, 0),
  notes: cleanText(data.notes),
  customFields: toCustomFields(data.customFields),
  createdAt: ts(data.createdAt),
  updatedAt: ts(data.updatedAt),
})

export const mapLog = (id: string, data: Record<string, unknown>): CuinaCentralProductionLog => ({
  id,
  articleId: cleanText(data.articleId),
  articleCode: cleanText(data.articleCode),
  articleName: cleanText(data.articleName),
  machineId: cleanText(data.machineId),
  machineCode: cleanText(data.machineCode),
  machineName: cleanText(data.machineName),
  shiftId: cleanText(data.shiftId),
  shiftName: cleanText(data.shiftName),
  unit: cleanText(data.unit),
  quantityProduced: parseNumber(data.quantityProduced, 0),
  quantityRejected: parseNumber(data.quantityRejected, 0),
  startedAt: cleanText(data.startedAt),
  endedAt: cleanText(data.endedAt),
  durationMinutes: parseNumber(data.durationMinutes, 0),
  operatorNames: cleanText(data.operatorNames),
  notes: cleanText(data.notes),
  customFields: toCustomFields(data.customFields),
  createdAt: ts(data.createdAt),
  updatedAt: ts(data.updatedAt),
})

export const mapPlan = (id: string, data: Record<string, unknown>): CuinaCentralProductionPlan => ({
  id,
  weekStart: cleanText(data.weekStart),
  status: data.status === 'confirmed' ? 'confirmed' : 'draft',
  operatorCountByShift:
    data.operatorCountByShift && typeof data.operatorCountByShift === 'object'
      ? (data.operatorCountByShift as Record<string, number>)
      : {},
  needs: Array.isArray(data.needs) ? (data.needs as CuinaCentralProductionPlan['needs']) : [],
  slots: Array.isArray(data.slots) ? (data.slots as CuinaCentralProductionPlan['slots']) : [],
  warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
  totalEstimatedMinutes: parseNumber(data.totalEstimatedMinutes, 0),
  totalCapacityMinutes: parseNumber(data.totalCapacityMinutes, 0),
  overtimeMinutes: parseNumber(data.overtimeMinutes, 0),
  createdAt: ts(data.createdAt),
  updatedAt: ts(data.updatedAt),
})

export const stripCustomFields = (fields: CustomFields) => {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(fields)) {
    const key = cleanText(k)
    if (!key) continue
    out[key] = v
  }
  return out
}
