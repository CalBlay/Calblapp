import { loadXlsx } from '@/lib/loadXlsx'
import type { ParsedImportRow } from './types'
import { normalize, slugify } from './utils'

const GROUP_BY_SHEET: Record<string, string> = {
  'aperitius okay x enviar 13 05': 'Plat Esdeveniments',
  'cuina del felix': 'Plat Cuina Felix',
  'barquetes ametller': 'Plat Ametller',
}

const TYPE_LABEL_NORMALIZERS: Record<string, string> = {
  snack: 'SNACKS',
  snacks: 'SNACKS',
}

const IMPORT_ALLERGEN_HEADERS: Record<string, string> = {
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

const findColumnIndex = (headers: string[], candidates: string[]) => {
  for (const candidate of candidates) {
    const idx = headers.findIndex(
      header => header === candidate || header.startsWith(candidate)
    )
    if (idx >= 0) return idx
  }
  return -1
}

const inferHeaderRowIndex = (rows: string[][]) =>
  rows.findIndex(row => {
    const normalizedRow = row.map(cell => normalize(String(cell || '')))
    const allergenCount = normalizedRow.filter(cell => IMPORT_ALLERGEN_HEADERS[cell]).length
    const hasCode = normalizedRow.some(cell => cell === 'num codi' || cell === 'codi')
    const hasName = normalizedRow.some(cell =>
      ['referencies', 'articles', 'article'].some(candidate => cell.startsWith(candidate))
    )
    return allergenCount >= 4 && hasCode && hasName
  })

const normalizeTypeLabel = (value: string) => {
  const raw = value.trim()
  if (!raw || raw === '-') return ''
  return TYPE_LABEL_NORMALIZERS[normalize(raw)] || raw
}

const getGroupLabelForSheet = (sheetKey: string) =>
  GROUP_BY_SHEET[normalize(sheetKey)] || sheetKey.trim()

const isMarkedMenuCell = (value: string) => {
  const raw = normalize(value)
  return raw === 'x' || raw === 'si' || raw === 's'
}

const parseAptImport = (value: string) => {
  const raw = normalize(value)
  if (!raw) return null
  if (raw.includes('no apte')) return false
  if (raw.includes('apte')) return true
  return null
}

const parseAllergenImportValue = (value: string) => {
  const raw = value.trim().toUpperCase()
  if (!raw) return null
  if (raw.startsWith('S')) return 'SI'
  if (raw.startsWith('N')) return 'NO'
  if (raw.startsWith('T')) return 'T'
  return null
}

export async function parseImportWorkbook(file: File) {
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const parsedRows: ParsedImportRow[] = []
  const categoryMap = new Map<string, string>()
  const familyMap = new Map<string, string>()
  const menuMap = new Map<string, string>()

  for (const sheetKey of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetKey]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as string[][]

    const headerRowIndex = inferHeaderRowIndex(rows)
    if (headerRowIndex === -1) continue

    const headers = (rows[headerRowIndex] || []).map(cell => normalize(String(cell || '')))
    const cols = {
      code: findColumnIndex(headers, ['num codi', 'codi']),
      nameCa: findColumnIndex(headers, ['referencies', 'articles', 'article']),
      type: findColumnIndex(headers, ['tipus']),
      vegetarian: findColumnIndex(headers, ['vegetaria']),
      vegan: findColumnIndex(headers, ['vega']),
      nameEs: findColumnIndex(headers, ['esp']),
      nameEn: findColumnIndex(headers, ['eng']),
    }
    if (cols.code === -1 || cols.nameCa === -1) continue

    const allergenCols: Record<string, number> = {}
    headers.forEach((header, index) => {
      const key = IMPORT_ALLERGEN_HEADERS[header]
      if (key) allergenCols[key] = index
    })

    const topHeaders = rows[0] || []
    const menuHeaders = rows[1] || []
    const typeCol = findColumnIndex(topHeaders.map(cell => normalize(String(cell || ''))), ['tipus'])
    const startIndex = typeCol >= 0 ? typeCol + 17 : 19
    const menuColumns: Array<{ index: number; label: string }> = []
    if (headerRowIndex === 0 && rows.length >= 2) {
      for (let index = startIndex; index < menuHeaders.length; index++) {
        const label = String(menuHeaders[index] || '').trim()
        if (!label || label === 'ESP' || label === 'ENG') continue
        menuColumns.push({ index, label })
      }
    }

    const familyLabel = getGroupLabelForSheet(sheetKey)
    const familyId = slugify(familyLabel)
    if (familyId) familyMap.set(familyId, familyLabel)

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || []
      const code = String(row[cols.code] || '').trim()
      const nameCa = String(row[cols.nameCa] || '').trim()
      if (!code || !nameCa) continue

      const typeLabel = cols.type >= 0 ? normalizeTypeLabel(String(row[cols.type] || '')) : ''
      const categoryId = typeLabel ? slugify(typeLabel) : ''
      if (categoryId) categoryMap.set(categoryId, typeLabel)

      const menus = menuColumns
        .filter(({ index }) => isMarkedMenuCell(String(row[index] || '')))
        .map(({ label }) => label)
      menus.forEach(menu => menuMap.set(menu, menu))

      const allergens: Record<string, string | null> = {}
      Object.entries(allergenCols).forEach(([key, index]) => {
        allergens[key] = parseAllergenImportValue(String(row[index] || ''))
      })

      const vegan = parseAptImport(String(cols.vegan >= 0 ? row[cols.vegan] || '' : ''))
      let vegetarian = parseAptImport(String(cols.vegetarian >= 0 ? row[cols.vegetarian] || '' : ''))
      if (vegan === true) vegetarian = true

      parsedRows.push({
        code,
        nameCa,
        rowIndex: rowIndex + 1,
        sheetKey,
        data: {
          code,
          name: {
            ca: nameCa,
            es: cols.nameEs >= 0 ? String(row[cols.nameEs] || '').trim() || null : null,
            en: cols.nameEn >= 0 ? String(row[cols.nameEn] || '').trim() || null : null,
          },
          nameMeta: {},
          category: categoryId || null,
          categoryLabel: typeLabel || null,
          family: familyId || null,
          familyLabel: familyLabel || null,
          menus,
          onEstanRaw: menus.length ? menus.join(' | ') : null,
          allergens,
          consumption: {
            vegan: vegan ?? null,
            vegetarian: vegetarian ?? null,
          },
          importSource: file.name,
          importSheet: sheetKey,
          updatedAt: Date.now(),
        },
      })
    }
  }

  return { parsedRows, categoryMap, familyMap, menuMap }
}
