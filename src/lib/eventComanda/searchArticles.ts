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

/** Combina línies de comanda existents amb tots els articles de la plantilla (qty 0 si no hi són). */
export function mergeOrderLinesWithTemplate(
  orderLines: EventComandaOrderLine[],
  templateLines: EventComandaLine[]
): EventComandaOrderLine[] {
  const byCode = new Map<string, EventComandaOrderLine>()

  for (const templateLine of templateLines) {
    const code = templateLine.articleCode.toUpperCase()
    byCode.set(code, {
      articleCode: templateLine.articleCode,
      articleName: templateLine.articleName,
      family: templateLine.family,
      qtyUnit: templateLine.qtyUnit,
      qtyTemplate: templateLine.qtyInitial,
      qtyRequested: 0,
      warehouseId: null,
      warehouseCode: null,
      warehouseName: null,
    })
  }

  for (const line of orderLines) {
    const code = line.articleCode.toUpperCase()
    const templateBase = byCode.get(code)
    byCode.set(code, {
      ...(templateBase ?? {
        articleCode: line.articleCode,
        articleName: line.articleName,
        family: line.family,
        qtyUnit: line.qtyUnit,
        qtyTemplate: line.qtyTemplate ?? null,
        qtyRequested: line.qtyRequested,
        warehouseId: line.warehouseId ?? null,
        warehouseCode: line.warehouseCode ?? null,
        warehouseName: line.warehouseName ?? null,
      }),
      ...line,
      qtyTemplate: templateBase?.qtyTemplate ?? line.qtyTemplate ?? null,
    })
  }

  return [...byCode.values()].sort((a, b) =>
    a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' })
  )
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

export function enrichCatalogArticlesWithTemplate(
  catalogArticles: EventComandaArticleOption[],
  templateLines: EventComandaLine[] = []
): EventComandaArticleOption[] {
  const templateByCode = new Map(
    templateLines.map((line) => [line.articleCode.toUpperCase(), line])
  )

  return catalogArticles.map((article) => {
    const template = templateByCode.get(article.articleCode.toUpperCase())
    if (!template) {
      return {
        ...article,
        inTemplate: false,
        qtyTemplate: article.qtyTemplate ?? null,
      }
    }
    return {
      ...article,
      inTemplate: true,
      qtyTemplate: article.qtyTemplate ?? template.qtyInitial,
      qtyUnit: article.qtyUnit || template.qtyUnit,
      family: article.family || template.family,
    }
  })
}

/** @deprecated El cercador de comandes usa només el catàleg; vegeu enrichCatalogArticlesWithTemplate. */
export function buildArticleSearchPool(
  templateLines: EventComandaLine[],
  catalogArticles: EventComandaArticleOption[] = []
): EventComandaArticleOption[] {
  return enrichCatalogArticlesWithTemplate(catalogArticles, templateLines)
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
