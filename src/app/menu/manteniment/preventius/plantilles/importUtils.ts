'use client'

import type { ImportCandidate, ImportModel, ImportPreview, Template, TemplateSection } from './types'

type WorkbookLike = {
  SheetNames?: string[]
  Sheets: Record<string, unknown>
}

type XlsxUtilsLike = {
  sheet_to_json: (sheet: unknown, options: { header: 1; defval: '' }) => unknown[][]
}

export const SHEET_PERIODICITY: Record<string, NonNullable<Template['periodicity']>> = {
  DIARIS: 'daily',
  SETMANALS: 'weekly',
  MENSUALS: 'monthly',
  TRIMESTRALS: 'quarterly',
  SEMESTRALS: 'quarterly',
  ANUALS: 'yearly',
}

export const normalize = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()

export const cleanText = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

export const slugify = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const normalizeTemplateSections = (sections: unknown): TemplateSection[] =>
  Array.isArray(sections)
    ? sections
        .map((section) => {
          const record = section as {
            location?: unknown
            items?: Array<{ label?: unknown }> | unknown
          }
          return {
            location: cleanText(record?.location),
            items: Array.isArray(record?.items)
              ? record.items
                  .map((item) => ({ label: cleanText((item as { label?: unknown })?.label) }))
                  .filter((item) => item.label)
              : [],
          }
        })
        .filter((section) => section.location || section.items.length > 0)
    : []

export const buildTemplateRows = (template: Template) => {
  const rows: Array<{ section: string; task: string }> = []
  ;(template.sections || []).forEach((section) => {
    const sectionLabel = cleanText(section.location) || 'GENERAL'
    ;(section.items || []).forEach((item) => {
      const task = cleanText(item.label)
      if (!task) return
      rows.push({ section: sectionLabel, task })
    })
  })
  return rows
}

export const formatExportDate = () => {
  const date = new Date()
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

const compactRows = (rows: unknown[][]) =>
  rows.map((row) => (Array.isArray(row) ? row.map(cleanText) : [])).filter((row) => row.some(Boolean))

const isPeriodLabel = (value: string) => {
  const normalized = normalize(value)
  return ['DIARI', 'SETMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].some((key) =>
    normalized.startsWith(key)
  )
}

export const periodFromLabel = (value: string): Template['periodicity'] => {
  const normalized = normalize(value)
  if (normalized.startsWith('DIARI')) return 'daily'
  if (normalized.startsWith('SETMANAL')) return 'weekly'
  if (normalized.startsWith('MENSUAL')) return 'monthly'
  if (normalized.startsWith('TRIMESTRAL') || normalized.startsWith('SEMESTRAL')) return 'quarterly'
  if (normalized.startsWith('ANUAL')) return 'yearly'
  return null
}

const detectModel = (sheetNames: string[], rows: string[][]): ImportModel => {
  const hasPeriodicSheets = sheetNames.some((sheetName) => !!SHEET_PERIODICITY[normalize(sheetName)])
  if (hasPeriodicSheets) return 'C'

  const hasMatrixMarkers = rows.some((row) => {
    const first = normalize(row[0] || '')
    const second = normalize(row[1] || '')
    return (
      first.includes('PERIODE') &&
      (second === '↓' || second.includes('A COMPROVAR') || second.includes('ELEMENTS'))
    )
  })
  if (hasMatrixMarkers) return 'D'

  const joined = rows.map((row) => normalize(row.join(' | '))).join('\n')
  if (joined.includes('UBICACIO') && (joined.includes('FEINES A FER') || joined.includes('TREBALLS A FER'))) {
    return 'A'
  }
  if (joined.includes('PERIODE') && joined.includes('TREBALLS')) return 'B'
  if (joined.includes('FEINES') && (joined.includes('FET') || joined.includes('PENDENT'))) return 'B'
  return 'UNKNOWN'
}

const rowsToSectionsByLocation = (rows: string[][]) => {
  let headerIdx = -1
  let locationCol = 0
  let taskCol = 1

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx]
    let locCandidate = -1
    let taskCandidate = -1
    for (let column = 0; column < row.length; column += 1) {
      const normalized = normalize(row[column] || '')
      if (locCandidate < 0 && (normalized.includes('UBICACIO') || normalized.includes('APARELLS'))) locCandidate = column
      if (taskCandidate < 0 && (normalized.includes('FEINES') || normalized.includes('TREBALLS'))) taskCandidate = column
    }
    if (locCandidate >= 0 && taskCandidate >= 0) {
      headerIdx = rowIdx
      locationCol = locCandidate
      taskCol = taskCandidate
      break
    }
  }

  const sectionsMap = new Map<string, Set<string>>()
  let current = 'GENERAL'

  const addTask = (location: string, task: string) => {
    if (!sectionsMap.has(location)) sectionsMap.set(location, new Set())
    sectionsMap.get(location)!.add(task)
  }

  rows.slice(Math.max(0, headerIdx + 1)).forEach((row) => {
    const c0 = cleanText(row[locationCol])
    const c1 = cleanText(row[taskCol])
    const n0 = normalize(c0)
    const n1 = normalize(c1)

    const isHeaderLike =
      n0.includes('UBICACIO') ||
      n0.includes('APARELLS') ||
      n0.includes('OBSERVACIONS') ||
      n1.includes('REVISAT') ||
      n1.includes('SUBSTITUIT') ||
      n1.includes('FET')
    if (isHeaderLike || (!c0 && !c1)) return

    if (c0 && c1 && !isPeriodLabel(c0)) {
      current = c0
      addTask(current, c1)
      return
    }

    if (c0 && !isPeriodLabel(c0) && !c1) {
      current = c0
      if (!sectionsMap.has(current)) sectionsMap.set(current, new Set())
      return
    }

    const task = c1 || c0
    if (!task || isPeriodLabel(task)) return
    addTask(current, task)
  })

  return Array.from(sectionsMap.entries())
    .map(([location, items]) => ({
      location,
      items: Array.from(items).map((label) => ({ label })),
    }))
    .filter((section) => section.items.length > 0)
}

