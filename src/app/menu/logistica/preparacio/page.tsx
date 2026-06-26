// file: src/app/menu/logistica/preparacio/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import { RoleGuard } from '@/lib/withRoleGuard'
import { LogisticsGrid } from '@/components/logistics'
import { useLogisticsData } from '@/hooks/useLogisticsData'
import type { LogisticsEventPrepRow, LogisticsWarehousePrepRow } from '@/lib/logistics/prepTypes'
import {
  EVENT_COMANDA_BATCH_STATUS_LABELS,
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import { WAREHOUSE_PREP_VIEW_ROLE_LABELS } from '@/lib/logistics/warehousePrepVisibility'
import {
  buildDashboardHref,
  buildDefaultWeekRange,
  buildTodayRange,
  parseDateRangeFromSearch,
  parseFilterMode,
  parseRoleForPreparationFilters,
  type PreparationFilterMode,
} from '@/lib/logistics/preparationFilters'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'
import type { EditedMap } from '@/components/logistics/LogisticsGrid'
import type { AllowedPreparationWarehouse } from '@/components/logistics/PreparationWarehouseToggles'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { BarChart3, Truck } from 'lucide-react'
import { formatDateOnly, formatDayMonthValue } from '@/lib/date-format'

interface PreparationExportRow {
  PreparacioData: string
  PreparacioHora: string
  CodiEvent: string
  Event: string
  Ubicacio: string
  Pax: string | number
  DataEvent: string
  HoraEvent: string
}

export default function LogisticsPage() {
  const searchParams = useSearchParams()
  const searchParamsSafe = searchParams ?? new URLSearchParams()
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()
  const isWorker = role === 'treballador'
  const isManager = role === 'cap' || role === 'admin' || role === 'direccio'

  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(() => {
    const fallback = isWorker ? buildTodayRange() : buildDefaultWeekRange()
    return parseDateRangeFromSearch(searchParamsSafe, fallback)
  })
  const [filterMode, setFilterMode] = useState<PreparationFilterMode>(() =>
    parseFilterMode(searchParamsSafe.get('mode'))
  )
  const latestFilterRef = useRef({
    dateRange: parseDateRangeFromSearch(
      searchParamsSafe,
      isWorker ? buildTodayRange() : buildDefaultWeekRange()
    ),
    mode: parseFilterMode(searchParamsSafe.get('mode')) as PreparationFilterMode,
  })

  useEffect(() => {
    if (dateRange?.start && dateRange?.end) {
      latestFilterRef.current = { dateRange, mode: filterMode }
    }
  }, [dateRange, filterMode])
  const { events, warehouseTasks, refresh, loading } = useLogisticsData(dateRange)
  const [updating, setUpdating] = useState(false)
  const [edited, setEdited] = useState<EditedMap>({})
  const [manualRows, setManualRows] = useState<LogisticsEventPrepRow[]>([])
  const [locationOptions, setLocationOptions] = useState<string[]>([])
  const [allowedWarehouses, setAllowedWarehouses] = useState<AllowedPreparationWarehouse[]>([])

  useEffect(() => {
    let ignore = false

    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/logistics/preparation-warehouses', { cache: 'no-store' })
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; warehouses?: AllowedPreparationWarehouse[] }
          | null
        if (!res.ok || !json?.ok) return
        if (!ignore) {
          setAllowedWarehouses(Array.isArray(json.warehouses) ? json.warehouses : [])
        }
      } catch (error) {
        console.error('Error carregant magatzems de preparació:', error)
      }
    }

    void loadWarehouses()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    const loadLocations = async () => {
      try {
        const res = await fetch('/api/logistics/locations', { cache: 'no-store' })
        const json = (await res.json().catch(() => null)) as { locations?: string[] } | null
        if (!res.ok) throw new Error('No s’han pogut carregar les finques')
        if (!ignore) {
          setLocationOptions(
            Array.isArray(json?.locations)
              ? json.locations.map((item) => String(item || '').trim()).filter(Boolean)
              : []
          )
        }
      } catch (error) {
        console.error('Error carregant finques per logística:', error)
      }
    }

    void loadLocations()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!isWorker) return

    setDateRange((prev) => {
      const defaultWeek = buildDefaultWeekRange()
      if (
        !prev ||
        (prev.start === defaultWeek.start && prev.end === defaultWeek.end)
      ) {
        return buildTodayRange()
      }
      return prev
    })
  }, [isWorker])

  const rows = useMemo(() => {
    const allRows = [...events, ...manualRows]
    return allRows.sort((a, b) => {
      const aHas = !!(a.PreparacioData && a.PreparacioHora)
      const bHas = !!(b.PreparacioData && b.PreparacioHora)
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
      if (!aHas && !bHas) {
        return new Date(a.DataInici).getTime() - new Date(b.DataInici).getTime()
      }
      const d1 = new Date(`${a.PreparacioData}T${a.PreparacioHora || '00:00'}`).getTime()
      const d2 = new Date(`${b.PreparacioData}T${b.PreparacioHora || '00:00'}`).getTime()
      return d1 - d2
    })
  }, [events, manualRows])

  const handleFilterChange = (f: SmartFiltersChange) => {
    if (f.start && f.end) {
      const nextRange = { start: f.start, end: f.end }
      setDateRange(nextRange)
      latestFilterRef.current = {
        dateRange: nextRange,
        mode: f.mode || filterMode,
      }
    }
    if (f.mode) {
      setFilterMode(f.mode)
      latestFilterRef.current = {
        ...latestFilterRef.current,
        mode: f.mode,
      }
    }
  }

  const handleOpenDashboard = () => {
    const { dateRange: currentRange, mode } = latestFilterRef.current
    const href = buildDashboardHref(currentRange, mode)
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const handleRefresh = async () => {
    setUpdating(true)
    await refresh()
    setManualRows([])
    setEdited({})
    setUpdating(false)
  }

  const handleAddRow = useCallback(() => {
    const baseDate = dateRange?.start || new Date().toISOString().slice(0, 10)
    const draftId = `draft_${Date.now()}_${manualRows.length}`
    setManualRows((prev) => [
      ...prev,
      {
        rowType: 'event',
        id: draftId,
        EventCode: '',
        NomEvent: '',
        Ubicacio: '',
        NumPax: undefined,
        DataInici: baseDate,
        DataVisual: baseDate,
        HoraInici: '',
        PreparacioData: baseDate,
        PreparacioHora: '',
      },
    ])
  }, [dateRange?.start, manualRows.length])

  const handleDeleteRow = useCallback(async (rowId: string) => {
    if (!rowId) return

    if (rowId.startsWith('draft_')) {
      setManualRows((prev) => prev.filter((row) => row.id !== rowId))
      setEdited((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      return
    }

    if (!window.confirm('Vols eliminar aquesta línia?')) return

    setUpdating(true)
    try {
      const res = await fetch(`/api/logistics/${encodeURIComponent(rowId)}`, {
        method: 'DELETE',
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(payload?.error || 'No s’ha pogut eliminar la línia')
      }

      await refresh()
      setEdited((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    } catch (error) {
      console.error('Error eliminant fila logística:', error)
      alert(error instanceof Error ? error.message : 'No s’ha pogut eliminar la línia.')
    } finally {
      setUpdating(false)
    }
  }, [refresh])

  const handleToggleWarehousePrepared = useCallback(
    async (rowId: string, warehouse: PreparationWarehouseCode, done: boolean) => {
      if (!rowId || rowId.startsWith('draft_')) return

      setUpdating(true)
      try {
        const res = await fetch(`/api/logistics/${encodeURIComponent(rowId)}/complete`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse, done }),
        })
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        if (!res.ok) {
          throw new Error(payload?.error || 'No s’ha pogut actualitzar l’estat de la preparació')
        }

        await refresh()
      } catch (error) {
        console.error('Error actualitzant estat de preparació:', error)
        alert(
          error instanceof Error
            ? error.message
            : 'No s’ha pogut actualitzar l’estat de la preparació.'
        )
      } finally {
        setUpdating(false)
      }
    },
    [refresh]
  )

  const handleConfirm = async () => {
    const ids = Object.keys(edited)
    if (!ids.length && !manualRows.length) return

    setUpdating(true)

    try {
      const updates: Array<{
        id: string
        isNew?: boolean
        PreparacioData?: string
        PreparacioHora?: string
        EventCode?: string
        NomEvent?: string
        NumPax?: string
        Ubicacio?: string
        DataInici?: string
      }> = []

      const targetIds = Array.from(new Set([...rows.map((row) => row.id).filter((id) => edited[id]), ...manualRows.map((row) => row.id)]))

      for (const id of targetIds) {
        const original = rows.find((r) => r.id === id)
        if (!original) continue

        const rowEdit = edited[id] || {}
        const isNew = id.startsWith('draft_')
        const payload: {
          id: string
          isNew?: boolean
          PreparacioData?: string
          PreparacioHora?: string
          EventCode?: string
          NomEvent?: string
          NumPax?: string
          Ubicacio?: string
          DataInici?: string
        } = { id, isNew }

        const nextPreparacioData = rowEdit.PreparacioData ?? original.PreparacioData ?? ''
        const nextPreparacioHora = rowEdit.PreparacioHora ?? original.PreparacioHora ?? ''
        const nextEventCode = rowEdit.EventCode ?? original.EventCode ?? ''
        const nextNomEvent = rowEdit.NomEvent ?? original.NomEvent ?? ''
        const nextNumPax = rowEdit.NumPax ?? (original.NumPax != null ? String(original.NumPax) : '')
        const nextUbicacio = rowEdit.Ubicacio ?? original.Ubicacio ?? ''
        const nextDataInici = rowEdit.DataInici ?? original.DataInici ?? ''

        if (nextPreparacioData && !/^\d{4}-\d{2}-\d{2}$/.test(nextPreparacioData)) {
          alert(`La data de preparació de l'esdeveniment ${original.NomEvent || id} no és vàlida.`)
          setUpdating(false)
          return
        }

        if (nextDataInici && !/^\d{4}-\d{2}-\d{2}$/.test(nextDataInici)) {
          alert(`La data de l'esdeveniment ${original.NomEvent || id} no és vàlida.`)
          setUpdating(false)
          return
        }

        if (isNew || rowEdit.PreparacioData !== undefined) payload.PreparacioData = nextPreparacioData
        if (isNew || rowEdit.PreparacioHora !== undefined) payload.PreparacioHora = nextPreparacioHora
        if (isNew || rowEdit.EventCode !== undefined) payload.EventCode = nextEventCode
        if (isNew || rowEdit.NomEvent !== undefined) payload.NomEvent = nextNomEvent
        if (isNew || rowEdit.NumPax !== undefined) payload.NumPax = nextNumPax
        if (isNew || rowEdit.Ubicacio !== undefined) payload.Ubicacio = nextUbicacio
        if (isNew || rowEdit.DataInici !== undefined) payload.DataInici = nextDataInici

        if (isNew || Object.keys(rowEdit).length > 0) {
          updates.push(payload)
        }
      }

      if (!updates.length) {
        setUpdating(false)
        return
      }

      const res = await fetch('/api/logistics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      await refresh()
      setManualRows([])
      setEdited({})
    } catch (err) {
      console.error('Error guardant preparacions:', err)
      alert('No s\'han pogut guardar les preparacions. Revisa les dades i torna-ho a provar.')
    } finally {
      setUpdating(false)
    }
  }

  const exportBase = dateRange?.start && dateRange?.end
    ? `preparacio-logistica-${dateRange.start}-${dateRange.end}`
    : 'preparacio-logistica-setmana'

  const handleWarehouseComandaClick = useCallback((task: LogisticsWarehousePrepRow) => {
    const returnTo = encodeURIComponent('/menu/logistica/preparacio')
    const url = `/menu/events/${encodeURIComponent(task.eventId)}/comanda?returnTo=${returnTo}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const exportRows = useMemo<PreparationExportRow[]>(() => {
    const eventRows = rows.map((ev) => ({
      PreparacioData: formatDayMonthValue(ev.PreparacioData, ''),
      PreparacioHora: ev.PreparacioHora || '',
      CodiEvent: ev.EventCode || '',
      Event: ev.NomEvent || '',
      Ubicacio: ev.Ubicacio || '',
      Pax: ev.NumPax ?? '',
      DataEvent: formatDateOnly(ev.DataInici, ''),
      HoraEvent: ev.HoraInici || '',
    }))

    const comandaRows = warehouseTasks.map((task) => ({
      PreparacioData: formatDayMonthValue(task.viewDay, ''),
      PreparacioHora: WAREHOUSE_PREP_VIEW_ROLE_LABELS[task.viewRole],
      CodiEvent: '',
      Event: `${task.eventTitle} · ${task.batchKind === 'revision' ? 'Reposició' : 'Comanda'}`,
      Ubicacio: task.deliverySummary || formatDayMonthValue(task.deliveryDate, ''),
      Pax:
        EVENT_COMANDA_BATCH_STATUS_LABELS[normalizeEventComandaBatchStatus(task.batchStatus)],
      DataEvent: formatDayMonthValue(task.deliveryDate, ''),
      HoraEvent: String(task.lineCount),
    }))

    return [...eventRows, ...comandaRows]
  }, [rows, warehouseTasks])

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Preparacio')
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
    const cols: Array<keyof PreparationExportRow> = [
      'PreparacioData',
      'PreparacioHora',
      'CodiEvent',
      'Event',
      'Ubicacio',
      'Pax',
      'DataEvent',
      'HoraEvent',
    ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String(row[key] ?? ''))}</td>`)
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
    <h1>Preparacio logistica</h1>
    <div class="meta">Rang: ${escapeHtml(
      formatDateOnly(dateRange?.start, '')
    )} - ${escapeHtml(formatDateOnly(dateRange?.end, ''))}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    printBrandedHtmlInNewWindow(html)
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
    <section className="space-y-6">
      <ModuleHeader
        icon={<Truck className="h-7 w-7 text-emerald-600" />}
        title="Preparació logística"
        subtitle="Planificació de dates i hores de preparació dels esdeveniments"
        actions={
          <div className="flex items-center gap-2">
            {isManager ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleOpenDashboard}
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Button>
            ) : null}
            <ExportMenu items={exportItems} />
          </div>
        }
      />

      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <LogisticsGrid
          rows={rows}
          warehouseTasks={warehouseTasks}
          loading={loading}
          isWorker={isWorker}
          isManager={isManager}
          edited={edited}
          setEdited={setEdited}
          onFilterChange={handleFilterChange}
          onRefresh={handleRefresh}
          onConfirm={handleConfirm}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onToggleWarehousePrepared={handleToggleWarehousePrepared}
          onWarehouseComandaClick={handleWarehouseComandaClick}
          updating={updating}
          filterRole={parseRoleForPreparationFilters(role)}
          locationOptions={locationOptions}
          allowedWarehouses={allowedWarehouses}
          showAllWarehouses={isManager}
          filterModeDefault={isWorker ? 'day' : filterMode}
          initialStart={dateRange?.start}
          initialEnd={dateRange?.end}
        />
      </RoleGuard>
    </section>
  )
}
