// file: src/app/menu/logistica/preparacio/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import { RoleGuard } from '@/lib/withRoleGuard'
import { useUiPermissions } from '@/hooks/useUiPermissions'
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
import {
  PREPARATION_IMPORT_PERM,
  isPreparationManagerRole,
} from '@/lib/logistics/preparationPermissions'
import { BarChart3, FileSpreadsheet, Truck } from 'lucide-react'
import { formatDateOnly, formatDayMonthValue } from '@/lib/date-format'

interface PreparationExportRow {
  PreparacioData: string
  PreparacioHora: string
  CodiEvent: string
  Event: string
  Servei: string
  Ubicacio: string
  Pax: string | number
  DataEvent: string
  HoraEvent: string
  DataServei: string
  HoraServei: string
}

type ImportedServiceRow = {
  code: string
  eventName: string
  serviceName: string
  serviceDate: string
  serviceTime: string
  location: string
  pax: number
}

function normalizeHeaderKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeExcelDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30)
    const millis = Math.round(value * 24 * 60 * 60 * 1000)
    const parsed = new Date(excelEpoch + millis)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  if (slash) {
    const [, dd, mm, yyyy] = slash
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function normalizeExcelTimeValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const minutes = Math.round(value * 24 * 60)
    const hours = Math.floor(minutes / 60) % 24
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (!match) return ''
  return `${match[1]!.padStart(2, '0')}:${match[2]}`
}

