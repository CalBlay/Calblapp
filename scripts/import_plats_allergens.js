// Import dishes (plats) from the current allergens Excel into Firestore.
// Usage:
//   node scripts/import_plats_allergens.js [path-to-xlsx] [--sheet SHEET_NAME]
//     [--dry-run] [--replace-all] [--update-existing]
//     [--report-file path-to-json]

const admin = require("firebase-admin")
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const xlsx = require("xlsx")

const DEFAULT_FILE = path.join(__dirname, "..", "BIBLIO AL·LÈRGENS.xlsx")
const DEFAULT_ALLERGENS = [
  { key: "gluten", label: "Gluten" },
  { key: "crustacis", label: "Crustacis" },
  { key: "ou", label: "Ou" },
  { key: "peix", label: "Peix" },
  { key: "cacauet", label: "Cacauet" },
  { key: "soja", label: "Soja" },
  { key: "lactosa", label: "Lactosa" },
  { key: "fruitsSecs", label: "Fruits secs" },
  { key: "api", label: "Api" },
  { key: "mostassa", label: "Mostassa" },
  { key: "sesam", label: "Sesam" },
  { key: "sulfits", label: "Sulfits" },
  { key: "tramus", label: "Tramus" },
  { key: "moluscs", label: "Mol·luscs" },
]

const GROUP_BY_SHEET = {
  "aperitius okay x enviar 13 05": "Plat Esdeveniments",
  "cuina del felix": "Plat Cuina Felix",
  "barquetes ametller": "Plat Ametller",
}

const TYPE_LABEL_NORMALIZERS = {
  snack: "SNACKS",
  snacks: "SNACKS",
}

const ALLERGEN_HEADERS = {
  gluten: "gluten",
  crustacis: "crustacis",
  ou: "ou",
  peix: "peix",
  cacauet: "cacauet",
  soja: "soja",
  lactosa: "lactosa",
  "fruits secs": "fruitsSecs",
  api: "api",
  mostassa: "mostassa",
  sesam: "sesam",
  sulfits: "sulfits",
  tramus: "tramus",
  moluscs: "moluscs",
  "mol luscs": "moluscs",
}

const args = process.argv.slice(2)
let filePath = DEFAULT_FILE
let sheetName = null
let dryRun = false
let replaceAll = false
let updateExisting = false
let reportFile = null

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--sheet" && args[i + 1]) {
    sheetName = args[i + 1]
    i++
    continue
  }
  if (arg === "--dry-run") {
    dryRun = true
    continue
  }
  if (arg === "--replace-all") {
    replaceAll = true
    continue
  }
  if (arg === "--update-existing") {
    updateExisting = true
    continue
  }
  if (arg === "--report-file" && args[i + 1]) {
    reportFile = args[i + 1]
    i++
    continue
  }
  if (!arg.startsWith("--")) {
    filePath = arg
  }
}

