export const GROUP_BY_SHEET: Record<string, string> = {
  'aperitius okay x enviar 13 05': 'Plat Esdeveniments',
  'cuina del felix': 'Plat Cuina Felix',
  'barquetes ametller': 'Plat Ametller',
}

export const TYPE_LABEL_NORMALIZERS: Record<string, string> = {
  snack: 'SNACKS',
  snacks: 'SNACKS',
}

export const IMPORT_ALLERGEN_HEADERS: Record<string, string> = {
  gluten: 'gluten',
  crustacis: 'crustacis',
  ou: 'ou',
  peix: 'peix',
  cacauet: 'cacauet',
  soja: 'soja',
  lactosa: 'lactosa',
  'fruits secs': 'fruitsSecs',
  api: 'api',
  mostassa: 'mostassa',
  sesam: 'sesam',
  sulfits: 'sulfits',
  tramus: 'tramus',
  moluscs: 'moluscs',
  'mol luscs': 'moluscs',
}

const TRANSLATION_ES_CANDIDATES = ['esp', 'castella', 'castellano', 'cast', 'spanish']
const TRANSLATION_EN_CANDIDATES = ['ang', 'eng', 'angles', 'english']

export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()

export const findColumnIndex = (headers: string[], candidates: string[]) => {
  const exactIdx = headers.findIndex(header => candidates.includes(header))
  if (exactIdx >= 0) return exactIdx

  for (const candidate of candidates) {
    const idx = headers.findIndex(
      header => header === candidate || header.startsWith(candidate)
    )
    if (idx >= 0) return idx
  }
  return -1
}

export const findColumnIndexIncludes = (headers: string[], needles: string[]) => {
  const idx = headers.findIndex(header => needles.every(needle => header.includes(needle)))
  return idx >= 0 ? idx : -1
}

export const resolveHeaderCells = (rows: string[][], headerRowIndex: number) => {
  const currentRow = rows[headerRowIndex] || []
  const previousRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] || [] : []
  const columnCount = Math.max(currentRow.length, previousRow.length)

  return Array.from({ length: columnCount }, (_, index) => {
    const current = String(currentRow[index] || '').trim()
    const previous = String(previousRow[index] || '').trim()
    return normalize(current || previous)
  })
}

