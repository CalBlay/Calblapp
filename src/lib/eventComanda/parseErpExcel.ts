export type ParsedErpLine = {
  articleCode: string
  articleName: string
  family: string
  qtyInitial: number
  qtyUnit: string
}

export type ParseErpExcelResult = {
  dateRangeLabel?: string
  families: string[]
  lines: ParsedErpLine[]
  warnings: string[]
  totalQty: number
}

/** Mapa fix de columnes ERP (0-based). */
export const ERP_CODE_COL_INDEX = 0 // A — codi article
export const ERP_NAME_COL_INDEX = 3 // D — descripció
export const ERP_QTY_COL_INDEX = 14 // O — quantitat
export const ERP_UNIT_COL_INDEX = 17 // R — unitat
/** Columna S (sovint fusionada horitzontalment amb R). */
export const ERP_UNIT_COL_S_INDEX = 18

const QTY_WITH_UNIT_RE = /^([\d]+(?:[.,]\d+)?)\s*([A-Z]{1,4})?$/i
const DEFAULT_QTY_UNIT = 'UN'
const ROW_SKIP_HEADERS = new Set([
  'SIN FAMILIA',
  'SENSE FAMILIA',
  'GENERAL',
  'EVENTOS LOGISTICA - LINEAS',
  'EVENTOS LOGISTICA - LINIES',
  'EVENTOS LOGISTICA - LÍNEAS',
  'EVENTOS LOGISTICA - LÍNIES',
])
const METADATA_PREFIX_RE =
  /^(RANGO DE FECHAS|FECHAS|CENTROS|AREA|ALMACEN|EVENTOS|ALMACÉN|ÁREA)\b/i

const cleanCell = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'O')
    .toUpperCase()
    .trim()

/** Agrupa per similitud de codi: 09, LC, Z0, M0, C0… */
export function articleCodePrefix(code: string): string {
  const normalized = String(code || '').trim().toUpperCase()
  if (!normalized) return '??'
  return normalized.slice(0, Math.min(2, normalized.length))
}

export function compareCodePrefixes(a: string, b: string): number {
  const na = /^\d+$/.test(a)
  const nb = /^\d+$/.test(b)
  if (na && nb) return a.localeCompare(b, undefined, { numeric: true })
  if (na) return -1
  if (nb) return 1
  return a.localeCompare(b)
}

export function sortFamilies(families: string[]): string[] {
  return [...families].sort(compareCodePrefixes)
}

const roundQty = (value: number) => Math.round(value * 1000) / 1000

const parseQtyNumber = (raw: string): number | null => {
  let text = cleanCell(raw)
  if (/^[\d.,]+\s*UN$/i.test(text)) {
    text = text.replace(/\s*UN$/i, '').trim()
  }
  text = text.replace(',', '.')
  if (!text) return null
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return null
  return roundQty(n)
}

const normalizeQtyUnit = (unit?: string) => {
  const normalized = cleanCell(unit || '').toUpperCase()
  return normalized || DEFAULT_QTY_UNIT
}

const sanitizeQtyUnit = (unit?: string) => {
  const normalized = normalizeQtyUnit(unit).replace(/\.+$/, '').replace(/\s+/g, '')
  if (!normalized || normalized === 'O') return DEFAULT_QTY_UNIT
  // Fragments coneguts; ONU es manté (unitat ERP habitual en aquest export).
  if (normalized === 'NU' || normalized === 'UNI' || normalized === 'UNNU') {
    return DEFAULT_QTY_UNIT
  }
  return normalized
}

export function eventComandaQtyUnit(unit?: string) {
  return sanitizeQtyUnit(unit)
}

const cellToText = (value: unknown) => cleanCell(value)

const isArticleCode = (code: string) => {
  const normalized = cleanCell(code).toUpperCase()
  if (normalized.length < 4) return false
  if (METADATA_PREFIX_RE.test(normalized)) return false
  if (/^(TODOS|ARTICULO|CANTIDAD|Nº|NO|NUMERO)$/i.test(normalized)) return false
  return /^[A-Z0-9][A-Z0-9.\-/]*$/i.test(normalized) && /\d/.test(normalized)
}

const extractDateRangeLabel = (joined: string): string | undefined => {
  if (/^fechas\s*:/i.test(joined)) {
    return joined.replace(/^fechas\s*:/i, '').trim()
  }
  if (/rango de fechas/i.test(joined)) {
    return joined.replace(/^rango de fechas[^:]*:\s*/i, '').trim()
  }
  return undefined
}

const readFixedQty = (cells: unknown[]): number | null => {
  if (ERP_QTY_COL_INDEX >= cells.length) return null
  const raw = cells[ERP_QTY_COL_INDEX]

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return roundQty(raw)
  }

  const text = cellToText(raw)
  if (!text) return null

  const unitMatch = text.match(QTY_WITH_UNIT_RE)
  if (unitMatch) {
    return parseQtyNumber(unitMatch[1])
  }

  return parseQtyNumber(text)
}

const isStandaloneUnit = (value: unknown) => {
  const text = cellToText(value).toUpperCase()
  return /^[A-Z]{1,5}$/.test(text)
}

const readFixedUnit = (cells: unknown[]): string => {
  const fromR = readFixedUnitFromCell(cells[ERP_UNIT_COL_INDEX])
  return sanitizeQtyUnit(fromR ?? DEFAULT_QTY_UNIT)
}

