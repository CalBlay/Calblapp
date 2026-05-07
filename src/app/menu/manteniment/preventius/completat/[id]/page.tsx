'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import ExportMenu from '@/components/export/ExportMenu'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { loadXlsx } from '@/lib/loadXlsx'
import { RoleGuard } from '@/lib/withRoleGuard'

type TemplateSection = { location: string; items: { label: string }[] }
type Template = {
  id: string
  name: string
  sections: TemplateSection[]
}

type CompletedRecord = {
  id: string
  plannedId?: string | null
  templateId?: string | null
  title: string
  worker?: string | null
  startTime?: string
  endTime?: string
  status?: string
  notes?: string
  completedAt?: string | number
  checklist?: Record<string, boolean>
}

const toCompletedAtDate = (value?: string | number) => {
  if (value == null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export default function PreventiuCompletatPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string)
  const [record, setRecord] = useState<CompletedRecord | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/maintenance/preventius/completed/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setRecord(json?.record || null)
      if (json?.record?.templateId) {
        const resTpl = await fetch('/api/maintenance/templates', { cache: 'no-store' })
        if (!resTpl.ok) return
        const jsonTpl = await resTpl.json()
        const list = Array.isArray(jsonTpl?.templates) ? jsonTpl.templates : []
        const found = list.find((t: Template) => t.id === json.record.templateId) || null
        setTemplate(found)
      }
    }
    load()
  }, [id])

  const checklistEntries = useMemo(() => {
    const map = record?.checklist || {}
    return map
  }, [record])

  const checklistRows = useMemo(() => {
    if (template) {
      return template.sections.flatMap((sec) =>
        sec.items.map((it) => {
          const key = `${sec.location}::${it.label}`
          return {
            Grup: sec.location,
            Camp: it.label,
            Fet: checklistEntries[key] ? 'Si' : 'No',
          }
        })
      )
    }

    return Object.entries(checklistEntries).map(([key, done]) => {
      const [group, ...rest] = key.split('::')
      return {
        Grup: group || 'GENERAL',
        Camp: rest.join('::') || key,
        Fet: done ? 'Si' : 'No',
      }
    })
  }, [checklistEntries, template])

  const exportBase = `preventiu-${(record?.title || 'completat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'completat'}`

  const exportDate = toCompletedAtDate(record?.completedAt)
    ? format(toCompletedAtDate(record?.completedAt) as Date, 'dd/MM/yyyy HH:mm')
    : '-'

  const handleExportExcel = async () => {
    if (!record) return
    const XLSX = await loadXlsx()
    const metadata = [
      {
        Titol: record.title,
        Data: exportDate,
        Operari: record.worker || '-',
        Estat: record.status || 'pendent',
        HoraInici: record.startTime || '--:--',
        HoraFi: record.endTime || '--:--',
        Notes: record.notes || '',
      },
    ]
    const wb = XLSX.utils.book_new()
    const wsMeta = XLSX.utils.json_to_sheet(metadata)
    const wsChecklist = XLSX.utils.json_to_sheet(checklistRows)
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Fitxa')
    XLSX.utils.book_append_sheet(wb, wsChecklist, 'Checklist')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const buildPdfTableHtml = () => {
    const checklistSummary = `${checklistRows.filter((row) => row.Fet === 'Si').length}/${checklistRows.length || 0}`
    const rows = checklistRows
      .map(
        (row, index) =>
          `<tr>
            <td>${String(index + 1).padStart(2, '0')}</td>
            <td>${escapeHtml(row.Grup)}</td>
            <td>${escapeHtml(row.Camp)}</td>
            <td>${escapeHtml(row.Fet)}</td>
          </tr>`
      )
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      @page { size: A4; margin: 20mm 14mm 18mm; }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        color: #1f2937;
        font-size: 12px;
        line-height: 1.45;
        background: #fff;
      }
      .calblay-print-brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        margin: 0 0 22px;
        padding: 0 0 14px;
        border-bottom: 2px solid #d7dfd8;
      }
      .calblay-print-brand__logo {
        width: 180px;
        height: 58px;
        object-fit: contain;
        object-position: left center;
      }
      .report-head {
        text-align: right;
        min-width: 0;
      }
      .report-kicker {
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #6b7280;
        font-weight: 700;
      }
      .report-title {
        margin: 6px 0 0;
        font-size: 22px;
        line-height: 1.15;
        color: #0f172a;
        font-weight: 700;
      }
      .report-subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: #475569;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 0 0 18px;
      }
      .meta-card {
        border: 1px solid #dbe4dc;
        border-radius: 10px;
        padding: 10px 12px;
        background: #f8fbf8;
      }
      .meta-label {
        display: block;
        margin-bottom: 4px;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 700;
      }
      .meta-value {
        font-size: 13px;
        color: #0f172a;
        font-weight: 600;
      }
      .section {
        margin-top: 18px;
      }
      .section-title {
        margin: 0 0 10px;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #14532d;
        font-weight: 700;
      }
      .notes-box {
        border: 1px solid #dbe4dc;
        border-radius: 10px;
        padding: 12px;
        background: #fff;
        white-space: pre-wrap;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      th, td {
        border: 1px solid #d9e2da;
        padding: 8px 9px;
        vertical-align: top;
        text-align: left;
      }
      thead th {
        background: #eef6ef;
        color: #14532d;
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      tbody tr:nth-child(even) td {
        background: #fafcfb;
      }
      .col-num {
        width: 42px;
      }
      .col-status {
        width: 74px;
      }
      .footer {
        margin-top: 18px;
        padding-top: 10px;
        border-top: 1px solid #d7dfd8;
        font-size: 10px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="calblay-print-brand">
      <img
        src="/logo.png"
        alt="Cal Blay"
        class="calblay-print-brand__logo"
        data-calblay-print-logo="true"
      />
      <div class="report-head">
        <div class="report-kicker">Document tecnic de manteniment</div>
        <div class="report-title">Fitxa de preventiu completat</div>
        <div class="report-subtitle">${escapeHtml(record?.title || 'Preventiu completat')}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-card">
        <span class="meta-label">Data execucio</span>
        <div class="meta-value">${escapeHtml(exportDate)}</div>
      </div>
      <div class="meta-card">
        <span class="meta-label">Estat</span>
        <div class="meta-value">${escapeHtml(record?.status || 'pendent')}</div>
      </div>
      <div class="meta-card">
        <span class="meta-label">Operari</span>
        <div class="meta-value">${escapeHtml(record?.worker || '-')}</div>
      </div>
      <div class="meta-card">
        <span class="meta-label">Franja horaria</span>
        <div class="meta-value">${escapeHtml(record?.startTime || '--:--')} - ${escapeHtml(record?.endTime || '--:--')}</div>
      </div>
      <div class="meta-card">
        <span class="meta-label">Plantilla base</span>
        <div class="meta-value">${escapeHtml(template?.name || 'No disponible')}</div>
      </div>
      <div class="meta-card">
        <span class="meta-label">Resultat checklist</span>
        <div class="meta-value">${escapeHtml(checklistSummary)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Observacions tecniques</div>
      <div class="notes-box">${escapeHtml(record?.notes || 'Sense observacions addicionals.')}</div>
    </div>

    <div class="section">
      <div class="section-title">Detall de comprovacions</div>
      <table>
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Grup</th>
          <th>Element verificat</th>
          <th class="col-status">Resultat</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>

    <div class="footer">
      Informe intern de manteniment per a revisio tecnica i qualitat.
    </div>
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
    { label: 'Excel (.xlsx)', onClick: handleExportExcel, disabled: !record },
    { label: 'PDF (vista)', onClick: handleExportPdfView, disabled: !record },
    { label: 'PDF (taula)', onClick: handleExportPdfTable, disabled: !record },
  ]

  if (!record) {
    return (
      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <div className="p-6 text-sm text-gray-600">Checklist no trobat.</div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="min-h-screen w-full bg-white flex flex-col">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #manteniment-preventiu-completat-print-root, #manteniment-preventiu-completat-print-root * { visibility: visible; }
            #manteniment-preventiu-completat-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
        <ModuleHeader subtitle={record.title} />

        <div className="border-b px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="text-base font-semibold text-gray-900">{record.title}</div>
          <div className="flex items-center gap-2">
            <ExportMenu items={exportItems} ariaLabel="Exportar fitxa completada" />
            <button
              type="button"
              className="rounded-full border px-4 py-2 text-xs text-gray-600"
              onClick={() => window.close()}
            >
              Tancar pestanya
            </button>
          </div>
        </div>

        <div id="manteniment-preventiu-completat-print-root" className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-0">
            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto border-b xl:border-b-0 xl:border-r">
              <div className="grid grid-cols-1 gap-4 text-sm pb-24 xl:pb-6">
                <div className="text-xs text-gray-600">
                  Data: {exportDate}
                </div>
                <div className="text-xs text-gray-600">Operari: {record.worker || '-'}</div>
                <div className="text-xs text-gray-600">Estat: {record.status || 'pendent'}</div>
                <div className="text-xs text-gray-600">
                  Hora: {record.startTime || '--:--'}-{record.endTime || '--:--'}
                </div>
                {record.notes && (
                  <div className="text-xs text-gray-600">Notes: {record.notes}</div>
                )}
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto">
              <div className="text-xs text-gray-600 mb-2">Checklist</div>
              <div className="rounded-2xl border px-2 py-2 text-xs text-gray-700">
                {template ? (
                  template.sections.map((sec) => (
                    <div key={sec.location} className="border-b last:border-b-0">
                      <div className="w-full flex items-center justify-between px-3 py-3 text-left">
                        <div className="text-[11px] font-semibold text-gray-700">
                          {sec.location}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {sec.items.filter((it) => checklistEntries[`${sec.location}::${it.label}`]).length}/{sec.items.length}
                        </div>
                      </div>
                      <div className="px-3 pb-4 space-y-2">
                        {sec.items.map((it, index) => {
                          const key = `${sec.location}::${it.label}`
                          const done = !!checklistEntries[key]
                          return (
                            <label key={`${key}::${index}`} className="flex items-start gap-2">
                              <input type="checkbox" checked={done} readOnly />
                              <span className="leading-snug">{it.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 space-y-2">
                    {Object.entries(checklistEntries).map(([key, done]) => (
                      <label key={key} className="flex items-start gap-2">
                        <input type="checkbox" checked={!!done} readOnly />
                        <span className="leading-snug">{key.split('::').slice(1).join('::')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  )
}
