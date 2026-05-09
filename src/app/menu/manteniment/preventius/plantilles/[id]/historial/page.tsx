'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import ExportMenu from '@/components/export/ExportMenu'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { addCalBlayLogoToPdf, fetchCalBlayLogoDataUrl, printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { loadXlsx } from '@/lib/loadXlsx'
import { maintenanceStatusBadge } from '@/lib/colors'
import { RoleGuard } from '@/lib/withRoleGuard'

type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semestral' | 'yearly'
  location?: string
  primaryOperator?: string
  backupOperator?: string
}

type CompletedRecord = {
  id: string
  plannedId?: string | null
  templateId?: string | null
  title?: string
  worker?: string | null
  startTime?: string
  endTime?: string
  status?: string
  notes?: string
  completedAt?: string | number
  createdByName?: string
  checklist?: Record<string, boolean>
}

const PERIODICITY_LABELS: Record<string, string> = {
  daily: 'Diari',
  weekly: 'Setmanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semestral: 'Semestral',
  yearly: 'Anual',
}

const STATUS_LABELS: Record<string, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
}

const formatDateTime = (value?: string | number) => {
  if (!value && value !== 0) return '-'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return format(date, 'dd/MM/yyyy HH:mm')
}

const getStatusLabel = (status?: string | null) => {
  const key = String(status || 'assignat').trim().toLowerCase()
  return STATUS_LABELS[key] || key || '-'
}

