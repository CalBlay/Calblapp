import type {
  EventComandaArticleOption,
  EventComandaLine,
  EventComandaOrderLine,
} from '@/lib/eventComanda/types'

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export function flattenTemplateLines(
  linesByFamily: Record<string, EventComandaLine[]> = {}
): EventComandaLine[] {
  return Object.values(linesByFamily)
    .flat()
    .sort((a, b) => a.articleCode.localeCompare(b.articleCode))
}

export function buildOrderLinesFromTemplate(
  templateLines: EventComandaLine[]
): EventComandaOrderLine[] {
  return templateLines
    .map((line) => ({
      articleCode: line.articleCode,
      articleName: line.articleName,
      family: line.family,
      qtyUnit: line.qtyUnit,
      qtyTemplate: line.qtyInitial,
      qtyRequested: 0,
      warehouseId: null,
      warehouseCode: null,
      warehouseName: null,
    }))
    .sort((a, b) => a.articleCode.localeCompare(b.articleCode))
}

export function mergeWarehouseIntoOrderLines(
  lines: EventComandaOrderLine[],
  resolved: Array<{
    articleCode: string
    warehouseId: string | null
    warehouseCode: string | null
    warehouseName: string | null
  }>
): EventComandaOrderLine[] {
  const byCode = new Map(resolved.map((row) => [row.articleCode.toUpperCase(), row]))
  return lines.map((line) => {
    const hit = byCode.get(line.articleCode.toUpperCase())
    if (!hit) return line
    return {
      ...line,
      warehouseId: hit.warehouseId,
      warehouseCode: hit.warehouseCode,
      warehouseName: hit.warehouseName,
    }
  })
}

export function templateLineByCode(
  linesByFamily: Record<string, EventComandaLine[]> = {}
): Map<string, EventComandaLine> {
  const map = new Map<string, EventComandaLine>()
  for (const line of flattenTemplateLines(linesByFamily)) {
    map.set(line.articleCode.toUpperCase(), line)
  }
  return map
}

export function buildArticleSearchPool(
  templateLines: EventComandaLine[],
  catalogArticles: EventComandaArticleOption[] = []
): EventComandaArticleOption[] {
  const byCode = new Map<string, EventComandaArticleOption>()

  for (const line of templateLines) {
    const code = line.articleCode.toUpperCase()
    byCode.set(code, {
      articleCode: line.articleCode,
      articleName: line.articleName,
      family: line.family,
      qtyUnit: line.qtyUnit,
      qtyTemplate: line.qtyInitial,
      inTemplate: true,
      warehouseId: null,
      warehouseCode: null,
      warehouseName: null,
    })
  }

  for (const article of catalogArticles) {
    const code = article.articleCode.toUpperCase()
    const existing = byCode.get(code)
    if (existing) {
      byCode.set(code, {
        ...existing,
        warehouseId: article.warehouseId ?? existing.warehouseId ?? null,
        warehouseCode: article.warehouseCode ?? existing.warehouseCode ?? null,
        warehouseName: article.warehouseName ?? existing.warehouseName ?? null,
      })
      continue
    }
    byCode.set(code, { ...article, inTemplate: false, qtyTemplate: null })
  }

  return [...byCode.values()].sort((a, b) => a.articleCode.localeCompare(b.articleCode))
}

export function searchArticles(
  pool: EventComandaArticleOption[],
  query: string,
  limit = 20
): EventComandaArticleOption[] {
  const normalizedQuery = fold(query)
  if (!normalizedQuery) return []

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  return pool
    .filter((article) => {
      const haystack = fold(
        [article.articleCode, article.articleName, article.family].filter(Boolean).join(' ')
      )
      if (haystack.includes(normalizedQuery)) return true
      return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
    })
    .slice(0, limit)
}

export function filterOrderLinesByQuery(
  lines: EventComandaOrderLine[],
  query: string
): EventComandaOrderLine[] {
  const normalizedQuery = fold(query)
  if (!normalizedQuery) return lines

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  return lines.filter((line) => {
    const haystack = fold(
      [line.articleCode, line.articleName, line.family].filter(Boolean).join(' ')
    )
    if (haystack.includes(normalizedQuery)) return true
    return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
  })
}
