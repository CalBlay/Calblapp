import type { EventComandaArticleOption, EventComandaLine } from '@/lib/eventComanda/types'

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
    })
  }

  for (const article of catalogArticles) {
    const code = article.articleCode.toUpperCase()
    const existing = byCode.get(code)
    if (existing) continue
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
