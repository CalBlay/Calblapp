import { loadXlsx } from '@/lib/loadXlsx'
import type { ParsedImportRow } from './types'
import {
  buildMenuColumns,
  getGroupLabelForSheet,
  inferHeaderRowIndex,
  isMarkedMenuCell,
  normalize,
  normalizeTypeLabel,
  parseAllergenImportValue,
  parseAptImport,
  resolveTranslationColumns,
  IMPORT_ALLERGEN_HEADERS,
  findColumnIndex,
  findOnEstanColumn,
  parseMenusFromRawText,
} from './importWorkbookParse'
import { slugify } from './utils'

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
    const translationCols = resolveTranslationColumns(rows, headerRowIndex)
    const cols = {
      code: findColumnIndex(headers, ['num codi', 'codi']),
      nameCa: findColumnIndex(headers, ['referencies', 'articles', 'article']),
      type: findColumnIndex(headers, ['tipus']),
      vegetarian: findColumnIndex(headers, ['vegetaria']),
      vegan: findColumnIndex(headers, ['vega']),
      nameEs: translationCols.nameEs,
      nameEn: translationCols.nameEn,
    }
    if (cols.code === -1 || cols.nameCa === -1) continue

    const allergenCols: Record<string, number> = {}
    headers.forEach((header, index) => {
      const key = IMPORT_ALLERGEN_HEADERS[header]
      if (key) allergenCols[key] = index
    })

    const onEstanCol = findOnEstanColumn(headers)
    const menuColumns =
      onEstanCol >= 0
        ? []
        : buildMenuColumns(rows, headerRowIndex, headers, allergenCols)

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

      const menusFromMarks = menuColumns
        .filter(({ index }) => isMarkedMenuCell(String(row[index] || '')))
        .map(({ label }) => label)
      const menuText = onEstanCol >= 0 ? String(row[onEstanCol] || '').trim() : ''
      const menusFromText = parseMenusFromRawText(menuText)
      const menus = Array.from(new Set([...menusFromMarks, ...menusFromText]))
      menus.forEach(menu => menuMap.set(menu, menu))

      const allergens: Record<string, string | null> = {}
      Object.entries(allergenCols).forEach(([key, index]) => {
        allergens[key] = parseAllergenImportValue(String(row[index] || ''))
      })

      const vegan = parseAptImport(String(cols.vegan >= 0 ? row[cols.vegan] || '' : ''))
      let vegetarian = parseAptImport(
        String(cols.vegetarian >= 0 ? row[cols.vegetarian] || '' : '')
      )
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
          onEstanRaw: menuText || (menus.length ? menus.join(' | ') : null),
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