if (!path.isAbsolute(filePath)) {
  filePath = path.resolve(process.cwd(), filePath)
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json")
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Missing service account: ${serviceAccountPath}`)
  process.exit(1)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

const normalize = (value) =>
  value
    ?.toString()
    ?.normalize("NFD")
    ?.replace(/[\u0300-\u036f]/g, "")
    ?.replace(/[^a-zA-Z0-9]+/g, " ")
    ?.replace(/\s+/g, " ")
    ?.trim()
    ?.toLowerCase() || ""

const slugify = (value) => normalize(value).replace(/\s+/g, "-")
const toString = (value) => (value == null ? "" : String(value)).trim()

const parseAllergenValue = (value) => {
  const raw = toString(value).toUpperCase()
  if (!raw) return null
  if (raw.startsWith("S")) return "SI"
  if (raw.startsWith("N")) return "NO"
  if (raw.startsWith("T")) return "T"
  return null
}

const parseApt = (value) => {
  const raw = normalize(value)
  if (!raw) return null
  if (raw.includes("no apte")) return false
  if (raw.includes("apte")) return true
  return null
}

const isMarkedMenuCell = (value) => {
  const raw = normalize(value)
  return raw === "x" || raw === "si" || raw === "s" || raw === "1" || raw === "true"
}

const findColumnIndexIncludes = (headers, needlesList) => {
  const idx = headers.findIndex((header) =>
    needlesList.every((needle) => header.includes(needle))
  )
  return idx >= 0 ? idx : -1
}

const findOnEstanColumn = (headers) => {
  const byPhrase = findColumnIndexIncludes(headers, [
    ["menus", "troben"],
    ["menus", "estan"],
    ["menu", "troben"],
    ["on", "troben"],
  ])
  if (byPhrase >= 0) return byPhrase

  return findColumnIndex(headers, [
    "menus on es troben",
    "menus on estan",
    "on es troben",
    "on estan",
    "on son",
    "on sonen",
  ])
}

const parseMenusFromRawText = (value) => {
  const raw = toString(value)
  if (!raw) return []
  const menus = new Set()
  raw.split(/[|,;]+/).forEach((part) => {
    const label = part.trim()
    if (label) menus.add(label)
  })
  return Array.from(menus)
}

const getGroupLabelForSheet = (sheetKey) => {
  const normalizedSheet = normalize(sheetKey)
  return GROUP_BY_SHEET[normalizedSheet] || toString(sheetKey)
}

const normalizeTypeLabel = (value) => {
  const raw = toString(value)
  if (!raw) return ""

  const normalizedType = normalize(raw)
  const mappedLabel = TYPE_LABEL_NORMALIZERS[normalizedType]
  if (mappedLabel) return mappedLabel
  if (raw === "-") return ""
  return raw
}

const toConflictId = (code) => `${slugify(code)}`

const resolveReportPath = (targetPath) => {
  if (!targetPath) return null
  if (path.isAbsolute(targetPath)) return targetPath
  return path.resolve(process.cwd(), targetPath)
}

const findColumnIndex = (headers, candidates) => {
  const exactIdx = headers.findIndex((header) => candidates.includes(header))
  if (exactIdx >= 0) return exactIdx

  for (const candidate of candidates) {
    const idx = headers.findIndex(
      (header) => header === candidate || header.startsWith(candidate)
    )
    if (idx >= 0) return idx
  }
  return -1
}

const TRANSLATION_ES_CANDIDATES = ["esp", "castella", "castellano", "cast", "spanish"]
const TRANSLATION_EN_CANDIDATES = ["ang", "eng", "angles", "english"]

const inferHeaderRowIndex = (rows) =>
  rows.findIndex((row) => {
    const normalizedRow = row.map((cell) => normalize(cell))
    const allergenCount = normalizedRow.filter((cell) => ALLERGEN_HEADERS[cell]).length
    const hasCode = normalizedRow.some(
      (cell) => cell === "num codi" || cell === "codi" || cell.startsWith("num codi")
    )
    const hasName = normalizedRow.some((cell) =>
      ["referencies", "articles", "article"].some((candidate) => cell.startsWith(candidate))
    )
    return allergenCount >= 4 && hasCode && hasName
  })

const isTranslationHeader = (label) => {
  const key = normalize(label)
  return (
    TRANSLATION_ES_CANDIDATES.includes(key) || TRANSLATION_EN_CANDIDATES.includes(key)
  )
}

const resolveTranslationColumns = (rows, headerRowIndex) => {
  const headerCells = (rows[headerRowIndex] || []).map((cell) => normalize(cell))
  let nameEs = findColumnIndex(headerCells, TRANSLATION_ES_CANDIDATES)
  let nameEn = findColumnIndex(headerCells, TRANSLATION_EN_CANDIDATES)

  const subHeaderRows = [headerRowIndex + 1, headerRowIndex - 1].filter(
    (index) => index >= 0 && index < rows.length && index !== headerRowIndex
  )

  for (const rowIndex of subHeaderRows) {
    const cells = (rows[rowIndex] || []).map((cell) => normalize(cell))
    if (nameEs < 0) nameEs = findColumnIndex(cells, TRANSLATION_ES_CANDIDATES)
    if (nameEn < 0) nameEn = findColumnIndex(cells, TRANSLATION_EN_CANDIDATES)
    if (nameEs >= 0 && nameEn >= 0) break
  }

  return { nameEs, nameEn }
}

const buildMenuColumns = (sheetKey, rows, headerRowIndex, headers, allergenCols) => {
  if (rows.length < 2) return []

  const typeCol = findColumnIndex(headers, ["tipus"])
  const vegetarianCol = findColumnIndex(headers, ["vegetaria"])
  const veganCol = findColumnIndex(headers, ["vega"])
  const translationCols = resolveTranslationColumns(rows, headerRowIndex)

  const skipIndices = new Set()
  ;[
    findColumnIndex(headers, ["num codi", "codi"]),
    findColumnIndex(headers, ["referencies", "articles", "article"]),
    typeCol,
    vegetarianCol,
    veganCol,
    translationCols.nameEs,
    translationCols.nameEn,
    findOnEstanColumn(headers),
    ...Object.values(allergenCols),
  ].forEach((index) => {
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
    ...rows.slice(0, Math.min(rows.length, headerRowIndex + 3)).map((row) => row.length)
  )

  const labelRowCandidates = [headerRowIndex + 1, headerRowIndex]
  if (headerRowIndex > 0) labelRowCandidates.push(headerRowIndex - 1)

  for (const labelRowIndex of labelRowCandidates) {
    if (labelRowIndex < 0 || labelRowIndex >= rows.length) continue
    const menuHeaders = rows[labelRowIndex] || []
    const columns = []

    for (let index = startIndex; index < maxColumns; index++) {
      if (skipIndices.has(index)) continue
      const label = toString(menuHeaders[index])
      if (!label || isTranslationHeader(label)) continue
      if (ALLERGEN_HEADERS[normalize(label)]) continue
      columns.push({ index, label })
    }

    if (columns.length >= 1) return columns
  }

  if (normalize(sheetKey).includes("aperitius")) {
    console.warn(`No menu columns detected in sheet '${sheetKey}'.`)
  }

  return []
}

const parseRows = (workbook, selectedSheetName) => {
  const sheetNames = selectedSheetName ? [selectedSheetName] : workbook.SheetNames.slice()
  const parsedRows = []
  const parseIssues = []
  const typeCatalog = new Map()
  const groupCatalog = new Map()
  const menuCatalog = new Map()

  for (const sheetKey of sheetNames) {
    const sheet = workbook.Sheets[sheetKey]
    if (!sheet) {
      parseIssues.push({ sheetKey, reason: "missing-sheet" })
      continue
    }

    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    })
    const headerRowIndex = inferHeaderRowIndex(rows)
    if (headerRowIndex === -1) {
      parseIssues.push({ sheetKey, reason: "missing-header" })
      continue
    }

    const headers = (rows[headerRowIndex] || []).map((cell) => normalize(cell))
    const translationCols = resolveTranslationColumns(rows, headerRowIndex)
    const cols = {
      code: findColumnIndex(headers, ["num codi", "codi"]),
      nameCa: findColumnIndex(headers, ["referencies", "articles", "article"]),
      type: findColumnIndex(headers, ["tipus"]),
      vegetarian: findColumnIndex(headers, ["vegetaria"]),
      vegan: findColumnIndex(headers, ["vega"]),
      nameEs: translationCols.nameEs,
      nameEn: translationCols.nameEn,
    }

    if (cols.code === -1 || cols.nameCa === -1) {
      parseIssues.push({ sheetKey, reason: "missing-required-columns" })
      continue
    }

    const allergenCols = {}
    headers.forEach((header, index) => {
      const key = ALLERGEN_HEADERS[header]
      if (key) allergenCols[key] = index
    })

    const onEstanCol = findOnEstanColumn(headers)
    const menuColumns =
      onEstanCol >= 0
        ? []
        : buildMenuColumns(sheetKey, rows, headerRowIndex, headers, allergenCols)
    const groupLabel = getGroupLabelForSheet(sheetKey)
    const groupId = slugify(groupLabel)
    if (groupId) {
      groupCatalog.set(groupId, groupLabel)
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex]
      if (!row || row.every((cell) => !toString(cell))) continue

      const code = toString(row[cols.code])
      const nameCa = toString(row[cols.nameCa])
      if (!code || !nameCa) continue

      const typeLabel = cols.type >= 0 ? normalizeTypeLabel(row[cols.type]) : ""
      const typeId = typeLabel ? slugify(typeLabel) : null
      if (typeId) {
        typeCatalog.set(typeId, typeLabel)
      }

      const menusFromMarks = menuColumns
        .filter(({ index }) => isMarkedMenuCell(row[index]))
        .map(({ label }) => label)
      const menuText = onEstanCol >= 0 ? toString(row[onEstanCol]) : ""
      const menusFromText = parseMenusFromRawText(menuText)
      const menus = Array.from(new Set([...menusFromMarks, ...menusFromText]))
      menus.forEach((label) => menuCatalog.set(label, label))

      const allergens = {}
      Object.entries(allergenCols).forEach(([key, index]) => {
        allergens[key] = parseAllergenValue(row[index])
      })

      const vegan = parseApt(cols.vegan >= 0 ? row[cols.vegan] : null)
      let vegetarian = parseApt(cols.vegetarian >= 0 ? row[cols.vegetarian] : null)
      if (vegan === true) vegetarian = true

      parsedRows.push({
        code,
        rowIndex: rowIndex + 1,
        sheetKey,
        nameCa,
        data: {
          code,
          name: {
            ca: nameCa,
            es: cols.nameEs >= 0 ? toString(row[cols.nameEs]) || null : null,
            en: cols.nameEn >= 0 ? toString(row[cols.nameEn]) || null : null,
          },
          nameMeta: {},
          category: typeId,
          categoryLabel: typeLabel || null,
          family: groupId || null,
          familyLabel: groupLabel || null,
          menus,
          onEstanRaw: menuText || (menus.length ? menus.join(" | ") : null),
          allergens,
          consumption: {
            vegan: vegan ?? null,
            vegetarian: vegetarian ?? null,
          },
          importSource: path.basename(filePath),
          importSheet: sheetKey,
          updatedAt: Date.now(),
        },
      })
    }
  }

  return { parsedRows, parseIssues, typeCatalog, groupCatalog, menuCatalog }
}

const buildConflictDocs = (parsedRows) => {
  const rowsByCode = new Map()
  parsedRows.forEach((entry) => {
    if (!rowsByCode.has(entry.code)) rowsByCode.set(entry.code, [])
    rowsByCode.get(entry.code).push(entry)
  })

  const conflicts = []
  const validRows = []

  rowsByCode.forEach((entries, code) => {
    if (entries.length > 1) {
      conflicts.push({
        id: toConflictId(code),
        data: {
          code,
          status: "pending",
          reason: "duplicate-code-in-excel",
          source: path.basename(filePath),
          incomingData: entries.map((entry) => entry.data),
          entries: entries.map((entry) => ({
            sheet: entry.sheetKey,
            row: entry.rowIndex,
            nameCa: entry.nameCa,
          })),
          createdAt: Date.now(),
        },
      })
      return
    }

    validRows.push(entries[0])
  })

  return { validRows, duplicateConflicts: conflicts }
}

const askExistingConflictDecision = async (code, incomingName) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "skip"

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise((resolve) => {
    rl.question(
      `Existing plat '${code}' (${incomingName}). Update it? [y/N]: `,
      resolve
    )
  })
  rl.close()

  return normalize(answer).startsWith("y") ? "update" : "skip"
}

const clearCollection = async (collectionName) => {
  let deleted = 0
  while (true) {
    const snap = await db.collection(collectionName).limit(200).get()
    if (snap.empty) break

    const batch = db.batch()
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref))
    await batch.commit()
    deleted += snap.size
  }
  return deleted
}

const seedDefaultAllergens = async () => {
  let batch = db.batch()
  let batchCount = 0

  const commitBatch = async () => {
    if (batchCount === 0) return
    await batch.commit()
    batch = db.batch()
    batchCount = 0
  }

  for (const allergen of DEFAULT_ALLERGENS) {
    batch.set(db.collection("allergens").doc(allergen.key), {
      label: allergen.label,
      updatedAt: Date.now(),
      source: "import_plats_allergens",
    })
    batchCount++
    if (batchCount >= 450) {
      await commitBatch()
    }
  }

  await commitBatch()
}

async function run() {
  const workbook = xlsx.readFile(filePath, { cellDates: true })
  const { parsedRows, parseIssues, typeCatalog, groupCatalog, menuCatalog } = parseRows(
    workbook,
    sheetName
  )
  const { validRows, duplicateConflicts } = buildConflictDocs(parsedRows)

  const counters = {
    parsedRows: parsedRows.length,
    validRows: validRows.length,
    duplicateGroups: duplicateConflicts.length,
    parseIssues: parseIssues.length,
    imported: 0,
    skippedExisting: 0,
    updatedExisting: 0,
    conflictExisting: 0,
  }
  const report = {
    file: filePath,
    sheets: sheetName ? [sheetName] : workbook.SheetNames.slice(),
    mode: replaceAll ? "replace-all" : "incremental",
    updateExisting,
    summary: {},
    parseIssues,
    duplicateConflicts: duplicateConflicts.map((conflict) => conflict.data),
    existingConflicts: [],
  }

  console.log("=== IMPORT SUMMARY ===")
  console.log(`File: ${filePath}`)
  console.log(`Sheets: ${sheetName ? sheetName : workbook.SheetNames.join(", ")}`)
  console.log(`Rows parsed: ${counters.parsedRows}`)
  console.log(`Rows ready after duplicate filtering: ${counters.validRows}`)
  console.log(`Duplicate code groups excluded: ${counters.duplicateGroups}`)
  console.log(`Parse issues: ${counters.parseIssues}`)
  console.log(`Types detected: ${typeCatalog.size}`)
  console.log(`Groups detected: ${groupCatalog.size}`)
  console.log(`Menus detected: ${menuCatalog.size}`)

  report.summary = {
    rowsParsed: counters.parsedRows,
    rowsReadyAfterDuplicateFiltering: counters.validRows,
    duplicateGroupsExcluded: counters.duplicateGroups,
    parseIssues: counters.parseIssues,
    typesDetected: typeCatalog.size,
    groupsDetected: groupCatalog.size,
    menusDetected: menuCatalog.size,
  }

  if (duplicateConflicts.length > 0) {
    console.log("Duplicate codes excluded from import:")
    duplicateConflicts.forEach((conflict) => {
      console.log(` - ${conflict.data.code}`)
    })
  }

  if (parseIssues.length > 0) {
    console.log("Parse issues:")
    parseIssues.forEach((issue) => {
      console.log(` - ${issue.sheetKey}: ${issue.reason}`)
    })
  }

  if (dryRun) {
    const resolvedReportFile = resolveReportPath(reportFile)
    if (resolvedReportFile) {
      fs.mkdirSync(path.dirname(resolvedReportFile), { recursive: true })
      fs.writeFileSync(resolvedReportFile, JSON.stringify(report, null, 2), "utf8")
      console.log(`Report written: ${resolvedReportFile}`)
    }
    console.log("Dry run enabled. No data written.")
    return
  }

  if (replaceAll) {
    console.log("Replacing current allergens module collections...")
    const collectionsToClear = [
      "plats",
      "categories",
      "family",
      "menus",
      "allergens",
      "allergens_import_conflicts",
    ]

    for (const collectionName of collectionsToClear) {
      const deleted = await clearCollection(collectionName)
      console.log(` - Cleared ${collectionName}: ${deleted} docs deleted`)
    }
  } else {
    await clearCollection("allergens_import_conflicts")
  }

  await seedDefaultAllergens()

  let batch = db.batch()
  let batchCount = 0

  const commitBatch = async () => {
    if (batchCount === 0) return
    await batch.commit()
    batch = db.batch()
    batchCount = 0
  }

  const enqueueSet = (ref, data, options = undefined) => {
    if (options) batch.set(ref, data, options)
    else batch.set(ref, data)
    batchCount++
  }

  for (const [typeId, label] of typeCatalog.entries()) {
    enqueueSet(db.collection("categories").doc(typeId), {
      label,
      updatedAt: Date.now(),
      source: "import_plats_allergens",
    })
    if (batchCount >= 450) await commitBatch()
  }

  for (const [groupId, label] of groupCatalog.entries()) {
    enqueueSet(db.collection("family").doc(groupId), {
      label,
      updatedAt: Date.now(),
      source: "import_plats_allergens",
    })
    if (batchCount >= 450) await commitBatch()
  }

  for (const [menuId, label] of menuCatalog.entries()) {
    enqueueSet(db.collection("menus").doc(menuId), {
      label,
      updatedAt: Date.now(),
      source: "import_plats_allergens",
    })
    if (batchCount >= 450) await commitBatch()
  }

  for (const conflict of duplicateConflicts) {
    enqueueSet(db.collection("allergens_import_conflicts").doc(conflict.id), conflict.data)
    if (batchCount >= 450) await commitBatch()
  }

  await commitBatch()

  for (const row of validRows) {
    const ref = db.collection("plats").doc(row.code)

    if (!replaceAll) {
      const existing = await ref.get()
      if (existing.exists) {
        const decision = updateExisting
          ? "update"
          : await askExistingConflictDecision(row.code, row.nameCa)

        if (decision !== "update") {
          counters.skippedExisting++
          counters.conflictExisting++
          const conflictData = {
            code: row.code,
            status: "pending",
            reason: "existing-code-conflict",
            source: path.basename(filePath),
            entries: [
              {
                sheet: row.sheetKey,
                row: row.rowIndex,
                nameCa: row.nameCa,
              },
            ],
            existingNameCa: toString(existing.data()?.name?.ca),
            existingData: existing.data() || null,
            incomingData: row.data,
            createdAt: Date.now(),
          }
          await db
            .collection("allergens_import_conflicts")
            .doc(toConflictId(`${row.code}-existing`))
            .set(conflictData)
          report.existingConflicts.push(conflictData)
          continue
        }

        counters.updatedExisting++
      }
    }

    await ref.set(row.data, { merge: !replaceAll })
    counters.imported++
  }

  console.log("=== WRITE SUMMARY ===")
  console.log(`Imported plats: ${counters.imported}`)
  console.log(`Updated existing: ${counters.updatedExisting}`)
  console.log(`Skipped existing: ${counters.skippedExisting}`)
  console.log(`Conflict docs stored: ${duplicateConflicts.length + counters.conflictExisting}`)
  console.log("Import finished.")

  const resolvedReportFile = resolveReportPath(reportFile)
  if (resolvedReportFile) {
    fs.mkdirSync(path.dirname(resolvedReportFile), { recursive: true })
    report.summary.imported = counters.imported
    report.summary.updatedExisting = counters.updatedExisting
    report.summary.skippedExisting = counters.skippedExisting
    report.summary.conflictsStored = duplicateConflicts.length + counters.conflictExisting
    fs.writeFileSync(resolvedReportFile, JSON.stringify(report, null, 2), "utf8")
    console.log(`Report written: ${resolvedReportFile}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
