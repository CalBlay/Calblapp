//file: src/app/menu/logistica/transports/page.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import TransportList from '@/components/transports/TransportList'
import NewTransportModal from '@/components/transports/NewTransportModal'
import TransportTypesPanel from '@/components/transports/TransportTypesPanel'
import TransportReviewNotificationsBell from './TransportReviewNotificationsBell'
import { useTransports } from '@/hooks/useTransports'
import type { Transport } from '@/hooks/useTransports'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FloatingAddButton from '@/components/ui/floating-add-button'
import FilterButton from '@/components/ui/filter-button'
import {
  CorporateFilterField,
  CorporateFilterSearch,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { useFilters as useSlideFilters } from '@/context/FiltersContext'
import TransportFilters, {
  TransportFiltersState,
} from '@/components/transports/TransportFilters'
import ExportMenu from '@/components/export/ExportMenu'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { Truck } from 'lucide-react'
import { List, Settings2 } from 'lucide-react'
import {
  TRANSPORT_TYPE_LABELS,
} from '@/lib/transportTypes'
import { useTransportTypes } from '@/hooks/useTransportTypes'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  TRANSPORTS_TYPES_MANAGE_PERM,
  TRANSPORTS_UI_PATH,
} from '@/lib/transportsPermissions'

export default function LogisticsTransportsPage() {
  const { data: transports = [], refetch } = useTransports()
  const { data: transportTypes, refetch: refetchTransportTypes } = useTransportTypes(true)
  const { ready: permissionsReady, hasAction, canEditPath } = useUiPermissions()
  const canEditFleet = permissionsReady && canEditPath(TRANSPORTS_UI_PATH)
  const canManageTypes = permissionsReady && hasAction(TRANSPORTS_TYPES_MANAGE_PERM)
  const [activeTab, setActiveTab] = useState<'fleet' | 'types'>('fleet')
  const [isModalOpen, setModalOpen] = useState(false)
  const [editingTransport, setEditingTransport] = useState<Transport | null>(null)
  const [notificationsRefreshSignal, setNotificationsRefreshSignal] = useState(0)

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TransportFiltersState>({
    type: 'all',
    availability: 'all',
    driver: 'all',
  })

  const { setOpen, setContent } = useSlideFilters()
  const typeOrder = useMemo(
    () =>
      transportTypes.reduce((acc, option, index) => {
        acc[option.value] = index
        return acc
      }, {} as Record<string, number>),
    [transportTypes]
  )
  const typeLabels = useMemo(
    () =>
      transportTypes.reduce((acc, option) => {
        acc[option.value] = option.label
        return acc
      }, { ...TRANSPORT_TYPE_LABELS } as Record<string, string>),
    [transportTypes]
  )

  useEffect(() => {
    if (permissionsReady && !canManageTypes && activeTab === 'types') setActiveTab('fleet')
  }, [activeTab, canManageTypes, permissionsReady])

  useEffect(() => {
    void fetch('/api/transports/review-alerts', { method: 'POST' })
      .then(() => {
        setNotificationsRefreshSignal(Date.now())
      })
      .catch((error) => {
        console.error('Error comprovant revisions pendents de transports:', error)
      })
  }, [])

  const handleSaved = () => {
    setModalOpen(false)
    setEditingTransport(null)
    refetch()
  }

  const handleCreate = () => {
    if (!canEditFleet) return
    setEditingTransport(null)
    setModalOpen(true)
  }

  const handleEdit = (t: Transport) => {
    if (!canEditFleet) return
    setEditingTransport(t)
    setModalOpen(true)
  }

  const handleDelete = async (t: Transport) => {
    if (!canEditFleet) return
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
        const typeLabel = typeLabels[t.type] || t.type || ''
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
  }, [transports, search, filters, typeOrder, typeLabels])

  const exportRows = useMemo(() => {
    return filteredTransports.map((t) => ({
      Matricula: t.plate || '',
      Tipus: typeLabels[t.type] || t.type || '',
      Conductor: t.conductorName || t.conductor || '',
      Disponible: t.available ? 'Sí' : 'No',
      Refrigerat: t.refrigerated ? 'Sí' : 'No',
      'Revisió fred': t.refrigerationReviewDate || '',
      'Caducitat fred': t.refrigerationExpiryDate || '',
      'Km propera revisió': t.nextServiceKm ?? '',
      Estat: t.status || '',
    }))
  }, [filteredTransports, typeLabels])

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
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
    const cols = [
      'Matrícula',
      'Tipus',
      'Conductor',
      'Disponible',
      'Refrigerat',
      'Revisió fred',
      'Caducitat fred',
      'Km propera revisió',
      'Estat',
    ]
    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = filteredTransports
      .map((row) => {
        const cells = [
          row.plate || '',
          typeLabels[row.type] || row.type || '',
          row.conductorName || row.conductor || '',
          row.available ? 'Sí' : 'No',
          row.refrigerated ? 'Sí' : 'No',
          row.refrigerationReviewDate || '',
          row.refrigerationExpiryDate || '',
          row.nextServiceKm ?? '',
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
    printBrandedHtmlInNewWindow(html)
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
        actions={activeTab === 'fleet' ? (
          <>
            <TransportReviewNotificationsBell refreshSignal={notificationsRefreshSignal} />
            <ExportMenu items={exportItems} />
          </>
        ) : undefined}
      />

      {canManageTypes ? (
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'fleet'}
            onClick={() => setActiveTab('fleet')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === 'fleet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <List className="h-4 w-4" />
            Flota
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'types'}
            onClick={() => setActiveTab('types')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === 'types' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Tipologies
          </button>
        </div>
      ) : null}

      {activeTab === 'fleet' ? (
        <>
      <CorporateFiltersShell variant="toolbar">
        <CorporateFilterField label="Cercar vehicle" className="min-w-[220px] flex-1">
          <CorporateFilterSearch
            placeholder="Cerca per matrícula o tipus…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-sm"
          />
        </CorporateFilterField>

        <FilterButton
          onClick={() => {
            setContent(
              <TransportFilters
                filters={filters}
                setFilters={setFilters}
                transportTypes={transportTypes}
              />
            )
            setOpen(true)
          }}
        />
      </CorporateFiltersShell>

      <div id="transports-print-root">
        <TransportList
          transports={filteredTransports}
          onEdit={handleEdit}
          onDelete={handleDelete}
          transportTypes={transportTypes}
          canEdit={canEditFleet}
        />
      </div>

      {canEditFleet ? (
        <NewTransportModal
          isOpen={isModalOpen}
          onOpenChange={setModalOpen}
          onCreated={handleSaved}
          defaultValues={editingTransport ?? undefined}
          transportTypes={transportTypes}
        />
      ) : null}

      {canEditFleet ? <FloatingAddButton onClick={handleCreate} /> : null}
        </>
      ) : canManageTypes ? (
        <TransportTypesPanel onChanged={() => refetchTransportTypes()} />
      ) : null}
    </section>
  )
}
