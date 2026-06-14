export type ComandaLineSortKey = 'code' | 'name' | 'qty' | 'warehouse'

export type ComandaLineSortDirection = 'asc' | 'desc'

export type ComandaLineSortSpec = {
  key: ComandaLineSortKey
  direction: ComandaLineSortDirection
}

type SortableLine = {
  articleCode: string
  articleName: string
  qtyRequested: number | null
  warehouseName?: string | null
  warehouseCode?: string | null
}

function qtyForSort(qty: number | null | undefined) {
  if (qty == null || !Number.isFinite(Number(qty))) return Number.NEGATIVE_INFINITY
  return Number(qty)
}

function warehouseForSort(line: SortableLine) {
  return String(line.warehouseName || line.warehouseCode || '').trim()
}

function compareByKey(a: SortableLine, b: SortableLine, key: ComandaLineSortKey) {
  if (key === 'code') {
    return a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' })
  }
  if (key === 'name') {
    return a.articleName.localeCompare(b.articleName, 'ca', { sensitivity: 'base' })
  }
  if (key === 'warehouse') {
    const cmp = warehouseForSort(a).localeCompare(warehouseForSort(b), 'ca', {
      sensitivity: 'base',
    })
    if (cmp !== 0) return cmp
    return a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' })
  }
  return qtyForSort(a.qtyRequested) - qtyForSort(b.qtyRequested)
}

const DEFAULT_SORT_STACK: ComandaLineSortSpec[] = [{ key: 'code', direction: 'asc' }]

export function sortComandaLines<T extends SortableLine>(
  lines: T[],
  stack: ComandaLineSortSpec[]
): T[] {
  const criteria = stack.length ? stack : DEFAULT_SORT_STACK

  return [...lines].sort((a, b) => {
    for (const { key, direction } of criteria) {
      const cmp = compareByKey(a, b, key)
      if (cmp !== 0) {
        return cmp * (direction === 'asc' ? 1 : -1)
      }
    }
    return a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' })
  })
}

/** Clic: principal / alterna direcció; un segon criteri es conserva (màx. 2). */
export function nextComandaLineSortStack(
  stack: ComandaLineSortSpec[],
  nextKey: ComandaLineSortKey
): ComandaLineSortSpec[] {
  const current = stack.length ? stack : DEFAULT_SORT_STACK
  const primary = current[0]

  if (primary?.key === nextKey) {
    return [
      { key: nextKey, direction: primary.direction === 'asc' ? 'desc' : 'asc' },
      ...current.slice(1),
    ]
  }

  const secondaryIndex = current.findIndex((entry, index) => index > 0 && entry.key === nextKey)
  if (secondaryIndex > 0) {
    const promoted = current[secondaryIndex]
    const withoutPromoted = current.filter((_, index) => index !== secondaryIndex)
    return [promoted, ...withoutPromoted.filter((_, index) => index !== 0)].slice(0, 2)
  }

  if (primary) {
    return [{ key: nextKey, direction: 'asc' }, primary].slice(0, 2)
  }

  return [{ key: nextKey, direction: 'asc' }]
}

/** Compatibilitat amb ordenació d'un sol camp. */
export function nextComandaLineSort(
  currentKey: ComandaLineSortKey,
  currentDirection: ComandaLineSortDirection,
  nextKey: ComandaLineSortKey
): { key: ComandaLineSortKey; direction: ComandaLineSortDirection } {
  const next = nextComandaLineSortStack([{ key: currentKey, direction: currentDirection }], nextKey)
  return next[0]
}

export const COMANDA_LINE_DEFAULT_SORT_STACK = DEFAULT_SORT_STACK

export const COMANDA_LINE_TEMPLATE_SORT_STACK: ComandaLineSortSpec[] = [
  { key: 'warehouse', direction: 'asc' },
  { key: 'name', direction: 'asc' },
]
