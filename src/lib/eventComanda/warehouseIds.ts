export function normalizeWarehouseCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function warehouseDocId(code: string) {
  return normalizeWarehouseCode(code)
}
