/**
 * Analitza "Articles APP.xlsx" per import massiu (articles, magatzems, unitats).
 * Ús:
 *   node scripts/analyze-articles-app.mjs
 *   node scripts/analyze-articles-app.mjs "Articles APP.xlsx"
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import xlsx from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultFile = path.join(__dirname, '..', 'Articles APP.xlsx')
const inputPath = path.resolve(process.argv[2] || defaultFile)
const reportPath = path.join(__dirname, '..', 'Articles APP.analysis.json')

if (!fs.existsSync(inputPath)) {
  console.error('Fitxer no trobat:', inputPath)
  process.exit(1)
}

const wb = xlsx.readFile(inputPath, { cellNF: true, cellDates: true })
const report = {
  file: inputPath,
  sheets: [],
}

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')

const isProbablyHeaderRow = (row) => {
  const cells = row.map(normalize).filter(Boolean)
  if (cells.length < 2) return false
  const joined = cells.join(' ').toLowerCase()
  return /codi|article|artículo|descrip|magatz|almac|unit|compra|famil|grup/.test(joined)
}

const guessColumnMap = (headers) => {
  const map = {}
  headers.forEach((raw, index) => {
    const h = normalize(raw).toLowerCase()
    if (!h) return
    if (map.code == null && /^codi$/.test(h)) map.code = index
    if (map.name == null && /^nom$/.test(h)) map.name = index
    if (map.unit == null && /^(u\.compra|unitat|unit)/.test(h)) map.unit = index
    if (map.warehouse == null && /codi magatzem|codi almacen|warehouse code/.test(h)) {
      map.warehouse = index
    }
    if (map.group == null && /^grup$/.test(h)) map.group = index
    if (map.groupName == null && /nom grup magatzem/.test(h)) map.groupName = index
    if (map.family == null && /^familia$/.test(h)) map.family = index
    if (map.familyName == null && /nom familia/.test(h)) map.familyName = index
    if (map.subfamily == null && /codi subfamilia/.test(h)) map.subfamily = index
    if (map.subfamilyName == null && /nom subfamilia/.test(h)) map.subfamilyName = index
  })

  if (map.code == null) {
    headers.forEach((raw, index) => {
      const h = normalize(raw).toLowerCase()
      if (map.code == null && /^(codi|code|artículo|article|ref)/.test(h) && !/magatzem|almacen/.test(h)) {
        map.code = index
      }
    })
  }

  return map
}

for (const sheetName of wb.SheetNames) {
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  const nonEmptyRows = rows.filter((row) => row.some((cell) => normalize(cell)))
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(10, nonEmptyRows.length); i += 1) {
    if (isProbablyHeaderRow(nonEmptyRows[i])) {
      headerRowIndex = i
      break
    }
  }

  const headers = (nonEmptyRows[headerRowIndex] || []).map(normalize)
  const dataRows = nonEmptyRows.slice(headerRowIndex + 1)
  const colMap = guessColumnMap(headers)

  const codes = []
  const warehouses = new Set()
  const units = new Set()
  const groups = new Set()
  const families = new Set()
  const subfamilies = new Set()
  const duplicateCodes = new Map()
  let emptyCodes = 0
  let emptyNames = 0

  for (const row of dataRows) {
    const code = colMap.code != null ? normalize(row[colMap.code]).toUpperCase() : ''
    const name = colMap.name != null ? normalize(row[colMap.name]) : ''
    const warehouse = colMap.warehouse != null ? normalize(row[colMap.warehouse]).toUpperCase() : ''
    const unit = colMap.unit != null ? normalize(row[colMap.unit]).toUpperCase() : ''
    const group = colMap.group != null ? normalize(row[colMap.group]).toUpperCase() : ''
    const family = colMap.family != null ? normalize(row[colMap.family]).toUpperCase() : ''
    const subfamily =
      colMap.subfamily != null ? normalize(row[colMap.subfamily]).toUpperCase() : ''

    if (!code) emptyCodes += 1
    else {
      codes.push(code)
      duplicateCodes.set(code, (duplicateCodes.get(code) || 0) + 1)
    }
    if (!name) emptyNames += 1
    if (warehouse) warehouses.add(warehouse)
    if (unit) units.add(unit)
    if (group) groups.add(group)
    if (family) families.add(family)
    if (subfamily) subfamilies.add(subfamily)
  }

  const dupList = [...duplicateCodes.entries()]
    .filter(([, count]) => count > 1)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  report.sheets.push({
    name: sheetName,
    totalRows: rows.length,
    nonEmptyRows: nonEmptyRows.length,
    headerRowIndex: headerRowIndex + 1,
    headers,
    guessedColumns: colMap,
    dataRowCount: dataRows.length,
    sampleRows: dataRows.slice(0, 15).map((row) => ({
      code: colMap.code != null ? normalize(row[colMap.code]) : null,
      name: colMap.name != null ? normalize(row[colMap.name]) : null,
      warehouse: colMap.warehouse != null ? normalize(row[colMap.warehouse]) : null,
      unit: colMap.unit != null ? normalize(row[colMap.unit]) : null,
      group: colMap.group != null ? normalize(row[colMap.group]) : null,
      groupName: colMap.groupName != null ? normalize(row[colMap.groupName]) : null,
      family: colMap.family != null ? normalize(row[colMap.family]) : null,
      familyName: colMap.familyName != null ? normalize(row[colMap.familyName]) : null,
      subfamily: colMap.subfamily != null ? normalize(row[colMap.subfamily]) : null,
      subfamilyName: colMap.subfamilyName != null ? normalize(row[colMap.subfamilyName]) : null,
      raw: row.map(normalize),
    })),
    stats: {
      uniqueCodes: new Set(codes).size,
      emptyCodes,
      emptyNames,
      duplicateCodeCount: dupList.length,
      topDuplicates: dupList,
    },
    uniqueWarehouses: [...warehouses].sort().slice(0, 50),
    uniqueUnits: [...units].sort().slice(0, 50),
    uniqueGroups: [...groups].sort().slice(0, 50),
    uniqueFamilies: [...families].sort().slice(0, 50),
    uniqueSubfamilies: [...subfamilies].sort().slice(0, 50),
    warehouseCount: warehouses.size,
    unitCount: units.size,
    groupCount: groups.size,
    familyCount: families.size,
    subfamilyCount: subfamilies.size,
  })
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
console.error('\nInforme guardat a:', reportPath)