const getChecklistSummary = (checklist?: Record<string, boolean>) => {
  const values = Object.values(checklist || {})
  if (values.length === 0) return 'Sense checklist'
  const done = values.filter(Boolean).length
  return `${done}/${values.length} checks`
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const MAX_EXPORT_BASE_LENGTH = 80

const buildSafeExportBase = (value?: string | null) => {
  const normalized = String(value || 'plantilla')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const trimmed = normalized.slice(0, MAX_EXPORT_BASE_LENGTH).replace(/-+$/g, '')
  return `historial-${trimmed || 'plantilla'}`
}

export default function PlantillaHistorialPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const [template, setTemplate] = useState<Template | null>(null)
  const [records, setRecords] = useState<CompletedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const [templateRes, recordsRes] = await Promise.all([
          fetch(`/api/maintenance/templates/${encodeURIComponent(id)}`, { cache: 'no-store' }),
          fetch(`/api/maintenance/preventius/completed?templateId=${encodeURIComponent(id)}`, {
            cache: 'no-store',
          }),
        ])

        const templateJson = templateRes.ok ? await templateRes.json() : null
        const recordsJson = recordsRes.ok ? await recordsRes.json() : null

        if (cancelled) return

        setTemplate((templateJson?.template as Template) || null)
        setRecords(Array.isArray(recordsJson?.records) ? recordsJson.records : [])
      } catch (err) {
        if (cancelled) return
        setTemplate(null)
        setRecords([])
        setError(err instanceof Error ? err.message : 'No s ha pogut carregar l historial')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [id])

  const validatedCount = useMemo(
    () => records.filter((record) => ['validat', 'resolut'].includes(String(record.status || ''))).length,
    [records]
  )

  const exportBase = buildSafeExportBase(template?.name)

  const exportRows = useMemo(
    () =>
      records.map((record) => ({
        Titol: record.title || template?.name || 'Preventiu',
        Estat: getStatusLabel(record.status),
        Data: formatDateTime(record.completedAt),
        Operari: record.worker || '-',
        HoraInici: record.startTime || '--:--',
        HoraFi: record.endTime || '--:--',
        Checklist: getChecklistSummary(record.checklist),
        Observacions: record.notes || '',
        CreatPer: record.createdByName || '-',
      })),
    [records, template?.name]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const wb = XLSX.utils.book_new()
    const wsSummary = XLSX.utils.json_to_sheet([
      {
        Plantilla: template?.name || 'Plantilla',
        Periodicitat: PERIODICITY_LABELS[String(template?.periodicity || '')] || '-',
        Ubicacio: template?.location || '-',
        OperariPrincipal: template?.primaryOperator || '-',
        Backup: template?.backupOperator || '-',
        Validats: validatedCount,
        Registres: records.length,
      },
    ])
    const wsHistory = XLSX.utils.json_to_sheet(exportRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resum')
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Historial')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const buildHistoryPdfDocument = async () => {
    const { jsPDF } = await import('jspdf')
    const logoDataUrl = await fetchCalBlayLogoDataUrl()
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
    const margin = 40
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const tableWidth = pageWidth - margin * 2
    const colDate = 88
    const colStatus = 64
    const colWorker = 78
    const colTime = 76
    const colChecklist = 66
    const colTitle = tableWidth - colDate - colStatus - colWorker - colTime - colChecklist

    let y = margin
    const hasLogo = addCalBlayLogoToPdf(pdf, logoDataUrl, {
      x: margin,
      y: y - 8,
      width: 82,
      height: 52,
    })
    if (hasLogo) y += 50

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.text('Historial de manteniment preventiu', margin, y)
    y += 16
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(template?.name || 'Plantilla', margin, y)
    y += 10
    pdf.setDrawColor(190)
    pdf.line(margin, y, pageWidth - margin, y)
    y += 14

    const metaRows: Array<[string, string]> = [
      ['Periodicitat', PERIODICITY_LABELS[String(template?.periodicity || '')] || '-'],
      ['Ubicacio', template?.location || '-'],
      ['Operari principal', template?.primaryOperator || '-'],
      ['Backup', template?.backupOperator || '-'],
      ['Registres', String(records.length)],
      ['Validats', String(validatedCount)],
    ]

    const metaLabelW = 110
    const metaLineH = 11
    const metaMinRowH = 18
    pdf.setFontSize(10)
    metaRows.forEach(([label, value]) => {
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
    const xTitle = margin
    const xDate = xTitle + colTitle
    const xStatus = xDate + colDate
    const xWorker = xStatus + colStatus
    const xTime = xWorker + colWorker
    const xChecklist = xTime + colTime

    const drawHeader = () => {
      pdf.setFillColor(245, 248, 246)
      pdf.rect(margin, y - 11, tableWidth, 20, 'F')
      pdf.setDrawColor(200)
      pdf.rect(margin, y - 11, tableWidth, 20)
      pdf.line(xDate, y - 11, xDate, y + 9)
      pdf.line(xStatus, y - 11, xStatus, y + 9)
      pdf.line(xWorker, y - 11, xWorker, y + 9)
      pdf.line(xTime, y - 11, xTime, y + 9)
      pdf.line(xChecklist, y - 11, xChecklist, y + 9)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.text('Titol', xTitle + 6, y + 2)
      pdf.text('Data', xDate + 6, y + 2)
      pdf.text('Estat', xStatus + 6, y + 2)
      pdf.text('Operari', xWorker + 6, y + 2)
      pdf.text('Hora', xTime + 6, y + 2)
      pdf.text('Checklist', xChecklist + 6, y + 2)
      pdf.setFont('helvetica', 'normal')
      y += 20
    }

    drawHeader()
    const safeRows = exportRows.length > 0 ? exportRows : [{
      Titol: template?.name || 'Preventiu',
      Data: '-',
      Estat: '-',
      Operari: '-',
      HoraInici: '--:--',
      HoraFi: '--:--',
      Checklist: 'Sense registres',
      Observacions: '',
      CreatPer: '-',
    }]

    for (const row of safeRows) {
      const titleLines = pdf.splitTextToSize(String(row.Titol || '-'), colTitle - 10) as string[]
      const checklistLines = pdf.splitTextToSize(String(row.Checklist || '-'), colChecklist - 10) as string[]
      const rowH = Math.max(24, titleLines.length * 11 + 8, checklistLines.length * 11 + 8)
      if (y + rowH > pageHeight - margin) {
        pdf.addPage()
        y = margin
        drawHeader()
      }

      const top = y - 11
      pdf.setDrawColor(220)
      pdf.rect(margin, top, tableWidth, rowH)
      pdf.line(xDate, top, xDate, top + rowH)
      pdf.line(xStatus, top, xStatus, top + rowH)
      pdf.line(xWorker, top, xWorker, top + rowH)
      pdf.line(xTime, top, xTime, top + rowH)
      pdf.line(xChecklist, top, xChecklist, top + rowH)

      pdf.setFontSize(8.5)
      pdf.text(titleLines, xTitle + 6, y + 1)
      pdf.text(pdf.splitTextToSize(String(row.Data || '-'), colDate - 10) as string[], xDate + 6, y + 1)
      pdf.text(pdf.splitTextToSize(String(row.Estat || '-'), colStatus - 10) as string[], xStatus + 6, y + 1)
      pdf.text(pdf.splitTextToSize(String(row.Operari || '-'), colWorker - 10) as string[], xWorker + 6, y + 1)
      pdf.text(`${row.HoraInici || '--:--'} - ${row.HoraFi || '--:--'}`, xTime + 6, y + 1)
      pdf.text(checklistLines, xChecklist + 6, y + 1)
      y += rowH
    }

    return pdf
  }

  const buildPdfTableHtml = () => {
    const rows = exportRows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.Titol)}</td>
          <td>${escapeHtml(row.Estat)}</td>
          <td>${escapeHtml(row.Data)}</td>
          <td>${escapeHtml(row.Operari)}</td>
          <td>${escapeHtml(`${row.HoraInici} - ${row.HoraFi}`)}</td>
          <td>${escapeHtml(row.Checklist)}</td>
          <td>${escapeHtml(row.Observacions)}</td>
        </tr>`
      )
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; text-align: left; }
      th { background: #f3f4f6; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(template?.name || 'Historial plantilla')}</h1>
    <div class="meta">
      Periodicitat: ${escapeHtml(PERIODICITY_LABELS[String(template?.periodicity || '')] || '-')}
      | Ubicacio: ${escapeHtml(template?.location || '-')}
      | Registres: ${escapeHtml(String(records.length))}
    </div>
    <table>
      <thead>
        <tr>
          <th>Titol</th>
          <th>Estat</th>
          <th>Data</th>
          <th>Operari</th>
          <th>Hora</th>
          <th>Checklist</th>
          <th>Observacions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    printBrandedHtmlInNewWindow(buildPdfTableHtml())
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel, disabled: records.length === 0 },
    { label: 'PDF (vista)', onClick: handleExportPdfView, disabled: records.length === 0 },
    { label: 'PDF (taula)', onClick: handleExportPdfTable, disabled: records.length === 0 },
  ]

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="min-h-screen space-y-5 px-4 pb-8">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #manteniment-plantilla-historial-print-root, #manteniment-plantilla-historial-print-root * { visibility: visible; }
            #manteniment-plantilla-historial-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
        <ModuleHeader
          title="Manteniment"
          subtitle="Historial de plantilla"
          mainHref="/menu/manteniment"
        />

        <div id="manteniment-plantilla-historial-print-root" className="space-y-5">
          <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-emerald-900">{template?.name || 'Plantilla'}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-emerald-800/90">
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    Periodicitat: {PERIODICITY_LABELS[String(template?.periodicity || '')] || '-'}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    Ubicacio: {template?.location || '-'}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1">
                    Validats: {validatedCount}
                  </span>
                </div>
                <div className="mt-2 text-xs text-emerald-800/80">
                  Operari principal: {template?.primaryOperator || '-'} | Backup: {template?.backupOperator || '-'}
                </div>
              </div>
              <div className="print:hidden">
                <ExportMenu items={exportItems} ariaLabel="Exportar historial" />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Execucions registrades</div>
              <div className="text-xs text-slate-500">{records.length} registres</div>
            </div>

            {loading ? <div className="px-4 py-6 text-sm text-slate-500">Carregant historial...</div> : null}
            {error ? <div className="px-4 py-6 text-sm text-red-600">{error}</div> : null}
            {!loading && !error && records.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500">Aquesta plantilla encara no te registres.</div>
            ) : null}

            {!loading && !error && records.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {records.map((record) => {
                  const statusKey = String(record.status || 'assignat').trim().toLowerCase()
                  return (
                    <article key={record.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,2fr),auto]">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900">
                            {record.title || template?.name || 'Preventiu'}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              maintenanceStatusBadge(statusKey)
                            }`}
                          >
                            {getStatusLabel(record.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                          <span>Data: {formatDateTime(record.completedAt)}</span>
                          <span>Operari: {record.worker || '-'}</span>
                          <span>
                            Hora: {record.startTime || '--:--'} - {record.endTime || '--:--'}
                          </span>
                          <span>{getChecklistSummary(record.checklist)}</span>
                        </div>
                        {record.notes ? <div className="text-sm text-slate-600">{record.notes}</div> : null}
                      </div>

                      <div className="flex items-center print:hidden">
                        <Link
                          href={`/menu/manteniment/preventius/completat/${encodeURIComponent(record.id)}`}
                          target="_blank"
                          className="inline-flex min-h-[44px] items-center rounded-full border border-sky-200 px-4 text-sm font-medium text-sky-700"
                        >
                          Obrir detall
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </RoleGuard>
  )
}
