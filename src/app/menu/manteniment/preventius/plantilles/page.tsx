'use client'

import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import { FileSpreadsheet, Printer, Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { RoleGuard } from '@/lib/withRoleGuard'
import FloatingAddButton from '@/components/ui/floating-add-button'
import FilterButton from '@/components/ui/filter-button'

type TemplateSection = { location: string; items: { label: string }[] }
type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  sections: TemplateSection[]
}

type ImportModel = 'A' | 'B' | 'C' | 'D' | 'UNKNOWN'

type ImportCandidate = {
  name: string
  periodicity?: Template['periodicity']
  location?: string
  sections: TemplateSection[]
}

type ImportPreview = {
  fileName: string
  model: ImportModel
  templates: ImportCandidate[]
  warnings: string[]
}
type ModelBImportMode = 'single' | 'split' | 'custom'

const normalizeTemplateSections = (sections: unknown): TemplateSection[] =>
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

const PERIODICITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Totes' },
  { value: 'daily', label: 'Diari' },
  { value: 'weekly', label: 'Setmanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const SHEET_PERIODICITY: Record<string, NonNullable<Template['periodicity']>> = {
  DIARIS: 'daily',
  SETMANALS: 'weekly',
  MENSUALS: 'monthly',
  TRIMESTRALS: 'quarterly',
  SEMESTRALS: 'quarterly',
  ANUALS: 'yearly',
}

const normalize = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()

const cleanText = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

const slugify = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const buildTemplateRows = (t: Template) => {
  const rows: Array<{ section: string; task: string }> = []
  ;(t.sections || []).forEach((s) => {
    const section = cleanText(s.location) || 'GENERAL'
    ;(s.items || []).forEach((it) => {
      const task = cleanText(it.label)
      if (!task) return
      rows.push({ section, task })
    })
  })
  return rows
}

const formatExportDate = () => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

const compactRows = (rows: unknown[][]) =>
  rows.map((r) => (Array.isArray(r) ? r.map(cleanText) : [])).filter((r) => r.some(Boolean))

const isPeriodLabel = (v: string) => {
  const n = normalize(v)
  return ['DIARI', 'SETMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].some((k) =>
    n.startsWith(k)
  )
}

const periodFromLabel = (v: string): Template['periodicity'] => {
  const n = normalize(v)
  if (n.startsWith('DIARI')) return 'daily'
  if (n.startsWith('SETMANAL')) return 'weekly'
  if (n.startsWith('MENSUAL')) return 'monthly'
  if (n.startsWith('TRIMESTRAL') || n.startsWith('SEMESTRAL')) return 'quarterly'
  if (n.startsWith('ANUAL')) return 'yearly'
  return null
}

