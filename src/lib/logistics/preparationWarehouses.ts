export const PREPARATION_WAREHOUSE_CODES = ['BODEGA', 'PARAMENT', 'MATERIAL'] as const

export type PreparationWarehouseCode = (typeof PREPARATION_WAREHOUSE_CODES)[number]

export const PREPARATION_WAREHOUSE_LABELS: Record<PreparationWarehouseCode, string> = {
  BODEGA: 'Bodega',
  PARAMENT: 'Parament',
  MATERIAL: 'Material',
}

export function isPreparationWarehouseCode(value: string): value is PreparationWarehouseCode {
  return PREPARATION_WAREHOUSE_CODES.includes(value as PreparationWarehouseCode)
}

export function normalizePreparationWarehouseCode(
  value?: string | null
): PreparationWarehouseCode | null {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
  return isPreparationWarehouseCode(raw) ? raw : null
}
