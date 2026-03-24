//file: src/app/menu/logistica/transports/page.tsx
'use client'

import React, { useMemo, useState } from 'react'
import TransportList from '@/components/transports/TransportList'
import NewTransportModal from '@/components/transports/NewTransportModal'
import { useTransports } from '@/hooks/useTransports'
import type { Transport } from '@/hooks/useTransports'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { Input } from '@/components/ui/input'
import FilterButton from '@/components/ui/filter-button'
import { useFilters as useSlideFilters } from '@/context/FiltersContext'
import TransportFilters, {
  TransportFiltersState,
} from '@/components/transports/TransportFilters'
import ExportMenu from '@/components/export/ExportMenu'
import * as XLSX from 'xlsx'
import { Truck } from 'lucide-react'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
} from '@/lib/transportTypes'

export default function LogisticsTransportsPage() {
  const { data: transports = [], refetch } = useTransports()
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingTransport, setEditingTransport] = useState<Transport | null>(null)

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TransportFiltersState>({
    type: 'all',
    availability: 'all',
    driver: 'all',
  })

  const { setOpen, setContent } = useSlideFilters()
  const typeOrder = useMemo(
    () =>
      TRANSPORT_TYPE_OPTIONS.reduce((acc, option, index) => {
        acc[option.value] = index
        return acc
      }, {} as Record<string, number>),
    []
  )

  const handleSaved = () => {
    setModalOpen(false)
    setEditingTransport(null)
    refetch()
  }

  const handleCreate = () => {
    setEditingTransport(null)
    setModalOpen(true)
  }

  const handleEdit = (t: Transport) => {
    setEditingTransport(t)
    setModalOpen(true)
  }

  const handleDelete = async (t: Transport) => {
    const confirmDelete = window.confirm(`Vols eliminar el vehicle ${t.plate}?`)
    if (!confirmDelete) return

    try {
      const res = await fetch(`/api/transports/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error esborrant vehicle')
      await refetch()
    } catch (err) {
      console.error('Error eliminant vehicle:', err)
      alert(`No s'ha pogut eliminar el vehicle.`)
    }
  }

  const filteredTransports = useMemo(() => {
    return transports
      .filter((t) => {
        const typeLabel = TRANSPORT_TYPE_LABELS[t.type] || t.type || ''
        const txt = `${t.plate ?? ''} ${t.type ?? ''} ${typeLabel}`.toLowerCase()
        const q = search.trim().toLowerCase()

        if (q && !txt.includes(q)) return false
        if (filters.type !== 'all' && t.type !== filters.type) return false

        if (filters.availability !== 'all') {
          const isAvail = !!t.available
          if (filters.availability === 'available' && !isAvail) return false
          if (filters.availability === 'unavailable' && isAvail) return false
        }

        if (filters.driver === 'assigned' && !t.conductorId) return false
        if (filters.driver === 'unassigned' && t.conductorId) return false

        return true
      })
      .sort((a, b) => {
        const typeDiff =
          (typeOrder[a.type] ?? Number.MAX_SAFE_INTEGER) -
          (typeOrder[b.type] ?? Number.MAX_SAFE_INTEGER)
        if (typeDiff !== 0) return typeDiff
        return (a.plate || '').localeCompare(b.plate || '')
      })
  }, [transports, search, filters, typeOrder])

  const exportRows = useMemo(() => {
    return filteredTransports.map((t) => ({
      Matricula: t.plate || '',
      Tipus: TRANSPORT_TYPE_LABELS[t.type] || t.type || '',
      Conductor: t.conductorName || t.conductor || '',
      Disponible: t.available ? 'Sí' : 'No',
      Estat: t.status || '',
    }))
  }, [filteredTransports])

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transports')
    XLSX.writeFile(wb, 'transports.xlsx')
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const cols = ['Matrícula', 'Tipus', 'Conductor', 'Disponible', 'Estat']
    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = filteredTransports
      .map((row) => {
        const cells = [
          row.plate || '',
          TRANSPORT_TYPE_LABELS[row.type] || row.type || '',
          row.conductorName || row.conductor || '',
          row.available ? 'Sí' : 'No',
          row.status || '',
        ].map((value) => `<td>${escapeHtml(String(value ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Transports</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f3f4f6; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Transports</h1>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfView = () => {
    window.print()
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

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  return (
    <section className="space-y-6">
      <ModuleHeader
        icon={<Truck className="h-7 w-7 text-emerald-600" />}
        title="Transports"
        subtitle="Gestió de vehicles i conductors"
        actions={<ExportMenu items={exportItems} />}
      />

      {/* Barra superior */}
      <div className="flex flex-col gap-3 rounded-xl bg-white shadow-sm border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Llistat de vehicles
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Control centralitzat de matrícula, tipus, conductor i disponibilitat.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Input
            placeholder="Cerca per matrícula o tipus…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm md:w-64"
          />

          <FilterButton
            onClick={() => {
              setContent(
                <TransportFilters filters={filters} setFilters={setFilters} />
              )
              setOpen(true)
            }}
          />
        </div>
      </div>

      <div id="transports-print-root">
        <TransportList
          transports={filteredTransports}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <NewTransportModal
        isOpen={isModalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleSaved}
        defaultValues={editingTransport ?? undefined}
      />

      <FloatingAddButton onClick={handleCreate} />
    </section>
  )
}