const detectModel = (sheetNames: string[], rows: string[][]): ImportModel => {
  const hasPeriodicSheets = sheetNames.some((s) => !!SHEET_PERIODICITY[normalize(s)])
  if (hasPeriodicSheets) return 'C'

  const hasMatrixMarkers = rows.some((r) => {
    const n0 = normalize(r[0] || '')
    const n1 = normalize(r[1] || '')
    return (
      n0.includes('PERIODE') &&
      (n1 === '↓' || n1.includes('A COMPROVAR') || n1.includes('ELEMENTS'))
    )
  })
  if (hasMatrixMarkers) return 'D'

  const joined = rows.map((r) => normalize(r.join(' | '))).join('\n')
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
    const r = rows[rowIdx]
    let locCandidate = -1
    let taskCandidate = -1
    for (let c = 0; c < r.length; c += 1) {
      const n = normalize(r[c] || '')
      if (locCandidate < 0 && (n.includes('UBICACIO') || n.includes('APARELLS'))) locCandidate = c
      if (taskCandidate < 0 && (n.includes('FEINES') || n.includes('TREBALLS'))) taskCandidate = c
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

  rows.slice(Math.max(0, headerIdx + 1)).forEach((r) => {
    const c0 = cleanText(r[locationCol])
    const c1 = cleanText(r[taskCol])
    const n0 = normalize(c0)
    const n1 = normalize(c1)

    const isHeaderLike =
      n0.includes('UBICACIO') ||
      n0.includes('APARELLS') ||
      n0.includes('OBSERVACIONS') ||
      n1.includes('REVISAT') ||
      n1.includes('SUBSTITUIT') ||
      n1.includes('FET')
    if (isHeaderLike) return

    if (!c0 && !c1) return

    // Most real sheets use: [location | task] then [empty | task]...
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
    if (!task) return
    if (isPeriodLabel(task)) return

    addTask(current, task)
  })

  return Array.from(sectionsMap.entries())
    .map(([location, items]) => ({
      location,
      items: Array.from(items).map((label) => ({ label })),
    }))
    .filter((s) => s.items.length > 0)
}

const rowsToSectionsByPeriod = (rows: string[][]) => {
  let current = 'GENERAL'
  const sectionsMap = new Map<string, Set<string>>()

  rows.forEach((r) => {
    const c0 = cleanText(r[0])
    const c1 = cleanText(r[1])
    const c2 = cleanText(r[2])

    if (isPeriodLabel(c0)) {
      current = c0
      if (!sectionsMap.has(current)) sectionsMap.set(current, new Set())
      return
    }

    const n0 = normalize(c0)
    if (n0.includes('FEINES') || n0.includes('TREBALLS') || n0.includes('PERIODE') || n0.includes('OBSERVACIONS')) {
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
    .filter((s) => s.items.length > 0)
}

const firstMeaningful = (rows: string[][]) => {
  for (const r of rows) {
    const first = r.find((v) => !!cleanText(v))
    if (first) return cleanText(first)
  }
  return 'Plantilla importada'
}

const rowsToSectionsMatrix = (rows: string[][]) => {
  const headerTopIdx = rows.findIndex((r) => normalize(r[0] || '').includes('ANY'))
  const headerBottomIdx = rows.findIndex((r) => normalize(r[0] || '').includes('PERIODE'))
  const startDataIdx = headerBottomIdx >= 0 ? headerBottomIdx + 1 : Math.max(3, headerTopIdx + 1)

  // Column names from both header rows (zone + subzone)
  const columnNames: string[] = []
  for (let c = 2; c < 20; c += 1) {
    const top = cleanText(rows[headerTopIdx]?.[c] || '')
    const bottom = cleanText(rows[headerBottomIdx]?.[c] || '')
    const name = [top, bottom].filter(Boolean).join(' - ').trim()
    if (!name) continue
    columnNames[c] = name
  }

  const sectionsMap = new Map<string, Set<string>>()
  let currentPeriod = 'GENERAL'

  rows.slice(startDataIdx).forEach((r) => {
    const c0 = cleanText(r[0])
    const c1 = cleanText(r[1])
    const n0 = normalize(c0)
    const n1 = normalize(c1)

    if (n0.includes('OBSERVACIONS')) return
    if (isPeriodLabel(c0) || /^\\d/.test(c0)) {
      currentPeriod = c0 || currentPeriod
    }

    const baseTask = c1
    if (!baseTask || n1 === '↓') return

    let hasExplicitMarks = false
    for (let c = 2; c < r.length; c += 1) {
      const mark = cleanText(r[c])
      if (!mark) continue
      hasExplicitMarks = true
      const zone = columnNames[c] || `Columna ${c + 1}`
      if (!sectionsMap.has(zone)) sectionsMap.set(zone, new Set())
      sectionsMap.get(zone)!.add(`[${currentPeriod}] ${baseTask}`)
    }

    // In many sheets marks are empty but tasks apply to all zones
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
    .filter((s) => s.items.length > 0)
}

const parseWorkbook = (fileName: string, wb: XLSX.WorkBook): ImportPreview => {
  const sheetNames = wb.SheetNames || []
  const primarySheet = sheetNames[0]
  const rows = primarySheet
    ? compactRows(XLSX.utils.sheet_to_json(wb.Sheets[primarySheet], { header: 1, defval: '' }) as unknown[][])
    : []

  const model = detectModel(sheetNames, rows)
  const warnings: string[] = []
  const templates: ImportCandidate[] = []

  if (model === 'A') {
    const sections = rowsToSectionsByLocation(rows)
    templates.push({
      name: firstMeaningful(rows),
      periodicity: null,
      sections,
    })
  } else if (model === 'B') {
    const sections = rowsToSectionsByPeriod(rows)
    let periodicity: Template['periodicity'] = null
    for (const s of sections) {
      if (s.location !== 'GENERAL') {
        periodicity = periodFromLabel(s.location)
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
      const p = SHEET_PERIODICITY[normalize(sheet)]
      if (!p) return
      const sheetRows = compactRows(
        XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' }) as unknown[][]
      )
      const sections = rowsToSectionsByLocation(sheetRows)
      const title = firstMeaningful(sheetRows)
      templates.push({
        name: title || `Preventiu ${sheet}`,
        periodicity: p,
        sections,
      })
    })
    if (templates.length === 0) warnings.push('No s\'han detectat pestanyes de temporalitat importables.')
  } else if (model === 'D') {
    sheetNames.forEach((sheet) => {
      const sheetRows = compactRows(
        XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' }) as unknown[][]
      )
      const sections = rowsToSectionsMatrix(sheetRows)
      if (sections.length === 0) return
      const title = firstMeaningful(sheetRows)
      templates.push({
        name: `${title} - ${sheet}`,
        periodicity: null,
        sections,
      })
    })
    if (templates.length === 0) warnings.push('Model D detectat pero sense seccions importables.')
  } else {
    warnings.push('Format no reconegut automaticament (model D/altre).')
  }

  const cleaned = templates
    .map((t) => ({
      ...t,
      sections: t.sections.filter((s) => s.items.length > 0),
    }))
    .filter((t) => t.sections.length > 0)

  if (cleaned.length === 0) warnings.push('No s\'han extret tasques valides del fitxer.')

  return {
    fileName,
    model,
    templates: cleaned,
    warnings,
  }
}

export default function PreventiusPlantillesPage() {
  const { setContent } = useFilters()
  const [templates, setTemplates] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [periodicity, setPeriodicity] = useState('all')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [modelBMode, setModelBMode] = useState<ModelBImportMode>('single')
  const [modelBAvailablePeriods, setModelBAvailablePeriods] = useState<string[]>([])
  const [modelBSelectedPeriods, setModelBSelectedPeriods] = useState<string[]>([])

  const loadTemplates = async () => {
    const res = await fetch('/api/maintenance/templates', { cache: 'no-store' })
    if (!res.ok) {
      setTemplates([])
      return
    }
    const json = await res.json()
    setTemplates(
      Array.isArray(json?.templates)
        ? json.templates.map((template: Partial<Template> & { id?: string }) => ({
            id: String(template.id || ''),
            name: String(template.name || '').trim(),
            periodicity: template.periodicity || null,
            lastDone: template.lastDone || null,
            location: String(template.location || '').trim(),
            primaryOperator: String(template.primaryOperator || '').trim(),
            backupOperator: String(template.backupOperator || '').trim(),
            sections: normalizeTemplateSections(template.sections),
          }))
        : []
    )
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Temporalitat</span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={periodicity}
            onChange={(e) => setPeriodicity(e.target.value)}
          >
            {PERIODICITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              setPeriodicity('all')
            }}
          />
        </div>
      </div>
    )
  }, [periodicity, setContent])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (periodicity !== 'all' && t.periodicity !== periodicity) return false
      if (!term) return true
      const hay = [t.name, t.location, t.primaryOperator, t.backupOperator]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(term)
    })
  }, [templates, search, periodicity])

  const openTemplate = (id: string) => {
    const url = `/menu/manteniment/preventius/plantilles/${id}`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  const openNew = () => {
    const url = `/menu/manteniment/preventius/plantilles/new`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  const handleFile = async (file?: File | null) => {
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const parsed = parseWorkbook(file.name, wb)
      setPreview(parsed)
      if (parsed.model === 'B') {
        const first = parsed.templates[0]
        const periods = (first?.sections || [])
          .map((s) => s.location)
          .filter((loc) => loc !== 'GENERAL' && isPeriodLabel(loc))
        setModelBAvailablePeriods(periods)
        setModelBSelectedPeriods(periods)
        setModelBMode(periods.length > 1 ? 'single' : 'single')
      } else {
        setModelBAvailablePeriods([])
        setModelBSelectedPeriods([])
        setModelBMode('single')
      }
    } catch {
      setPreview({
        fileName: file.name,
        model: 'UNKNOWN',
        templates: [],
        warnings: ['No s\'ha pogut llegir el fitxer.'],
      })
    }
  }

  const buildModelBImportTargets = (base: ImportCandidate) => {
    const periodSections = base.sections.filter(
      (s) => s.location !== 'GENERAL' && isPeriodLabel(s.location)
    )
    if (periodSections.length === 0) return [base]

    if (modelBMode === 'single') {
      return [base]
    }

    const selected =
      modelBMode === 'custom'
        ? periodSections.filter((s) => modelBSelectedPeriods.includes(s.location))
        : periodSections

    if (selected.length === 0) return []

    return selected.map((s) => ({
      name: `${base.name} - ${s.location}`,
      periodicity: periodFromLabel(s.location),
      location: base.location,
      sections: [{ location: 'GENERAL', items: s.items }],
    }))
  }

  const importTemplates = async () => {
    if (!preview || preview.templates.length === 0) return
    setImporting(true)
    try {
      const targets =
        preview.model === 'B'
          ? buildModelBImportTargets(preview.templates[0])
          : preview.templates
      if (targets.length === 0) {
        alert('No hi ha temporalitats seleccionades per importar.')
        setImporting(false)
        return
      }

      let ok = 0
      for (const candidate of targets) {
        const res = await fetch('/api/maintenance/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: candidate.name,
            periodicity: candidate.periodicity || null,
            sections: candidate.sections,
          }),
        })
        if (res.ok) ok += 1
      }
      await loadTemplates()
      alert(`Importacio finalitzada: ${ok}/${targets.length} plantilles creades.`)
      setPreview(null)
      setModelBAvailablePeriods([])
      setModelBSelectedPeriods([])
      setModelBMode('single')
    } catch {
      alert('No s\'ha pogut completar la importacio.')
    } finally {
      setImporting(false)
    }
  }

  const exportTemplateExcel = (t: Template) => {
    try {
      const rows = buildTemplateRows(t)
      const exportDate = formatExportDate()
      const wsRows: Array<Array<string>> = [
        ['DOCUMENT DE PLANTILLA PREVENTIU'],
        [],
        ['Nom plantilla', t.name || '-'],
        ['Data exportacio', exportDate],
        ['Temporalitat', t.periodicity || '-'],
        ['Ubicacio', t.location || '-'],
        ['Operari principal', t.primaryOperator || '-'],
        ['Operari backup', t.backupOperator || '-'],
        ['Ultima revisio', t.lastDone || '-'],
        [],
        ['Seccio', 'Tasca', 'Fet', 'Observacions'],
      ]
      rows.forEach((r) => {
        wsRows.push([r.section, r.task, '', ''])
      })
      if (rows.length === 0) wsRows.push(['GENERAL', '-', '', ''])

      const ws = XLSX.utils.aoa_to_sheet(wsRows)
      ws['!cols'] = [{ wch: 28 }, { wch: 90 }, { wch: 10 }, { wch: 38 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
      const stamp = new Date().toISOString().slice(0, 10)
      const file = `plantilla-${slugify(t.name) || 'preventiu'}-${stamp}.xlsx`
      XLSX.writeFile(wb, file)
    } catch {
      alert("No s'ha pogut exportar la plantilla a Excel.")
    }
  }

  const exportTemplatePdf = (t: Template) => {
    try {
      const rows = buildTemplateRows(t)
      const exportDate = formatExportDate()
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      const margin = 40
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const tableWidth = pageWidth - margin * 2
      const periodicityLabel: Record<string, string> = {
        daily: 'Diari',
        weekly: 'Setmanal',
        monthly: 'Mensual',
        quarterly: 'Trimestral',
        yearly: 'Anual',
      }

      let y = margin
      pdf.setFontSize(15)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Document de plantilla preventiu', margin, y)
      y += 16
      pdf.setDrawColor(180)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 14

      const meta: Array<[string, string]> = [
        ['Nom plantilla', t.name || '-'],
        ['Data exportacio', exportDate],
        ['Temporalitat', periodicityLabel[String(t.periodicity || '')] || (t.periodicity || '-')],
        ['Ubicacio', t.location || '-'],
        ['Operari principal', t.primaryOperator || '-'],
        ['Operari backup', t.backupOperator || '-'],
        ['Ultima revisio', t.lastDone || '-'],
      ]

      const metaLabelW = 120
      const metaMinRowH = 18
      const metaLineH = 11
      pdf.setFontSize(10)
      meta.forEach(([label, value]) => {
        const wrapped = pdf.splitTextToSize(String(value || '-'), tableWidth - metaLabelW - 16) as string[]
        const rowH = Math.max(metaMinRowH, wrapped.length * metaLineH + 8)
        const top = y - 12
        pdf.setDrawColor(220)
        pdf.rect(margin, top, tableWidth, rowH)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${label}:`, margin + 6, y)
        pdf.setFont('helvetica', 'normal')
        pdf.text(wrapped, margin + metaLabelW, y)
        y += rowH
      })

      y += 10
      const colSection = 120
      const colDone = 55
      const colObs = 160
      const colTask = tableWidth - colSection - colDone - colObs
      const xSection = margin
      const xTask = xSection + colSection
      const xDone = xTask + colTask
      const xObs = xDone + colDone

      const drawTasksHeader = () => {
        pdf.setFillColor(245, 245, 245)
        pdf.rect(margin, y - 11, tableWidth, 20, 'F')
        pdf.setDrawColor(200)
        pdf.rect(margin, y - 11, tableWidth, 20)
        pdf.line(xTask, y - 11, xTask, y + 9)
        pdf.line(xDone, y - 11, xDone, y + 9)
        pdf.line(xObs, y - 11, xObs, y + 9)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Seccio', xSection + 6, y + 2)
        pdf.text('Tasca', xTask + 6, y + 2)
        pdf.text('Fet', xDone + 6, y + 2)
        pdf.text('Observacions', xObs + 6, y + 2)
        pdf.setFont('helvetica', 'normal')
        y += 20
      }

      drawTasksHeader()
      const safeRows = rows.length > 0 ? rows : [{ section: 'GENERAL', task: '-' }]

      for (const row of safeRows) {
        const taskLines = pdf.splitTextToSize(row.task, colTask - 10) as string[]
        const rowH = Math.max(22, taskLines.length * 11 + 8)
        if (y + rowH > pageHeight - margin) {
          pdf.addPage()
          y = margin
          drawTasksHeader()
        }

        const top = y - 11
        pdf.setDrawColor(220)
        pdf.rect(margin, top, tableWidth, rowH)
        pdf.line(xTask, top, xTask, top + rowH)
        pdf.line(xDone, top, xDone, top + rowH)
        pdf.line(xObs, top, xObs, top + rowH)

        pdf.setFontSize(9)
        pdf.text((row.section || 'GENERAL').slice(0, 26), xSection + 6, y + 2)
        pdf.text(taskLines, xTask + 6, y + 2)

        const checkSize = 9
        const checkX = xDone + 8
        const checkY = top + Math.max(6, (rowH - checkSize) / 2)
        pdf.rect(checkX, checkY, checkSize, checkSize)

        const obsY = top + rowH / 2 + 6
        pdf.setDrawColor(170)
        pdf.line(xObs + 6, obsY, xObs + colObs - 6, obsY)
        y += rowH
      }

      const stamp = new Date().toISOString().slice(0, 10)
      const file = `plantilla-${slugify(t.name) || 'preventiu'}-${stamp}.pdf`
      pdf.save(file)
    } catch {
      alert("No s'ha pogut exportar la plantilla a PDF.")
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-4 space-y-4">
        <ModuleHeader subtitle="Plantilles (plans) i checklists" />

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Importar plantilla</div>
              <div className="text-xs text-gray-500">
                Excel o CSV. Detectem el format i et mostrem una previsualitzacio abans de guardar.
              </div>
            </div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100">
              Seleccionar fitxer
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          </div>

          {preview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
              <div className="flex flex-col gap-1 text-xs text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Fitxer: <span className="font-semibold">{preview.fileName}</span>
                </div>
                <div>
                  Model: <span className="font-semibold">{preview.model}</span>
                </div>
              </div>
              <div className="text-xs text-gray-700">
                Plantilles detectades: <span className="font-semibold">{preview.templates.length}</span>
              </div>
              {preview.warnings.map((w, idx) => (
                <div key={idx} className="text-xs text-amber-700">{w}</div>
              ))}
              {preview.model === 'B' && (
                <div className="rounded-lg border p-2 space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Importacio model B</div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="modelBMode"
                      checked={modelBMode === 'single'}
                      onChange={() => setModelBMode('single')}
                    />
                    Crear una sola plantilla (fusionada)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="modelBMode"
                      checked={modelBMode === 'split'}
                      onChange={() => setModelBMode('split')}
                    />
                    Crear una plantilla per temporalitat
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="modelBMode"
                      checked={modelBMode === 'custom'}
                      onChange={() => setModelBMode('custom')}
                    />
                    Seleccionar temporalitats concretes
                  </label>
                  {modelBMode === 'custom' && (
                    <div className="flex flex-wrap gap-2 pl-5">
                      {modelBAvailablePeriods.map((p) => {
                        const checked = modelBSelectedPeriods.includes(p)
                        return (
                          <label key={p} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setModelBSelectedPeriods((prev) => Array.from(new Set([...prev, p])))
                                } else {
                                  setModelBSelectedPeriods((prev) => prev.filter((x) => x !== p))
                                }
                              }}
                            />
                            {p}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1">
                {preview.templates.slice(0, 4).map((t, idx) => (
                  <div key={`${t.name}-${idx}`} className="text-xs text-gray-700">
                    {t.name} · {t.periodicity || 'sense temporalitat'} · {(t.sections || []).length} seccions
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs"
                  onClick={() => setPreview(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={importing || preview.templates.length === 0}
                  onClick={importTemplates}
                >
                  {importing ? 'Important...' : 'Importar'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Plantilles</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{filtered.length} resultats</span>
                  {periodicity !== 'all' ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                      {
                        PERIODICITY_OPTIONS.find((option) => option.value === periodicity)?.label ||
                        periodicity
                      }
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 lg:hidden">
                <FilterButton onClick={() => undefined} />
              </div>
            </div>
            <div className="flex items-center gap-2 lg:min-w-[420px]">
              <div className="w-full">
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  placeholder="Cerca per nom, ubicacio o operari"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="hidden shrink-0 lg:block">
                <FilterButton onClick={() => undefined} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">No hi ha plantilles.</div>
            )}
            {filtered.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      className="text-left text-sm font-semibold text-gray-900 hover:underline"
                      onClick={() => openTemplate(t.id)}
                    >
                      {t.name}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">
                      <span>Temporalitat: {t.periodicity || '—'}</span>
                      <span>Ultima revisio: {t.lastDone || '—'}</span>
                      <span>Ubicacio: {t.location || '—'}</span>
                      <span>Seccions: {(t.sections || []).length}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Exportar a PDF"
                      aria-label="Exportar a PDF"
                      className="rounded-full border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                      onClick={() => exportTemplatePdf(t)}
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Exportar a Excel"
                      aria-label="Exportar a Excel"
                      className="rounded-full border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                      onClick={() => exportTemplateExcel(t)}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Eliminar plantilla"
                      aria-label="Eliminar plantilla"
                      className="rounded-full border border-red-300 p-2 text-red-700 hover:bg-red-50"
                      onClick={async () => {
                        const ok = window.confirm(`Vols eliminar la plantilla \"${t.name}\"?`)
                        if (!ok) return
                        try {
                          const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(t.id)}`, {
                            method: 'DELETE',
                          })
                          if (!res.ok) throw new Error('delete_failed')
                          await loadTemplates()
                        } catch {
                          alert("No s'ha pogut eliminar la plantilla.")
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FloatingAddButton onClick={openNew} />
    </RoleGuard>
  )
}
