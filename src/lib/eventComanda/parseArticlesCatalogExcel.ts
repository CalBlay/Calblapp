/** Mapa fix de columnes «Articles APP.xlsx» (0-based). */
export const CATALOG_CODE_COL = 0
export const CATALOG_NAME_COL = 1
export const CATALOG_UNIT_COL = 2
export const CATALOG_WAREHOUSE_COL = 3
export const CATALOG_GROUP_COL = 4
export const CATALOG_GROUP_NAME_COL = 5
export const CATALOG_FAMILY_COL = 6
export const CATALOG_FAMILY_NAME_COL = 7
export const CATALOG_SUBFAMILY_COL = 8
export const CATALOG_SUBFAMILY_NAME_COL = 9

export type ParsedCatalogArticle = {
  articleCode: string
  articleName: string
  unit: string
  warehouseCode: string
  erpGroupCode: string
  erpGroupName: string
  erpFamilyCode: string
  erpFamilyName: string
  erpSubfamilyCode: string
  erpSubfamilyName: string
}

export type ParseArticlesCatalogResult = {
  lines: ParsedCatalogArticle[]
  warnings: string[]
  stats: {
    articleCount: number
    warehouseCount: number
    unitCount: number
    groupCount: number
    familyCount: number
    subfamilyCount: number
  }
}

const SKIP_CODE_RE = /TEST_DELSYS/i

const cleanCell = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeCode = (value: string) => cleanCell(value).toUpperCase()

const isHeaderRow = (row: unknown[]) => {
  const first = cleanCell(row[CATALOG_CODE_COL]).toLowerCase()
  return first === 'codi' || first === 'code'
}

const mapRow = (row: unknown[]): ParsedCatalogArticle | null => {
  const articleCode = normalizeCode(String(row[CATALOG_CODE_COL] ?? ''))
  if (!articleCode || SKIP_CODE_RE.test(articleCode)) return null

  const articleName = cleanCell(row[CATALOG_NAME_COL])
  if (!articleName) return null

  return {
    articleCode,
    articleName,
    unit: normalizeCode(String(row[CATALOG_UNIT_COL] ?? '')) || 'UN',
    warehouseCode: normalizeCode(String(row[CATALOG_WAREHOUSE_COL] ?? '')),
    erpGroupCode: normalizeCode(String(row[CATALOG_GROUP_COL] ?? '')),
    erpGroupName: cleanCell(row[CATALOG_GROUP_NAME_COL]),
    erpFamilyCode: normalizeCode(String(row[CATALOG_FAMILY_COL] ?? '')),
    erpFamilyName: cleanCell(row[CATALOG_FAMILY_NAME_COL]),
    erpSubfamilyCode: normalizeCode(String(row[CATALOG_SUBFAMILY_COL] ?? '')),
    erpSubfamilyName: cleanCell(row[CATALOG_SUBFAMILY_NAME_COL]),
  }
}

export function parseArticlesCatalogRows(rows: unknown[][]): ParseArticlesCatalogResult {
  const warnings: string[] = []
  const byCode = new Map<string, ParsedCatalogArticle>()
  let skippedHeader = false
  let emptyCodes = 0
  let missingWarehouse = 0

  for (const row of rows) {
    if (!row?.some((cell) => cleanCell(cell))) continue
    if (!skippedHeader && isHeaderRow(row)) {
      skippedHeader = true
      continue
    }

    const parsed = mapRow(row)
    if (!parsed) {
      const rawCode = normalizeCode(String(row[CATALOG_CODE_COL] ?? ''))
      if (!rawCode) emptyCodes += 1
      continue
    }

    if (!parsed.warehouseCode) {
      missingWarehouse += 1
      warnings.push(`Article ${parsed.articleCode} sense codi de magatzem; s'omet.`)
      continue
    }

    if (byCode.has(parsed.articleCode)) {
      warnings.push(`Article ${parsed.articleCode} duplicat al fitxer; s'utilitza l'última fila.`)
    }
    byCode.set(parsed.articleCode, parsed)
  }

  const lines = [...byCode.values()].sort((a, b) => a.articleCode.localeCompare(b.articleCode))

  if (lines.length === 0) {
    warnings.push(
      'No s\'han detectat articles vàlids. Esperat: Codi, Nom, U.Compra, Codi Magatzem, Grup, Familia, Subfamilia…'
    )
  }
  if (emptyCodes > 0) {
    warnings.push(`${emptyCodes} files sense codi d'article.`)
  }
  if (missingWarehouse > 0 && !warnings.some((w) => w.includes('sense codi de magatzem'))) {
    warnings.push(`${missingWarehouse} articles sense magatzem.`)
  }

  const warehouses = new Set(lines.map((line) => line.warehouseCode))
  const units = new Set(lines.map((line) => line.unit).filter(Boolean))
  const groups = new Set(lines.map((line) => line.erpGroupCode).filter(Boolean))
  const families = new Set(lines.map((line) => line.erpFamilyCode).filter(Boolean))
  const subfamilies = new Set(lines.map((line) => line.erpSubfamilyCode).filter(Boolean))

  return {
    lines,
    warnings,
    stats: {
      articleCount: lines.length,
      warehouseCount: warehouses.size,
      unitCount: units.size,
      groupCount: groups.size,
      familyCount: families.size,
      subfamilyCount: subfamilies.size,
    },
  }
}

const cellDisplayValue = (
  cell?: { w?: string; v?: unknown; t?: string; z?: string },
  formatCell?: (cell: { w?: string; v?: unknown; t?: string; z?: string }) => string
) => {
  if (!cell) return ''
  const formatted = cleanCell(cell.w)
  if (formatted) return formatted
  if (formatCell && cell.v != null) {
    try {
      const rendered = cleanCell(formatCell(cell))
      if (rendered) return rendered
    } catch {
      // ignore format errors
    }
  }
  if (cell.v == null) return ''
  return cell.v
}

const sheetToDisplayRows = (
  sheet: {
    '!ref'?: string
    [key: string]: unknown
  },
  utils: {
    decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }
    encode_cell: (cell: { r: number; c: number }) => string
    format_cell: (cell: { w?: string; v?: unknown; t?: string; z?: string }) => string
  }
): unknown[][] => {
  const ref = sheet['!ref']
  if (!ref) return []

  const range = utils.decode_range(ref)
  const rows: unknown[][] = []

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: unknown[] = []
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const address = utils.encode_cell({ r: rowIndex, c: colIndex })
      const cell = sheet[address] as { w?: string; v?: unknown; t?: string; z?: string } | undefined
      row.push(cellDisplayValue(cell, utils.format_cell))
    }
    rows.push(row)
  }

  return rows
}

export async function parseArticlesCatalogFile(file: File): Promise<ParseArticlesCatalogResult> {
  const { loadXlsx } = await import('@/lib/loadXlsx')
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return {
      lines: [],
      warnings: ['El fitxer no conté cap full.'],
      stats: {
        articleCount: 0,
        warehouseCount: 0,
        unitCount: 0,
        groupCount: 0,
        familyCount: 0,
        subfamilyCount: 0,
      },
    }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = sheetToDisplayRows(sheet, {
    decode_range: XLSX.utils.decode_range,
    encode_cell: XLSX.utils.encode_cell,
    format_cell: (cell) =>
      XLSX.utils.format_cell(
        cell as Parameters<typeof XLSX.utils.format_cell>[0]
      ),
  })
  return parseArticlesCatalogRows(rows)
}
