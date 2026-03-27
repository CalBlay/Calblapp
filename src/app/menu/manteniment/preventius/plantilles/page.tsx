'use client'

import React, { useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { RoleGuard } from '@/lib/withRoleGuard'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { formatDateOnly } from '@/lib/date-format'
import ImportTemplatesCard from './components/ImportTemplatesCard'
import TemplatesFiltersCard from './components/TemplatesFiltersCard'
import EmbeddedTemplatesLayout from './components/EmbeddedTemplatesLayout'
import TemplatesListCard from './components/TemplatesListCard'
import {
  buildTemplateRows,
  formatExportDate,
  normalizeTemplateSections,
  parseWorkbook,
  periodFromLabel,
  slugify,
} from './importUtils'
import {
  PERIODICITY_OPTIONS,
  type ImportCandidate,
  type ImportPreview,
  type ModelBImportMode,
  type Template,
} from './types'

export function PreventiusTemplatesContent({
  embedded = false,
  hideFab = false,
}: {
  embedded?: boolean
  hideFab?: boolean
}) {
  const { setContent } = useFilters()
  const [templates, setTemplates] = useState<Template[]>([])
  const [search, setSearch] = useState('')
  const [periodicity, setPeriodicity] = useState('all')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [modelBMode, setModelBMode] = useState<ModelBImportMode>('single')
  const [modelBAvailablePeriods, setModelBAvailablePeriods] = useState<string[]>([])
  const [modelBSelectedPeriods, setModelBSelectedPeriods] = useState<string[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplateLastNotes, setSelectedTemplateLastNotes] = useState('')

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
    void loadTemplates()
  }, [])

  useEffect(() => {
    if (embedded) {
      setContent(<></>)
      return
    }
    setContent(
      <div className="space-y-4 p-4">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Temporalitat</span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={periodicity}
            onChange={(event) => setPeriodicity(event.target.value)}
          >
            {PERIODICITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
  }, [embedded, periodicity, setContent])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return templates.filter((template) => {
      if (periodicity !== 'all' && template.periodicity !== periodicity) return false
      if (!term) return true
      const haystack = [template.name, template.location, template.primaryOperator, template.backupOperator]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [periodicity, search, templates])

  useEffect(() => {
    if (!embedded) return
    setSelectedTemplateId((current) => {
      if (current && filtered.some((template) => template.id === current)) return current
      return filtered[0]?.id || null
    })
  }, [embedded, filtered])

  const selectedTemplate = useMemo(
    () => filtered.find((template) => template.id === selectedTemplateId) || filtered[0] || null,
    [filtered, selectedTemplateId]
  )

  const selectedTemplateTaskCount = useMemo(
    () =>
      (selectedTemplate?.sections || []).reduce(
        (acc, section) => acc + (Array.isArray(section.items) ? section.items.length : 0),
        0
      ),
    [selectedTemplate]
  )

  useEffect(() => {
    if (!embedded || !selectedTemplate?.id) {
      setSelectedTemplateLastNotes('')
      return
    }

    let cancelled = false

    const loadLastNotes = async () => {
      try {
        const res = await fetch(
          `/api/maintenance/preventius/completed?templateId=${encodeURIComponent(selectedTemplate.id)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          if (!cancelled) setSelectedTemplateLastNotes('')
          return
        }
        const json = await res.json()
        const records = Array.isArray(json?.records) ? json.records : []
        const latestWithNotes = records.find((record) => String(record?.notes || '').trim())
        if (!cancelled) {
          setSelectedTemplateLastNotes(String(latestWithNotes?.notes || '').trim())
        }
      } catch {
        if (!cancelled) setSelectedTemplateLastNotes('')
      }
    }

    void loadLastNotes()

    return () => {
      cancelled = true
    }
  }, [embedded, selectedTemplate?.id])

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
      const xlsx = await import('xlsx')
      const workbook = xlsx.read(buffer, { type: 'array' })
      const parsed = parseWorkbook(file.name, workbook, xlsx.utils)
      setPreview(parsed)
      if (parsed.model === 'B') {
        const first = parsed.templates[0]
        const periods = (first?.sections || [])
          .map((section) => section.location)
          .filter((location) => location !== 'GENERAL' && !!periodFromLabel(location))
        setModelBAvailablePeriods(periods)
        setModelBSelectedPeriods(periods)
        setModelBMode('single')
      } else {
        setModelBAvailablePeriods([])
        setModelBSelectedPeriods([])
        setModelBMode('single')
      }
    } catch {
      setPreview({
        fileName: file?.name || '',
        model: 'UNKNOWN',
        templates: [],
        warnings: ['No s\'ha pogut llegir el fitxer.'],
      })
    }
  }

  const buildModelBImportTargets = (base: ImportCandidate) => {
    const periodSections = base.sections.filter(
      (section) => section.location !== 'GENERAL' && !!periodFromLabel(section.location)
    )
    if (periodSections.length === 0) return [base]
    if (modelBMode === 'single') return [base]

    const selected =
      modelBMode === 'custom'
        ? periodSections.filter((section) => modelBSelectedPeriods.includes(section.location))
        : periodSections

    if (selected.length === 0) return []

    return selected.map((section) => ({
      name: `${base.name} - ${section.location}`,
      periodicity: periodFromLabel(section.location),
      location: base.location,
      sections: [{ location: 'GENERAL', items: section.items }],
    }))
  }

  const importTemplates = async () => {
    if (!preview || preview.templates.length === 0) return
    setImporting(true)
    try {
      const targets = preview.model === 'B' ? buildModelBImportTargets(preview.templates[0]) : preview.templates
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

  const exportTemplateExcel = (template: Template) => {
    try {
      void (async () => {
        const xlsx = await import('xlsx')
        const rows = buildTemplateRows(template)
        const exportDate = formatExportDate()
        const wsRows: Array<Array<string>> = [
          ['DOCUMENT DE PLANTILLA PREVENTIU'],
          [],
          ['Nom plantilla', template.name || '-'],
          ['Data exportacio', exportDate],
          ['Temporalitat', template.periodicity || '-'],
          ['Ubicacio', template.location || '-'],
          ['Operari principal', template.primaryOperator || '-'],
          ['Operari backup', template.backupOperator || '-'],
          ['Ultima revisio', formatDateOnly(template.lastDone)],
          [],
          ['Seccio', 'Tasca', 'Fet', 'Observacions'],
        ]
        rows.forEach((row) => {
          wsRows.push([row.section, row.task, '', ''])
        })
        if (rows.length === 0) wsRows.push(['GENERAL', '-', '', ''])

        const ws = xlsx.utils.aoa_to_sheet(wsRows)
        ws['!cols'] = [{ wch: 28 }, { wch: 90 }, { wch: 10 }, { wch: 38 }]
        const workbook = xlsx.utils.book_new()
        xlsx.utils.book_append_sheet(workbook, ws, 'Plantilla')
        const stamp = new Date().toISOString().slice(0, 10)
        xlsx.writeFile(workbook, `plantilla-${slugify(template.name) || 'preventiu'}-${stamp}.xlsx`)
      })().catch(() => {
        alert("No s'ha pogut exportar la plantilla a Excel.")
      })
    } catch {
      alert("No s'ha pogut exportar la plantilla a Excel.")
    }
  }

  const exportTemplatePdf = (template: Template) => {
    void (async () => {
      const { jsPDF } = await import('jspdf')
      const rows = buildTemplateRows(template)
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
        ['Nom plantilla', template.name || '-'],
        ['Data exportacio', exportDate],
        ['Temporalitat', periodicityLabel[String(template.periodicity || '')] || (template.periodicity || '-')],
        ['Ubicacio', template.location || '-'],
        ['Operari principal', template.primaryOperator || '-'],
        ['Operari backup', template.backupOperator || '-'],
        ['Ultima revisio', formatDateOnly(template.lastDone)],
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
      pdf.save(`plantilla-${slugify(template.name) || 'preventiu'}-${stamp}.pdf`)
    })().catch(() => {
      alert("No s'ha pogut exportar la plantilla a PDF.")
    })
  }

  const deleteTemplate = async (template: Template) => {
    const ok = window.confirm(`Vols eliminar la plantilla "${template.name}"?`)
    if (!ok) return
    try {
      const res = await fetch(`/api/maintenance/templates/${encodeURIComponent(template.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('delete_failed')
      await loadTemplates()
    } catch {
      alert("No s'ha pogut eliminar la plantilla.")
    }
  }

  const content = (
    <div className={embedded ? 'space-y-4' : 'mx-auto w-full max-w-6xl space-y-4 p-4'}>
      {!embedded ? <ModuleHeader subtitle="Plantilles (plans) i checklists" /> : null}

      <ImportTemplatesCard
        preview={preview}
        importing={importing}
        modelBMode={modelBMode}
        modelBAvailablePeriods={modelBAvailablePeriods}
        modelBSelectedPeriods={modelBSelectedPeriods}
        onFileChange={handleFile}
        onClosePreview={() => setPreview(null)}
        onImport={() => void importTemplates()}
        onModelBModeChange={setModelBMode}
        onModelBSelectedPeriodsChange={setModelBSelectedPeriods}
      />

      <TemplatesFiltersCard
        embedded={embedded}
        filteredCount={filtered.length}
        periodicity={periodicity}
        search={search}
        onSearchChange={setSearch}
        onPeriodicityChange={setPeriodicity}
      />

      {embedded ? (
        <EmbeddedTemplatesLayout
          filtered={filtered}
          selectedTemplate={selectedTemplate}
          selectedTemplateTaskCount={selectedTemplateTaskCount}
          selectedTemplateLastNotes={selectedTemplateLastNotes}
          onSelectTemplate={setSelectedTemplateId}
          onOpenTemplate={openTemplate}
        />
      ) : (
        <TemplatesListCard
          filtered={filtered}
          onOpenTemplate={openTemplate}
          onExportPdf={exportTemplatePdf}
          onExportExcel={exportTemplateExcel}
          onDeleteTemplate={(template) => void deleteTemplate(template)}
        />
      )}

      {!hideFab ? <FloatingAddButton onClick={openNew} /> : null}
    </div>
  )

  if (embedded) return content

  return <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>{content}</RoleGuard>
}

export default function PreventiusPlantillesPage() {
  return <PreventiusTemplatesContent />
}
