'use client'

import React, { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { Truck } from 'lucide-react'
import * as XLSX from 'xlsx'

import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import ExportMenu from '@/components/export/ExportMenu'
import {
  useTransportAssignments,
  type TransportAssignmentItem,
} from './hooks/useTransportAssignments'
import TransportAssignmentCard from './components/TransportAssignmentCard'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'

interface AssignmentVehicleRow {
  department?: string
  name?: string
  plate?: string
  vehicleType?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
  startDate?: string
  endDate?: string
}

export default function TransportAssignacionsPage() {
  useSession()

  // Filtres inicials: setmana actual
  const initialFilters: FiltersState = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    const end = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      mode: 'week',
    }
  }, [])

  const [filters, setFilters] = useState<FiltersState>(initialFilters)

  const { items, loading, error, refetch } =
    useTransportAssignments(filters.start, filters.end)

  const grouped = useMemo(() => {
    const map: Record<string, TransportAssignmentItem[]> = {}
    for (const it of items) {
      const day = it.day || 'sense-data'
      if (!map[day]) map[day] = []
      map[day].push(it)
    }
    return Object.entries(map).sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
  }, [items])

  const exportBase = `assignacions-logistica-${filters.start}-${filters.end}`

  const exportRows = useMemo(() => {
    const rows: Record<string, string | number>[] = []

    items.forEach((it) => {
      const vehicles: AssignmentVehicleRow[] = Array.isArray(it.rows) ? it.rows : []
      const base = {
        Data: it.day || '',
        HoraEvent: it.eventStartTime || '',
        HoraFiEvent: it.eventEndTime || '',
        Event: it.eventName || '',
        Ubicacio: it.location || '',
        Pax: it.pax ?? '',
        Estat: it.status || '',
        Servei: it.service || '',
        Codi: it.eventCode || '',
      }

      if (vehicles.length === 0) {
        rows.push({
          ...base,
          Departament: '',
          Conductor: '',
          Matricula: '',
          Vehicle: '',
          Sortida: '',
          Arribada: '',
          Fi: '',
          DataSortida: '',
          DataArribada: '',
        })
        return
      }

      vehicles.forEach((v) => {
        rows.push({
          ...base,
          Departament: v.department || '',
          Conductor: v.name || '',
          Matricula: v.plate || '',
          Vehicle:
            TRANSPORT_TYPE_LABELS[v.vehicleType || ''] || v.vehicleType || '',
          Sortida: v.startTime || '',
          Arribada: v.arrivalTime || '',
          Fi: v.endTime || '',
          DataSortida: v.startDate || '',
          DataArribada: v.endDate || '',
        })
      })
    })

    return rows
  }, [items])

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assignacions')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const cols = [
      'Data',
      'HoraEvent',
      'HoraFiEvent',
      'Event',
      'Ubicacio',
      'Pax',
      'Estat',
      'Servei',
      'Codi',
      'Departament',
      'Conductor',
      'Matricula',
      'Vehicle',
      'Sortida',
      'Arribada',
      'Fi',
      'DataSortida',
      'DataArribada',
    ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String((row as any)[key] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Assignacions de transport</h1>
    <div class=\"meta\">Rang: ${escapeHtml(filters.start)} - ${escapeHtml(
      filters.end
    )}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  return (
    <main className="space-y-6 px-4 pb-12">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #assignacions-print-root, #assignacions-print-root * { visibility: visible; }
          #assignacions-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <ModuleHeader
        icon={<Truck className="h-6 w-6 text-emerald-600" />}
        title="Assignacions de transport"
        subtitle="Vehicles i conductors per esdeveniment"
        actions={<ExportMenu items={exportItems} />}
      />

      <FiltersBar
        filters={filters}
        setFilters={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      {loading && (
        <p className="py-10 text-center text-gray-500">
          Carregant assignacions...
        </p>
      )}

      {error && (
        <p className="py-10 text-center text-red-600">{String(error)}</p>
      )}

      {!loading && !error && grouped.length === 0 && (
        <p className="py-10 text-center text-gray-400">
          Cap esdeveniment amb demanda o assignacio en aquest rang.
        </p>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div id="assignacions-print-root" className="space-y-6">
          {grouped.map(([day, evs]) => (
            <section key={day} className="space-y-3">
              <div className="rounded-xl border bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
                {day}
              </div>

              <div className="space-y-3">
                {evs.map((ev) => (
                  <TransportAssignmentCard
                    key={ev.eventCode}
                    item={ev}
                    onChanged={refetch}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
