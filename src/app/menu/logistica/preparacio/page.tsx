// file: src/app/menu/logistica/preparacio/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { RoleGuard } from '@/lib/withRoleGuard'
import { LogisticsGrid } from '@/components/logistics'
import { useLogisticsData } from '@/hooks/useLogisticsData'
import type { LogisticsEventPrepRow, LogisticsWarehousePrepRow } from '@/lib/logistics/prepTypes'
import {
  EVENT_COMANDA_BATCH_STATUS_LABELS,
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import { WAREHOUSE_PREP_VIEW_ROLE_LABELS } from '@/lib/logistics/warehousePrepVisibility'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'
import type { EditedMap } from '@/components/logistics/LogisticsGrid'
import { Truck } from 'lucide-react'
import { formatDateOnly, formatDayMonthValue } from '@/lib/date-format'

function parseDM(value: string) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(value?.trim() || '')
  if (!m) return null
  const d = Number(m[1])
  const mm = Number(m[2])
  if (d < 1 || d > 31 || mm < 1 || mm > 12) return null
  return { d, m: mm }
}

function toISOFromDM(dm: string, year: number) {
  const p = parseDM(dm)
  if (!p) return ''
  const dd = String(p.d).padStart(2, '0')
  const mm = String(p.m).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function buildDefaultRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function parseRoleForFilters(role: string): 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador' {
  if (role === 'admin') return 'Admin'
  if (role === 'direccio') return 'Direcció'
  if (role === 'cap') return 'Cap Departament'
  return 'Treballador'
}

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
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()
  const isWorker = role === 'treballador'
  const isManager = role === 'cap' || role === 'admin' || role === 'direccio'

  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(() => buildDefaultRange())
  const { events, warehouseTasks, refresh, loading } = useLogisticsData(dateRange)
  const [updating, setUpdating] = useState(false)
  const [edited, setEdited] = useState<EditedMap>({})
  const [manualRows, setManualRows] = useState<LogisticsEventPrepRow[]>([])
  const [locationOptions, setLocationOptions] = useState<string[]>([])

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
    if (f.start && f.end) setDateRange({ start: f.start, end: f.end })
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
        actions={<ExportMenu items={exportItems} />}
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
          onWarehouseComandaClick={handleWarehouseComandaClick}
          updating={updating}
          filterRole={parseRoleForFilters(role)}
          locationOptions={locationOptions}
        />
      </RoleGuard>
    </section>
  )
}