const rowsToSectionsByPeriod = (rows: string[][]) => {
  let current = 'GENERAL'
  const sectionsMap = new Map<string, Set<string>>()

  rows.forEach((row) => {
    const c0 = cleanText(row[0])
    const c1 = cleanText(row[1])
    const c2 = cleanText(row[2])

    if (isPeriodLabel(c0)) {
      current = c0
      if (!sectionsMap.has(current)) sectionsMap.set(current, new Set())
      return
    }

    const normalized = normalize(c0)
    if (normalized.includes('FEINES') || normalized.includes('TREBALLS') || normalized.includes('PERIODE') || normalized.includes('OBSERVACIONS')) {
      return
    }

    const task = c1 || c0 || c2
    if (!task || isPeriodLabel(task)) return

    if (!sectionsMap.has(current)) sectionsMap.set(current, new Set())
    sectionsMap.get(current)!.add(task)
  })

  return Array.from(sectionsMap.entries())
    .map(([location, items]) => ({
      location,
      items: Array.from(items).map((label) => ({ label })),
    }))
    .filter((section) => section.items.length > 0)
}

const firstMeaningful = (rows: string[][]) => {
  for (const row of rows) {
    const first = row.find((value) => !!cleanText(value))
    if (first) return cleanText(first)
  }
  return 'Plantilla importada'
}

