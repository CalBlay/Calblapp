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

export const inferHeaderRowIndex = (rows: string[][]) =>
  rows.findIndex(row => {
    const normalizedRow = row.map(cell => normalize(String(cell || '')))
    const allergenCount = normalizedRow.filter(cell => IMPORT_ALLERGEN_HEADERS[cell]).length
    const hasCode = normalizedRow.some(
      cell => cell === 'num codi' || cell === 'codi' || cell.startsWith('num codi')
    )
    const hasName = normalizedRow.some(cell =>
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

  const labelRowCandidates = [headerRowIndex + 1, headerRowIndex]
  if (headerRowIndex > 0) labelRowCandidates.push(headerRowIndex - 1)

  for (const labelRowIndex of labelRowCandidates) {
    if (labelRowIndex < 0 || labelRowIndex >= rows.length) continue
    const menuHeaders = rows[labelRowIndex] || []
    const columns: Array<{ index: number; label: string }> = []

    for (let index = startIndex; index < maxColumns; index++) {
      if (skipIndices.has(index)) continue
      const label = String(menuHeaders[index] || '').trim()
      if (!label || isTranslationHeader(label)) continue
      if (IMPORT_ALLERGEN_HEADERS[normalize(label)]) continue
      columns.push({ index, label })
    }

    if (columns.length >= 1) return columns
  }

  return []
}