const looksLikeProductCode = (value: string) => {
  const raw = value.trim()
  if (!raw || !/\d/.test(raw)) return false
  return /^[a-z0-9][a-z0-9.'/_-]{4,}$/i.test(raw)
}

export const resolveCodeColumn = (
  rows: string[][],
  headerRowIndex: number,
  headers = (rows[headerRowIndex] || []).map(cell => normalize(String(cell || '')))
) => {
  const explicitColumn = findColumnIndex(headers, ['num codi', 'codi'])
  if (explicitColumn >= 0) return explicitColumn

  // Some supplier sheets leave the code header blank (for example PLATS BANQUET),
  // while the adjacent name column is correctly labelled. In that layout, infer
  // the code column from code-shaped values immediately below the header.
  const nameColumn = findColumnIndex(headers, ['referencies', 'articles', 'article'])
  if (nameColumn <= 0) return -1

  let bestColumn = -1
  let bestMatches = 0
  const lastRow = Math.min(rows.length, headerRowIndex + 26)

  for (let column = 0; column < nameColumn; column++) {
    let nonEmpty = 0
    let matches = 0

    for (let rowIndex = headerRowIndex + 1; rowIndex < lastRow; rowIndex++) {
      const value = String(rows[rowIndex]?.[column] || '').trim()
      if (!value) continue
      nonEmpty++
      if (looksLikeProductCode(value)) matches++
    }

    if (matches > 0 && matches / nonEmpty >= 0.7 && matches > bestMatches) {
      bestColumn = column
      bestMatches = matches
    }
  }

  return bestColumn
}

export const inferHeaderRowIndex = (rows: string[][]) =>
  rows.findIndex((_row, rowIndex) => {
    const headers = resolveHeaderCells(rows, rowIndex)
    const allergenCount = headers.filter(cell => IMPORT_ALLERGEN_HEADERS[cell]).length
    const hasCode = resolveCodeColumn(rows, rowIndex, headers) >= 0
    const hasName = headers.some(cell =>
      ['referencies', 'articles', 'article'].some(candidate => cell.startsWith(candidate))
    )
    return allergenCount >= 4 && hasCode && hasName
  })

export const normalizeTypeLabel = (value: string) => {
  const raw = value.trim()
  if (!raw || raw === '-') return ''
  return TYPE_LABEL_NORMALIZERS[normalize(raw)] || raw
}

export const getGroupLabelForSheet = (sheetKey: string) =>
  GROUP_BY_SHEET[normalize(sheetKey)] || sheetKey.trim()

export const isMarkedMenuCell = (value: string) => {
  const raw = normalize(value)
  return raw === 'x' || raw === 'si' || raw === 's' || raw === '1' || raw === 'true'
}

export const findOnEstanColumn = (headers: string[]) => {
  const phraseNeedles: string[][] = [
    ['menus', 'troben'],
    ['menus', 'estan'],
    ['menu', 'troben'],
    ['on', 'troben'],
  ]
  for (const needles of phraseNeedles) {
    const byPhrase = findColumnIndexIncludes(headers, needles)
    if (byPhrase >= 0) return byPhrase
  }

  return findColumnIndex(headers, [
    'menus on es troben',
    'menus on estan',
    'on es troben',
    'on estan',
    'on son',
    'on sonen',
  ])
}

export const parseMenusFromRawText = (value: string) => {
  const raw = value.trim()
  if (!raw) return []

  const menus = new Set<string>()
  raw.split(/[|,;]+/).forEach(part => {
    const label = part.trim()
    if (label) menus.add(label)
  })

  return Array.from(menus)
}

export const parseAptImport = (value: string) => {
  const raw = normalize(value)
  if (!raw) return null
  if (raw.includes('no apte')) return false
  if (raw.includes('apte')) return true
  return null
}

export const parseAllergenImportValue = (value: string) => {
  const raw = value.trim().toUpperCase()
  if (!raw) return null
  if (raw.startsWith('S')) return 'SI'
  if (raw.startsWith('N')) return 'NO'
  if (raw.startsWith('T')) return 'T'
  return null
}

const isTranslationHeader = (label: string) => {
  const key = normalize(label)
  return (
    TRANSLATION_ES_CANDIDATES.includes(key) || TRANSLATION_EN_CANDIDATES.includes(key)
  )
}

const looksLikeMenuLabel = (label: string) => {
  const trimmed = String(label || '').trim()
  if (!trimmed) return false

  const normalized = normalize(trimmed)
  if (!normalized) return false

  if (isMarkedMenuCell(trimmed)) return false
  if (normalized === 'si' || normalized === 'no' || normalized === 't') return false
  if (normalized === 'apte' || normalized === 'no apte') return false
  if (IMPORT_ALLERGEN_HEADERS[normalized]) return false
  if (isTranslationHeader(trimmed)) return false

  return /[a-z]/i.test(trimmed)
}

export const resolveTranslationColumns = (rows: string[][], headerRowIndex: number) => {
  const headerCells = (rows[headerRowIndex] || []).map(cell => normalize(String(cell || '')))
  let nameEs = findColumnIndex(headerCells, TRANSLATION_ES_CANDIDATES)
  let nameEn = findColumnIndex(headerCells, TRANSLATION_EN_CANDIDATES)

  const subHeaderRows = [headerRowIndex + 1, headerRowIndex - 1].filter(
    index => index >= 0 && index < rows.length && index !== headerRowIndex
  )

  for (const rowIndex of subHeaderRows) {
    const cells = (rows[rowIndex] || []).map(cell => normalize(String(cell || '')))
    if (nameEs < 0) nameEs = findColumnIndex(cells, TRANSLATION_ES_CANDIDATES)
    if (nameEn < 0) nameEn = findColumnIndex(cells, TRANSLATION_EN_CANDIDATES)
    if (nameEs >= 0 && nameEn >= 0) break
  }

  return { nameEs, nameEn }
}

export const buildMenuColumns = (
  rows: string[][],
  headerRowIndex: number,
  headers: string[],
  allergenCols: Record<string, number>
): Array<{ index: number; label: string }> => {
  if (rows.length < 2) return []

  const typeCol = findColumnIndex(headers, ['tipus'])
  const vegetarianCol = findColumnIndex(headers, ['vegetaria'])
  const veganCol = findColumnIndex(headers, ['vega'])
  const translationCols = resolveTranslationColumns(rows, headerRowIndex)

  const skipIndices = new Set<number>()
  ;[
    findColumnIndex(headers, ['num codi', 'codi']),
    findColumnIndex(headers, ['referencies', 'articles', 'article']),
    typeCol,
    vegetarianCol,
    veganCol,
    translationCols.nameEs,
    translationCols.nameEn,
    findOnEstanColumn(headers),
    ...Object.values(allergenCols),
  ].forEach(index => {
    if (index >= 0) skipIndices.add(index)
  })

  let startIndex = -1
  if (veganCol >= 0) startIndex = veganCol + 1
  else if (vegetarianCol >= 0) startIndex = vegetarianCol + 1

  if (startIndex < 0) {
    const allergenIndices = Object.values(allergenCols)
    if (allergenIndices.length) {
      startIndex = Math.max(...allergenIndices) + 1
    } else {
      startIndex = typeCol >= 0 ? typeCol + 17 : 19
    }
  }

  const maxColumns = Math.max(
    headers.length,
    ...rows.slice(0, Math.min(rows.length, headerRowIndex + 3)).map(row => row.length)
  )

  const labelRowCandidates = [headerRowIndex]
  if (headerRowIndex > 0) labelRowCandidates.push(headerRowIndex - 1)
  if (headerRowIndex + 1 < rows.length) labelRowCandidates.push(headerRowIndex + 1)

  for (const labelRowIndex of labelRowCandidates) {
    if (labelRowIndex < 0 || labelRowIndex >= rows.length) continue
    const menuHeaders = rows[labelRowIndex] || []
    const columns: Array<{ index: number; label: string }> = []

    for (let index = startIndex; index < maxColumns; index++) {
      if (skipIndices.has(index)) continue
      const label = String(menuHeaders[index] || '').trim()
      if (!looksLikeMenuLabel(label)) continue
      columns.push({ index, label })
    }

    if (columns.length >= 2) return columns
  }

  return []
}