const rowsToSectionsMatrix = (rows: string[][]) => {
  const headerTopIdx = rows.findIndex((row) => normalize(row[0] || '').includes('ANY'))
  const headerBottomIdx = rows.findIndex((row) => normalize(row[0] || '').includes('PERIODE'))
  const startDataIdx = headerBottomIdx >= 0 ? headerBottomIdx + 1 : Math.max(3, headerTopIdx + 1)

  const columnNames: string[] = []
  for (let column = 2; column < 20; column += 1) {
    const top = cleanText(rows[headerTopIdx]?.[column] || '')
    const bottom = cleanText(rows[headerBottomIdx]?.[column] || '')
    const name = [top, bottom].filter(Boolean).join(' - ').trim()
    if (!name) continue
    columnNames[column] = name
  }

  const sectionsMap = new Map<string, Set<string>>()
  let currentPeriod = 'GENERAL'

  rows.slice(startDataIdx).forEach((row) => {
    const c0 = cleanText(row[0])
    const c1 = cleanText(row[1])
    const n0 = normalize(c0)
    const n1 = normalize(c1)

    if (n0.includes('OBSERVACIONS')) return
    if (isPeriodLabel(c0) || /^\d/.test(c0)) currentPeriod = c0 || currentPeriod

    const baseTask = c1
    if (!baseTask || n1 === '↓') return

    let hasExplicitMarks = false
    for (let column = 2; column < row.length; column += 1) {
      const mark = cleanText(row[column])
      if (!mark) continue
      hasExplicitMarks = true
      const zone = columnNames[column] || `Columna ${column + 1}`
      if (!sectionsMap.has(zone)) sectionsMap.set(zone, new Set())
      sectionsMap.get(zone)!.add(`[${currentPeriod}] ${baseTask}`)
    }

    if (!hasExplicitMarks) {
      const zones = Object.values(columnNames).filter(Boolean)
      if (zones.length === 0) {
        if (!sectionsMap.has('GENERAL')) sectionsMap.set('GENERAL', new Set())
        sectionsMap.get('GENERAL')!.add(`[${currentPeriod}] ${baseTask}`)
      } else {
        zones.forEach((zone) => {
          if (!sectionsMap.has(zone)) sectionsMap.set(zone, new Set())
          sectionsMap.get(zone)!.add(`[${currentPeriod}] ${baseTask}`)
        })
      }
    }
  })

  return Array.from(sectionsMap.entries())
    .map(([location, items]) => ({
      location,
      items: Array.from(items).map((label) => ({ label })),
    }))
    .filter((section) => section.items.length > 0)
}

export const parseWorkbook = (
  fileName: string,
  workbook: WorkbookLike,
  xlsxUtils: XlsxUtilsLike
): ImportPreview => {
  const sheetNames = workbook.SheetNames || []
  const primarySheet = sheetNames[0]
  const rows = primarySheet
    ? compactRows(xlsxUtils.sheet_to_json(workbook.Sheets[primarySheet], { header: 1, defval: '' }) as unknown[][])
    : []

  const model = detectModel(sheetNames, rows)
  const warnings: string[] = []
  const templates: ImportCandidate[] = []

  if (model === 'A') {
    templates.push({
      name: firstMeaningful(rows),
      periodicity: null,
      sections: rowsToSectionsByLocation(rows),
    })
  } else if (model === 'B') {
    const sections = rowsToSectionsByPeriod(rows)
    let periodicity: Template['periodicity'] = null
    for (const section of sections) {
      if (section.location !== 'GENERAL') {
        periodicity = periodFromLabel(section.location)
        if (periodicity) break
      }
    }
    templates.push({
      name: firstMeaningful(rows),
      periodicity,
      sections,
    })
  } else if (model === 'C') {
    sheetNames.forEach((sheet) => {
      const periodicity = SHEET_PERIODICITY[normalize(sheet)]
      if (!periodicity) return
      const sheetRows = compactRows(
        xlsxUtils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '' }) as unknown[][]
      )
      templates.push({
        name: firstMeaningful(sheetRows) || `Preventiu ${sheet}`,
        periodicity,
        sections: rowsToSectionsByLocation(sheetRows),
      })
    })
    if (templates.length === 0) warnings.push('No s\'han detectat pestanyes de temporalitat importables.')
  } else if (model === 'D') {
    sheetNames.forEach((sheet) => {
      const sheetRows = compactRows(
        xlsxUtils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '' }) as unknown[][]
      )
      const sections = rowsToSectionsMatrix(sheetRows)
      if (sections.length === 0) return
      templates.push({
        name: `${firstMeaningful(sheetRows)} - ${sheet}`,
        periodicity: null,
        sections,
      })
    })
    if (templates.length === 0) warnings.push('Model D detectat pero sense seccions importables.')
  } else {
    warnings.push('Format no reconegut automaticament (model D/altre).')
  }

  const cleaned = templates
    .map((template) => ({
      ...template,
      sections: template.sections.filter((section) => section.items.length > 0),
    }))
    .filter((template) => template.sections.length > 0)

  if (cleaned.length === 0) warnings.push('No s\'han extret tasques valides del fitxer.')

  return { fileName, model, templates: cleaned, warnings }
}