export default function LogisticsPage() {
  const pathname = usePathname() || ''
  const searchParams = useSearchParams()
  const searchParamsSafe = searchParams ?? new URLSearchParams()
  const { data: session } = useSession()
  const { uiActions, canEditPath, ready: permsReady } = useUiPermissions()
  const currentUserId = String(session?.user?.id || '').trim()
  const currentUserName = String(session?.user?.name || '').trim()
  const role = (session?.user?.role || '').toLowerCase()
  const isDecoPreparation = pathname.startsWith('/menu/deco/preparacio')
  const isAdmin = role === 'admin'
  const isDecoRestricted = isDecoPreparation && !isAdmin
  const isWorker = role === 'treballador'
  const isManager = isPreparationManagerRole(role)
  const canEditPreparationList = useMemo(() => {
    if (isDecoRestricted) return false
    if (!permsReady) return isManager
    return canEditPath('/menu/logistica/preparacio')
  }, [canEditPath, isDecoRestricted, isManager, permsReady])
  const showPreparerView = useMemo(() => {
    if (isDecoPreparation) return true
    if (!permsReady) return isWorker
    return !canEditPreparationList
  }, [canEditPreparationList, isDecoPreparation, isWorker, permsReady])
  const canImportServices = useMemo(() => {
    if (isDecoRestricted) return false
    if (!permsReady) return isManager
    return uiActions[PREPARATION_IMPORT_PERM] === true
  }, [isDecoRestricted, isManager, permsReady, uiActions])

  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(() => {
    const fallback = isWorker || isDecoRestricted ? buildTodayRange() : buildDefaultWeekRange()
    return parseDateRangeFromSearch(searchParamsSafe, fallback)
  })
  const [filterMode, setFilterMode] = useState<PreparationFilterMode>(() =>
    parseFilterMode(searchParamsSafe.get('mode'))
  )
  const latestFilterRef = useRef({
    dateRange: parseDateRangeFromSearch(
      searchParamsSafe,
      isWorker || isDecoRestricted ? buildTodayRange() : buildDefaultWeekRange()
    ),
    mode: parseFilterMode(searchParamsSafe.get('mode')) as PreparationFilterMode,
  })

  useEffect(() => {
    if (dateRange?.start && dateRange?.end) {
      latestFilterRef.current = { dateRange, mode: filterMode }
    }
  }, [dateRange, filterMode])
  const { events, warehouseTasks, refresh, loading } = useLogisticsData(dateRange, {
    preparerMode: showPreparerView,
  })
  const [updating, setUpdating] = useState(false)
  const [edited, setEdited] = useState<EditedMap>({})
  const [manualRows, setManualRows] = useState<LogisticsEventPrepRow[]>([])
  const [locationOptions, setLocationOptions] = useState<string[]>([])
  const [allowedWarehouses, setAllowedWarehouses] = useState<AllowedPreparationWarehouse[]>([])
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let ignore = false

    const loadWarehouses = async () => {
      try {
        const warehouseScope = isDecoPreparation ? '?scope=deco' : ''
        const res = await fetch(`/api/logistics/preparation-warehouses${warehouseScope}`, {
          cache: 'no-store',
        })
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
  }, [isDecoPreparation])

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
    if (!showPreparerView) return

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
  }, [showPreparerView])

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

  const parseImportedServicesFile = useCallback(async (file: File): Promise<ImportedServiceRow[]> => {
    const buffer = await file.arrayBuffer()
    const XLSX = await loadXlsx()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return []

    const matrix = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    })

    const findColumnIndex = (headerRow: Array<string | number | Date>, aliases: string[]) => {
      return headerRow.findIndex((cell) => {
        const normalized = normalizeHeaderKey(String(cell ?? ''))
        return aliases.some((alias) => normalizeHeaderKey(alias) === normalized)
      })
    }

    const headerIndex = matrix.findIndex((row) => {
      const normalizedCells = row.map((cell) => normalizeHeaderKey(String(cell ?? '')))
      return (
        normalizedCells.includes(normalizeHeaderKey('Servicio')) &&
        normalizedCells.includes(normalizeHeaderKey('Código')) &&
        normalizedCells.includes(normalizeHeaderKey('Estado Servicio'))
      )
    })

    if (headerIndex === -1) return []

    const headerRow = matrix[headerIndex] || []
    const columnMap = {
      status: findColumnIndex(headerRow, ['Estado Servicio', 'Estado del Servicio', 'Estado']),
      serviceName: findColumnIndex(headerRow, ['Servicio', 'Servei', 'Service']),
      code: findColumnIndex(headerRow, ['Código', 'Codigo', 'Codi', 'Code']),
      serviceDate: findColumnIndex(headerRow, ['Fecha', 'Data', 'Date']),
      eventName: findColumnIndex(headerRow, ['Evento', 'Esdeveniment', 'Event']),
      serviceTime: findColumnIndex(headerRow, ['Hora', 'Hour']),
      location: findColumnIndex(headerRow, ['Ubicación', 'Ubicacion', 'Ubicació', 'Location']),
      pax: findColumnIndex(headerRow, ['Comensales', 'Comensals', 'Pax']),
    }

    const dataRows = matrix.slice(headerIndex + 1)

    return dataRows
      .map((row) => {
        const getByIndex = (index: number) => (index >= 0 ? row[index] : '')

        const status = String(getByIndex(columnMap.status) ?? '').trim().toLowerCase()
        const serviceName = String(getByIndex(columnMap.serviceName) ?? '').trim()
        if (status !== 'planned') return null
        if (!serviceName || serviceName.startsWith('C ')) return null

        const code = String(getByIndex(columnMap.code) ?? '').trim()
        const serviceDate = normalizeExcelDateValue(getByIndex(columnMap.serviceDate))
        if (!code || !serviceDate) return null

        return {
          code,
          eventName: String(getByIndex(columnMap.eventName) ?? '').trim(),
          serviceName,
          serviceDate,
          serviceTime: normalizeExcelTimeValue(getByIndex(columnMap.serviceTime)),
          location: String(getByIndex(columnMap.location) ?? '').trim(),
          pax: Number(getByIndex(columnMap.pax) ?? 0) || 0,
        }
      })
      .filter((row): row is ImportedServiceRow => Boolean(row))
  }, [])

  const handleImportFile = useCallback(async (file: File) => {
    setImporting(true)
    setImportMessage('')

    try {
      const rowsToImport = await parseImportedServicesFile(file)
      if (!rowsToImport.length) {
        setImportMessage('No s han trobat serveis Planned valids per importar.')
        return
      }

      const res = await fetch('/api/logistics/import-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToImport }),
      })
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean
            imported?: number
            touchedCodes?: number
            error?: string
            receivedRows?: number
            debug?: Record<string, unknown>
          }
        | null

      if (!res.ok || !payload?.ok) {
        const debugText = payload?.debug ? ` ${JSON.stringify(payload.debug)}` : ''
        throw new Error((payload?.error || 'No s han pogut importar els serveis') + debugText)
      }

      await refresh()
      setEdited({})
      setManualRows([])
      setImportMessage(
        `Importacio completada: ${payload.imported || 0} serveis actualitzats en ${payload.touchedCodes || 0} codis.`
      )
    } catch (error) {
      console.error('Error important serveis de logística:', error)
      setImportMessage(
        error instanceof Error ? error.message : 'No s han pogut importar els serveis.'
      )
    } finally {
      setImporting(false)
    }
  }, [parseImportedServicesFile, refresh])

  const handleFileInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      await handleImportFile(file)
    }
    event.target.value = ''
  }, [handleImportFile])

  const handleAddRow = useCallback(() => {
    const baseDate = dateRange?.start || new Date().toISOString().slice(0, 10)
    const draftId = `draft_${Date.now()}_${manualRows.length}`
    setManualRows((prev) => [
      ...prev,
      {
        rowType: 'event',
        id: draftId,
        sourceCollection: 'stage_verd',
        planningMode: 'event',
        EventCode: '',
        NomEvent: '',
        Ubicacio: '',
        NumPax: undefined,
        DataInici: baseDate,
        DataVisual: baseDate,
        HoraInici: '',
        EventDate: baseDate,
        EventTime: '',
        ServiceName: '',
        ServiceDate: baseDate,
        ServiceTime: '',
        ParentEventId: draftId,
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
          body: JSON.stringify({
            warehouse,
            done,
            scope: isDecoPreparation ? 'deco' : undefined,
          }),
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
    [isDecoPreparation, refresh]
  )

  const handleConfirm = async () => {
    const ids = Object.keys(edited)
    if (!ids.length && !manualRows.length) return

    setUpdating(true)

    try {
      const updates: Array<{
        id: string
        isNew?: boolean
        sourceCollection?: 'stage_verd' | 'logistics_preparation_services'
        planningMode?: 'event' | 'service'
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
          sourceCollection?: 'stage_verd' | 'logistics_preparation_services'
          planningMode?: 'event' | 'service'
          PreparacioData?: string
          PreparacioHora?: string
          EventCode?: string
          NomEvent?: string
          NumPax?: string
          Ubicacio?: string
          DataInici?: string
        } = {
          id,
          isNew,
          sourceCollection: original.sourceCollection,
          planningMode: original.planningMode,
        }

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
      Servei: ev.ServiceName || '',
      Ubicacio: ev.Ubicacio || '',
      Pax: ev.NumPax ?? '',
      DataEvent: formatDateOnly(ev.EventDate || ev.DataInici, ''),
      HoraEvent: ev.EventTime || ev.HoraInici || '',
      DataServei: formatDateOnly(ev.ServiceDate || ev.DataInici, ''),
      HoraServei: ev.ServiceTime || ev.HoraInici || '',
    }))

    const comandaRows = warehouseTasks.map((task) => ({
      PreparacioData: formatDayMonthValue(task.viewDay, ''),
      PreparacioHora: WAREHOUSE_PREP_VIEW_ROLE_LABELS[task.viewRole],
      CodiEvent: '',
      Event: `${task.eventTitle} · ${task.batchKind === 'revision' ? 'Reposició' : 'Comanda'}`,
      Servei: '',
      Ubicacio: task.deliverySummary || formatDayMonthValue(task.deliveryDate, ''),
      Pax:
        EVENT_COMANDA_BATCH_STATUS_LABELS[normalizeEventComandaBatchStatus(task.batchStatus)],
      DataEvent: formatDayMonthValue(task.deliveryDate, ''),
      HoraEvent: String(task.lineCount),
      DataServei: '',
      HoraServei: '',
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
      'Servei',
      'Ubicacio',
      'Pax',
      'DataEvent',
      'HoraEvent',
      'DataServei',
      'HoraServei',
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
        title={isDecoPreparation ? 'Imatge-Deco' : 'Preparació logística'}
        mainHref={isDecoPreparation ? '/menu/deco' : undefined}
        subtitle={
          isDecoPreparation
            ? 'Preparació de serveis · validació del magatzem Deco'
            : 'Planificació de dates i hores de preparació per serveis'
        }
        actions={
          <div className="flex items-center gap-2">
            {canEditPreparationList ? (
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

      {canImportServices ? (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => void handleFileInputChange(event)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">
                Importació de serveis
              </div>
              <div className="text-xs text-slate-500">
                Importa només serveis Planned i exclou automàticament els que comencen per C espai.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {importing ? 'Important serveis...' : 'Importar Excel de serveis'}
            </Button>
          </div>
          {importMessage ? (
            <div className="mt-3 text-sm text-slate-700">{importMessage}</div>
          ) : null}
        </div>
      ) : null}

      <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
        <LogisticsGrid
          rows={rows}
          warehouseTasks={isDecoRestricted ? [] : warehouseTasks}
          loading={loading}
          isWorker={showPreparerView}
          canEditPreparationList={isDecoPreparation ? false : canEditPreparationList}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
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
          filterRole={showPreparerView ? 'Treballador' : parseRoleForPreparationFilters(role)}
          locationOptions={locationOptions}
          allowedWarehouses={allowedWarehouses}
          showAllWarehouses={canEditPreparationList}
          filterModeDefault={showPreparerView ? 'day' : filterMode}
          initialStart={dateRange?.start}
          initialEnd={dateRange?.end}
        />
      </RoleGuard>
    </section>
  )
}