const readFixedUnitFromCell = (raw: unknown): string | null => {
  const text = cellToText(raw).toUpperCase()
  if (!text) return null

  const qtyMatch = text.match(QTY_WITH_UNIT_RE)
  if (qtyMatch?.[2]) {
    return sanitizeQtyUnit(qtyMatch[2])
  }

  if (isStandaloneUnit(text)) {
    return sanitizeQtyUnit(text)
  }

  return null
}

const shouldSkipFixedRow = (code: string, name: string) => {
  const codeKey = normalizeKey(code)
  const nameKey = normalizeKey(name)

  if (ROW_SKIP_HEADERS.has(codeKey) || ROW_SKIP_HEADERS.has(nameKey)) return true
  if (METADATA_PREFIX_RE.test(code) || METADATA_PREFIX_RE.test(name)) return true
  if (/^(N[O.]?\s*)?ARTICULO$/.test(codeKey) || /^(N[O.]?\s*)?ARTICULO$/.test(nameKey)) {
    return true
  }
  if (codeKey === 'CANTIDAD' || nameKey === 'CANTIDAD' || codeKey === 'UNIDAD' || nameKey === 'UNIDAD') {
    return true
  }

  return false
}

const parseFixedColumnRows = (rows: unknown[][], warnings: string[]) => {
  const lines: ParsedErpLine[] = []
  let dateRangeLabel: string | undefined

  for (const rawRow of rows) {
    const rawCells = Array.isArray(rawRow) ? rawRow.map((cell) => cell ?? '') : []
    const textCells = rawCells.map(cellToText)
    const nonEmpty = textCells.filter(Boolean)
    if (nonEmpty.length === 0) continue

    const joined = nonEmpty.join(' ')
    const dateLabel = extractDateRangeLabel(joined)
    if (dateLabel) {
      dateRangeLabel = dateLabel
      continue
    }

    const code = cleanCell(textCells[ERP_CODE_COL_INDEX]).toUpperCase()
    const name = cleanCell(textCells[ERP_NAME_COL_INDEX])

    if (shouldSkipFixedRow(code, name)) continue
    if (!code && !name) continue
    if (!isArticleCode(code)) continue
    if (!name) {
      warnings.push(`Sense descripció: ${code}`)
      continue
    }

    const qty = readFixedQty(rawCells)
    if (qty == null) {
      warnings.push(`Sense quantitat: ${code} - ${name}`)
      continue
    }

    lines.push({
      articleCode: code,
      articleName: name,
      family: articleCodePrefix(code),
      qtyInitial: qty,
      qtyUnit: readFixedUnit(rawCells),
    })
  }

  return { lines, dateRangeLabel }
}

export function mergeDuplicateErpLines(
  lines: ParsedErpLine[],
  warnings: string[] = []
): ParsedErpLine[] {
  const byKey = new Map<string, ParsedErpLine>()

  for (const line of lines) {
    const key = line.articleCode.toUpperCase()
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        ...line,
        family: articleCodePrefix(line.articleCode),
        qtyUnit: sanitizeQtyUnit(line.qtyUnit),
      })
      continue
    }
    if (normalizeKey(existing.articleName) !== normalizeKey(line.articleName)) {
      warnings.push(
        `Article ${line.articleCode} duplicat amb nom diferent; s'han sumat les quantitats.`
      )
    }
    if (existing.qtyUnit !== sanitizeQtyUnit(line.qtyUnit)) {
      warnings.push(
        `Article ${line.articleCode}: unitats diferents (${existing.qtyUnit} vs ${line.qtyUnit}); es manté ${existing.qtyUnit}.`
      )
    }
    existing.qtyInitial = roundQty(existing.qtyInitial + line.qtyInitial)
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const prefixCmp = compareCodePrefixes(a.family, b.family)
    if (prefixCmp !== 0) return prefixCmp
    return a.articleCode.localeCompare(b.articleCode)
  })
}

export function groupLinesByFamily(lines: ParsedErpLine[]): Record<string, ParsedErpLine[]> {
  const grouped: Record<string, ParsedErpLine[]> = {}
  for (const line of lines) {
    const family = line.family || articleCodePrefix(line.articleCode)
    grouped[family] ||= []
    grouped[family].push(line)
  }
  for (const family of Object.keys(grouped)) {
    grouped[family].sort((a, b) => a.articleCode.localeCompare(b.articleCode))
  }
  return grouped
}

export function parseErpExcelRows(rows: unknown[][]): ParseErpExcelResult {
  const warnings: string[] = []
  const { lines, dateRangeLabel } = parseFixedColumnRows(rows, warnings)

  if (lines.length === 0) {
    warnings.push(
      'No s\'han detectat línies vàlides. Esperat: codi (A), descripció (D), quantitat (O), unitat (R).'
    )
  }

  const mergedLines = mergeDuplicateErpLines(lines, warnings)
  const families = sortFamilies(Array.from(new Set(mergedLines.map((line) => line.family))))
  const totalQty = roundQty(mergedLines.reduce((sum, line) => sum + line.qtyInitial, 0))

  return {
    dateRangeLabel,
    families,
    lines: mergedLines,
    warnings,
    totalQty,
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
    '!merges'?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>
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

export async function parseErpExcelFile(file: File): Promise<ParseErpExcelResult> {
  const { loadXlsx } = await import('@/lib/loadXlsx')
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return {
      families: [],
      lines: [],
      warnings: ['El fitxer no conté cap full.'],
      totalQty: 0,
    }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = sheetToDisplayRows(sheet, {
    decode_range: XLSX.utils.decode_range,
    encode_cell: XLSX.utils.encode_cell,
    format_cell: XLSX.utils.format_cell,
  })
  return parseErpExcelRows(rows)
}
