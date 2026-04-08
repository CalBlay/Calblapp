// file: src/app/menu/modifications/page.tsx
'use client'

import React, { useMemo, useState } from 'react'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { useModifications } from '@/hooks/useModifications'
import ModificationsTable from './components/ModificationsTable'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { FileEdit } from 'lucide-react'
import FilterButton from '@/components/ui/filter-button'
import { useFilters } from '@/context/FiltersContext'
import FloatingAddButton from '@/components/ui/floating-add-button'
import CreateModificationModal from '@/components/events/CreateModificationModal'
import useEvents from '@/hooks/events/useEvents'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import ExportMenu from '@/components/export/ExportMenu'
import { useSession } from 'next-auth/react'
import { loadXlsx } from '@/lib/loadXlsx'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

export default function ModificationsPage() {
  const { data: session } = useSession()
  const initialWeek = useMemo(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      from: format(s, 'yyyy-MM-dd'),
      to: format(e, 'yyyy-MM-dd'),
    }
  }, [])

  const [filters, setFilters] = useState<{
    from?: string
    to?: string
    department?: string
    importance?: string
    categoryLabel?: string
    commercial?: string
  }>({
    ...initialWeek,
    importance: 'all',
    categoryLabel: 'all',
    commercial: 'all',
  })

  const {
    modifications,
    loading,
    error,
    updateModification,
    deleteModification,
    refetch,
  } = useModifications(filters)
  const { events } = useEvents(
    filters.department || 'all',
    filters.from || initialWeek.from,
    filters.to || initialWeek.to,
    'all'
  )
  const [showAdd, setShowAdd] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const formatEventDay = (value?: string) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return format(parsed, 'dd/MM')
  }

  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    modifications.forEach((m) => {
      const d = m.department?.trim()
      if (d) set.add(d)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [modifications])

  const commercialOptions = useMemo(() => {
    const set = new Set<string>()
    modifications.forEach((m) => {
      const c = m.eventCommercial?.trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [modifications])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    modifications.forEach((m) => {
      const label = m.category?.label?.trim()
      if (label) set.add(label)
    })
    return Array.from(set).map((label) => ({ id: label, label }))
  }, [modifications])

  const totalMods = modifications.length

  const handleFilterChange = (f: SmartFiltersChange) => {
    setFilters((prev) => ({
      ...prev,
      from: f.start,
      to: f.end,
      department: f.department,
      importance: f.importance || 'all',
      categoryLabel: f.categoryId && f.categoryId !== 'all' ? f.categoryId : 'all',
      commercial: f.commercial || 'all',
    }))
  }

  const { setContent, setOpen } = useFilters()

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Departament</label>
          <Select
            value={filters.department || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, department: v === 'all' ? undefined : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Comercial</label>
          <Select
            value={filters.commercial || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, commercial: v === 'all' ? undefined : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              {commercialOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Importància</label>
          <Select
            value={filters.importance || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, importance: v === 'all' ? 'all' : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="mitjana">Mitjana</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Categoria</label>
          <Select
            value={filters.categoryLabel || 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, categoryLabel: v === 'all' ? 'all' : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
    setOpen(true)
  }

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    return events.find((e) => e.id === selectedEventId) || null
  }, [events, selectedEventId])

  const exportBase = `modificacions-${filters.from || 'start'}-${filters.to || 'end'}`

  const exportRows = useMemo(
    () =>
      modifications.map((m) => ({
        DataEvent: (m.eventDate || '').slice(0, 10),
        Event: m.eventTitle || '',
        Codi: m.eventCode || '',
        Ubicacio: m.eventLocation || '',
        Comercial: m.eventCommercial || '',
        Departament: m.department || '',
        Importancia: m.importance || '',
        Categoria: m.category?.label || '',
        Tipus: m.tipus || '',
        Descripcio: m.description || '',
        Creada: (m.createdAt || '').slice(0, 19),
        Creador: m.createdBy || '',
        Correu: m.createdByEmail || '',
      })),
    [modifications]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Modificacions')
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
      'DataEvent',
      'Event',
      'Codi',
      'Ubicacio',
      'Comercial',
      'Departament',
      'Importancia',
      'Categoria',
      'Tipus',
      'Descripcio',
      'Creada',
      'Creador',
      'Correu',
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
    <meta charset="utf-8" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Modificacions</h1>
    <div class="meta">Rang: ${escapeHtml(filters.from || '')} - ${escapeHtml(
      filters.to || ''
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
    <div className="p-4 flex flex-col gap-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #modificacions-print-root, #modificacions-print-root * { visibility: visible; }
          #modificacions-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <ModuleHeader
        icon={<FileEdit className="w-7 h-7 text-purple-700" />}
        title="Registre de modificacions"
        subtitle="Consulta totes les modificacions registrades als esdeveniments"
        actions={<ExportMenu items={exportItems} />}
      />

      <div className="text-sm font-medium px-1">
        Total modificacions: {totalMods}
      </div>

      {/* Barra compacta: només dates + botó filtres */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm mb-2 flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <SmartFilters
          role="Direcció"
          onChange={handleFilterChange}
          showDepartment={false}
          showCommercial={false}
          showImportance={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          categoryOptions={categoryOptions}
          showAdvanced={false}
          compact
        />
        <div className="flex-1 min-w-[8px]" />
        <FilterButton onClick={openFiltersPanel} />
      </div>

      {loading && <p className="text-center py-10">Carregant...</p>}
      {error && <p className="text-center py-10 text-red-500">{error}</p>}
      {!loading && (
        <div id="modificacions-print-root">
          <ModificationsTable
            modifications={modifications}
            onUpdate={updateModification}
            onDelete={deleteModification}
            currentUserId={(session?.user as any)?.id}
            currentUserName={(session?.user as any)?.name || (session?.user as any)?.email}
            currentUserEmail={(session?.user as any)?.email}
          />
        </div>
      )}

      <FloatingAddButton onClick={() => setShowAdd(true)} />

      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setSelectedEventId(null) }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-purple-900">
              Nova modificació
            </DialogTitle>
            <p className="text-sm text-gray-500">
              Escull l&apos;esdeveniment dins del rang de dates seleccionat.
            </p>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Esdeveniment</label>
            <Select
              value={selectedEventId || ''}
              onValueChange={(v) => setSelectedEventId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={events.length ? 'Selecciona esdeveniment' : 'Cap esdeveniment en el rang'} />
              </SelectTrigger>
              <SelectContent>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {formatEventDay(ev.day)} · {ev.summary} · {ev.location || 'Sense ubicació'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setShowAdd(false); setSelectedEventId(null) }}>
              Cancel·la
            </Button>
            <Button
              disabled={!selectedEventId}
              onClick={() => {
                if (selectedEventId) {
                  setShowAdd(false)
                }
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedEvent && (
        <CreateModificationModal
          event={{ id: selectedEvent.id, summary: selectedEvent.summary }}
          user={{
            name: (session?.user as any)?.name || (session?.user as any)?.email || 'Usuari',
            department: (session?.user as any)?.department || filters.department || 'desconegut',
          }}
          onClose={() => setSelectedEventId(null)}
          onCreated={async () => {
            setSelectedEventId(null)
            await refetch()
          }}
        />
      )}
    </div>
  )
}
