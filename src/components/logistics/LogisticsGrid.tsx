// file: src/components/logistics/LogisticsGrid.tsx
'use client'

import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import {
  CalendarClock,
  ClipboardList,
  Package,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { formatDayMonthValue } from '@/lib/date-format'
import {
  EVENT_COMANDA_BATCH_STATUS_BADGES,
  EVENT_COMANDA_BATCH_STATUS_LABELS,
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import {
  isEventPrepRow,
  isWarehousePrepRow,
  type LogisticsEventPrepRow,
  type LogisticsPrepRow,
  type LogisticsWarehousePrepRow,
} from '@/lib/logistics/prepTypes'
import {
  WAREHOUSE_PREP_VIEW_ROLE_LABELS,
  type WarehousePrepViewRole,
} from '@/lib/logistics/warehousePrepVisibility'
import { computeLineProgress } from '@/lib/logistics/preparationProgress'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import PreparationWarehouseToggles, {
  type AllowedPreparationWarehouse,
} from '@/components/logistics/PreparationWarehouseToggles'
import { cn } from '@/lib/utils'

export type EditedFields = {
  PreparacioData?: string
  PreparacioHora?: string
  EventCode?: string
  NomEvent?: string
  NumPax?: string
  Ubicacio?: string
  DataInici?: string
}

export type EditedMap = Record<string, EditedFields>

const VIEW_ROLE_BADGES: Record<WarehousePrepViewRole, string> = {
  early_prep: 'border-violet-200 bg-violet-50 text-violet-900',
  prep_tomorrow: 'border-amber-200 bg-amber-50 text-amber-900',
  delivery_today: 'border-sky-200 bg-sky-50 text-sky-900',
}

interface LogisticsGridProps {
  rows: LogisticsEventPrepRow[]
  warehouseTasks: LogisticsWarehousePrepRow[]
  loading: boolean
  isWorker: boolean
  isManager: boolean
  edited: EditedMap
  setEdited: Dispatch<SetStateAction<EditedMap>>
  onFilterChange: (f: SmartFiltersChange) => void
  onRefresh: () => void
  onConfirm: () => void
  onAddRow?: () => void
  onDeleteRow?: (rowId: string) => void
  onToggleWarehousePrepared?: (
    rowId: string,
    warehouse: PreparationWarehouseCode,
    done: boolean
  ) => void
  onWarehouseComandaClick?: (task: LogisticsWarehousePrepRow) => void
  updating: boolean
  filterRole: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
  filterModeDefault?: 'week' | 'month' | 'year' | 'day' | 'range'
  initialStart?: string
  initialEnd?: string
  locationOptions?: string[]
  allowedWarehouses?: AllowedPreparationWarehouse[]
  showAllWarehouses?: boolean
}

function fmtDM(dateIsoOrEmpty: string) {
  if (!dateIsoOrEmpty) return ''
  const formatted = formatDayMonthValue(dateIsoOrEmpty, '')
  return formatted === '-' ? '' : formatted
}

function warehouseLabel(task: LogisticsWarehousePrepRow) {
  const name = task.warehouseName?.trim()
  const code = task.warehouseCode?.trim()
  return name && code && name !== code ? `${name} · ${code}` : name || code || 'Magatzem'
}

function orderTypeLabel(kind: LogisticsWarehousePrepRow['batchKind']) {
  return kind === 'revision' ? 'Reposició' : 'Comanda'
}

function formatOrderedAt(orderedAt: number) {
  if (!orderedAt) return '—'
  return new Date(orderedAt).toLocaleString('ca-ES', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildDayGroups(
  events: LogisticsEventPrepRow[],
  warehouseTasks: LogisticsWarehousePrepRow[]
) {
  const map = new Map<string, LogisticsPrepRow[]>()

  events.forEach((ev) => {
    const key = ev.PreparacioData || ev.DataInici?.toString() || 'sense-data'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ev)
  })

  warehouseTasks.forEach((task) => {
    const key = task.viewDay || 'sense-data'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(task)
  })

  return Array.from(map.entries()).sort((a, b) => {
    const da = new Date(a[0]).getTime()
    const db = new Date(b[0]).getTime()
    return da - db
  })
}

export default function LogisticsGrid({
  rows,
  warehouseTasks,
  loading,
  isWorker,
  isManager,
  edited,
  setEdited,
  onFilterChange,
  onRefresh,
  onConfirm,
  onAddRow,
  onDeleteRow,
  onToggleWarehousePrepared,
  onWarehouseComandaClick,
  updating,
  filterRole,
  locationOptions = [],
  filterModeDefault = 'week',
  initialStart,
  initialEnd,
  allowedWarehouses = [],
  showAllWarehouses = false,
}: LogisticsGridProps) {
  const displayWarehouses = showAllWarehouses
    ? ([
        { code: 'BODEGA' as const, label: 'Bodega' },
        { code: 'PARAMENT' as const, label: 'Parament' },
        { code: 'MATERIAL' as const, label: 'Material' },
      ] satisfies AllowedPreparationWarehouse[])
    : allowedWarehouses

  return (
    <div className="mt-4 w-full overflow-hidden rounded-xl border bg-white shadow-sm">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #preparacio-print-root, #preparacio-print-root * { visibility: visible; }
          #preparacio-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="border-b bg-gray-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SmartFilters
            role={filterRole}
            showStatus={false}
            modeDefault={filterModeDefault}
            onChange={onFilterChange}
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showAdvanced={false}
            initialStart={initialStart}
            initialEnd={initialEnd}
          />
        </div>
      </div>

      <div id="preparacio-print-root">
        {isWorker ? (
          <WorkerGroupedView
            events={rows}
            warehouseTasks={warehouseTasks}
            loading={loading}
            allowedWarehouses={displayWarehouses}
            onToggleWarehousePrepared={onToggleWarehousePrepared}
            onWarehouseComandaClick={onWarehouseComandaClick}
          />
        ) : (
          <EditableTable
            rows={rows}
            warehouseTasks={warehouseTasks}
            edited={edited}
            setEdited={setEdited}
            isManager={isManager}
            loading={loading}
            locationOptions={locationOptions}
            onDeleteRow={onDeleteRow}
            onWarehouseComandaClick={onWarehouseComandaClick}
          />
        )}
      </div>

      {isManager && (
        <div className="flex justify-between border-t bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-100"
            >
              <RefreshCcw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
              Actualitzar
            </button>
            <button
              type="button"
              onClick={onAddRow}
              className="flex items-center gap-1 rounded-md bg-white px-3 py-1 text-sm text-gray-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Afegir línia
            </button>
          </div>
          <button
            onClick={onConfirm}
            disabled={updating}
            className={`rounded-lg px-4 py-2 text-sm text-white transition-colors ${
              updating ? 'cursor-not-allowed bg-gray-400' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {updating ? 'Guardant...' : 'Confirmar ordre'}
          </button>
        </div>
      )}
    </div>
  )
}

function WarehouseComandaCard({
  task,
  onClick,
}: {
  task: LogisticsWarehousePrepRow
  onClick?: (task: LogisticsWarehousePrepRow) => void
}) {
  const status = normalizeEventComandaBatchStatus(task.batchStatus)
  const statusLabel = EVENT_COMANDA_BATCH_STATUS_LABELS[status]
  const clickable = Boolean(onClick)

  return (
    <button
      type="button"
      onClick={() => onClick?.(task)}
      disabled={!clickable}
      className={cn(
        'w-full rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-left shadow-sm transition',
        clickable && 'hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer',
        !clickable && 'cursor-default'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            VIEW_ROLE_BADGES[task.viewRole]
          )}
        >
          <Package className="h-3 w-3" />
          {WAREHOUSE_PREP_VIEW_ROLE_LABELS[task.viewRole]}
        </span>
        <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-900">
          {orderTypeLabel(task.batchKind)}
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            EVENT_COMANDA_BATCH_STATUS_BADGES[status]
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-2 text-sm font-semibold leading-snug text-slate-900">
        {task.eventTitle}
      </div>
      <div className="mt-0.5 text-xs font-medium text-indigo-900">{warehouseLabel(task)}</div>

      <div className="mt-2 space-y-1 text-xs text-slate-700">
        <div>
          <span className="font-semibold text-slate-800">Entrega:</span>{' '}
          {task.deliverySummary || formatDayMonthValue(task.deliveryDate, '—')}
        </div>
        <div>
          <span className="font-semibold text-slate-800">Demanada:</span> {formatOrderedAt(task.orderedAt)}
        </div>
        <div>
          <span className="font-semibold text-slate-800">Articles:</span> {task.lineCount}
        </div>
      </div>
    </button>
  )
}

function WorkerGroupedView({
  events,
  warehouseTasks,
  loading,
  allowedWarehouses,
  onToggleWarehousePrepared,
  onWarehouseComandaClick,
}: {
  events: LogisticsEventPrepRow[]
  warehouseTasks: LogisticsWarehousePrepRow[]
  loading: boolean
  allowedWarehouses: AllowedPreparationWarehouse[]
  onToggleWarehousePrepared?: (
    rowId: string,
    warehouse: PreparationWarehouseCode,
    done: boolean
  ) => void
  onWarehouseComandaClick?: (task: LogisticsWarehousePrepRow) => void
}) {
  const groups = useMemo(
    () => buildDayGroups(events, warehouseTasks),
    [events, warehouseTasks]
  )

  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-500">Carregant dades...</div>
  }

  if (!groups.length) {
    return <div className="p-4 text-center text-sm text-gray-400">No hi ha dades disponibles.</div>
  }

  return (
    <div className="divide-y">
      {groups.map(([dayIso, items]) => {
        const eventItems = items.filter(isEventPrepRow)
        const comandaItems = items.filter(isWarehousePrepRow)

        const label =
          dayIso && dayIso !== 'sense-data'
            ? (() => {
                const d = parseISO(dayIso)
                const dowIdx = d.getDay()
                const dowMap = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds']
                const dow = dowMap[dowIdx] || format(d, 'EEE', { locale: ca })
                return `${dow} ${format(d, 'dd/LL/yy', { locale: ca })}`
              })()
            : 'Sense data de preparació'

        const orderedEvents = [...eventItems].sort((a, b) => {
          const ha = a.PreparacioHora || ''
          const hb = b.PreparacioHora || ''
          if (ha && hb) return ha.localeCompare(hb)
          if (ha) return -1
          if (hb) return 1
          return 0
        })

        const countParts = [
          orderedEvents.length ? `${orderedEvents.length} prep` : '',
          comandaItems.length ? `${comandaItems.length} comandes` : '',
        ].filter(Boolean)

        return (
          <div key={dayIso} className="pb-4">
            <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-900">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                <span className="uppercase tracking-wide">{label}</span>
              </div>
              <div className="text-xs font-semibold text-pink-600">{countParts.join(' · ')}</div>
            </div>

            {orderedEvents.length > 0 && (
              <>
                <div className="mt-2 flex flex-col gap-3 md:hidden">
                  {orderedEvents.map((ev) => {
                    const progress = computeLineProgress(ev)
                    return (
                    <div
                      key={ev.id}
                      className={cn(
                        'rounded-xl border p-3 shadow-sm transition-colors',
                        progress.status === 'complete'
                          ? 'border-emerald-200 bg-emerald-50/80'
                          : progress.status === 'in_progress'
                            ? 'border-sky-200 bg-sky-50/40'
                            : 'bg-white'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {ev.PreparacioHora || '--:--'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {ev.DataInici ? formatDayMonthValue(ev.DataInici, '--/--') : '--/--'}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'mt-1 text-sm font-semibold leading-snug',
                          progress.status === 'complete'
                            ? 'text-emerald-900 line-through'
                            : 'text-slate-900'
                        )}
                      >
                        {ev.NomEvent || 'Sense nom'}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Codi: {ev.EventCode || '-'}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                        {ev.Ubicacio || 'Sense ubicació'}
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Magatzems ({progress.pct}%)
                        </div>
                        <PreparationWarehouseToggles
                          rowId={ev.id}
                          completionMap={ev.PreparacioMagatzems}
                          allowedWarehouses={allowedWarehouses}
                          onToggle={onToggleWarehousePrepared}
                        />
                      </div>
                    </div>
                    )
                  })}
                </div>

                <div className="mt-2 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-full overflow-hidden rounded-lg border border-slate-200 text-xs sm:min-w-[560px]">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="w-24 px-3 py-2 text-left">Hora prep.</th>
                        <th className="w-28 px-3 py-2 text-left">Codi event</th>
                        <th className="px-3 py-2 text-left">Nom esdeveniment</th>
                        <th className="w-16 px-3 py-2 text-left">Pax</th>
                        <th className="px-3 py-2 text-left">Ubicació</th>
                        <th className="w-28 px-3 py-2 text-left">Data event</th>
                        <th className="px-3 py-2 text-left">Magatzems</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedEvents.map((ev) => {
                        const progress = computeLineProgress(ev)
                        return (
                        <tr
                          key={ev.id}
                          className={cn(
                            'border-t border-slate-200',
                            progress.status === 'complete' && 'bg-emerald-50/70',
                            progress.status === 'in_progress' && 'bg-sky-50/40'
                          )}
                        >
                          <td className="px-3 py-2 text-slate-700">{ev.PreparacioHora || '--:--'}</td>
                          <td className="px-3 py-2 text-slate-700">{ev.EventCode || '-'}</td>
                          <td
                            className={cn(
                              'px-3 py-2 font-semibold',
                              progress.status === 'complete'
                                ? 'text-emerald-900 line-through'
                                : 'text-slate-800'
                            )}
                          >
                            {ev.NomEvent || 'Sense nom'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{ev.NumPax ?? '--'}</td>
                          <td className="px-3 py-2 text-slate-700">{ev.Ubicacio || 'Sense ubicació'}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {ev.DataInici ? formatDayMonthValue(ev.DataInici, '--/--') : '--/--'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="mb-1 text-[10px] font-semibold text-slate-500">
                              {progress.pct}%
                            </div>
                            <PreparationWarehouseToggles
                              rowId={ev.id}
                              completionMap={ev.PreparacioMagatzems}
                              allowedWarehouses={allowedWarehouses}
                              onToggle={onToggleWarehousePrepared}
                            />
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {comandaItems.length > 0 && (
              <div className={cn('flex flex-col gap-3', orderedEvents.length > 0 ? 'mt-3' : 'mt-2')}>
                {orderedEvents.length > 0 && (
                  <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-indigo-800">
                    <ClipboardList className="h-4 w-4" />
                    Comandes de magatzem
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {comandaItems.map((task) => (
                    <WarehouseComandaCard
                      key={task.id}
                      task={task}
                      onClick={onWarehouseComandaClick}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EditableTable({
  rows,
  warehouseTasks,
  edited,
  setEdited,
  isManager,
  loading,
  locationOptions,
  onDeleteRow,
  onWarehouseComandaClick,
}: {
  rows: LogisticsEventPrepRow[]
  warehouseTasks: LogisticsWarehousePrepRow[]
  edited: EditedMap
  setEdited: React.Dispatch<React.SetStateAction<EditedMap>>
  isManager: boolean
  loading: boolean
  locationOptions: string[]
  onDeleteRow?: (rowId: string) => void
  onWarehouseComandaClick?: (task: LogisticsWarehousePrepRow) => void
}) {
  const hasWarehouseTasks = warehouseTasks.length > 0
  const setField = (id: string, key: keyof EditedFields, value: string) => {
    setEdited((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }))
  }

  return (
    <div className="overflow-x-auto scroll-smooth">
      <table className="w-full min-w-[980px] border-collapse text-[10px] sm:text-xs xl:min-w-[1240px] 2xl:min-w-[1440px]">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="sticky left-0 z-30 bg-white px-3 py-3 shadow-sm xl:px-4">Data preparació</th>
            <th className="px-3 py-3 xl:px-4">Hora preparació</th>
            <th className="px-3 py-3 xl:px-4">Codi event</th>
            <th className="px-3 py-3 xl:px-4">Nom</th>
            <th className="px-3 py-3 xl:px-4">Pax</th>
            <th className="px-3 py-3 xl:px-4">Ubicació</th>
            <th className="px-3 py-3 xl:px-4">Data esdeveniment</th>
            <th className="w-12 px-3 py-3 text-center xl:px-4"> </th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="py-6 text-center text-gray-400">
                Carregant dades...
              </td>
            </tr>
          ) : rows.length > 0 ? (
            rows.map((ev, idx) => {
              const prepDate = edited[ev.id]?.PreparacioData ?? (ev.PreparacioData || '')
              const prepH = edited[ev.id]?.PreparacioHora ?? (ev.PreparacioHora || '')
              const eventCode = edited[ev.id]?.EventCode ?? (ev.EventCode || '')
              const eventName = edited[ev.id]?.NomEvent ?? (ev.NomEvent || '')
              const pax = edited[ev.id]?.NumPax ?? (ev.NumPax != null ? String(ev.NumPax) : '')
              const ubicacio = edited[ev.id]?.Ubicacio ?? (ev.Ubicacio || '')
              const dataInici = edited[ev.id]?.DataInici ?? (ev.DataInici || '')
              const rowIsNew = ev.id.startsWith('draft_')
              const rowLocations = ubicacio && !locationOptions.includes(ubicacio)
                ? [ubicacio, ...locationOptions]
                : locationOptions

              return (
                <tr
                  key={`row-${idx}`}
                  className={cn(
                    'border-t text-left align-top transition-colors hover:bg-gray-50',
                    rowIsNew && 'bg-amber-50/40'
                  )}
                >
                  <td className="sticky left-0 border-r bg-white px-3 py-3 font-medium shadow-sm xl:px-4">
                    {isManager ? (
                      <input
                        type="date"
                        value={prepDate}
                        onChange={(e) => setField(ev.id, 'PreparacioData', e.target.value)}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{fmtDM(prepDate) || '-'}</span>
                    )}
                  </td>

                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <input
                        type="time"
                        value={prepH}
                        onChange={(e) => setField(ev.id, 'PreparacioHora', e.target.value)}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{prepH || '-'}</span>
                    )}
                  </td>

                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <input
                        type="text"
                        value={eventCode}
                        onChange={(e) => setField(ev.id, 'EventCode', e.target.value)}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{eventCode || '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <input
                        type="text"
                        value={eventName}
                        onChange={(e) => setField(ev.id, 'NomEvent', e.target.value)}
                        className="w-full min-w-[260px] rounded border p-1 text-xs xl:min-w-[320px]"
                      />
                    ) : (
                      <span>{eventName || '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <input
                        type="number"
                        min="0"
                        value={pax}
                        onChange={(e) => setField(ev.id, 'NumPax', e.target.value)}
                        className="w-20 rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{pax || '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <select
                        value={ubicacio}
                        onChange={(e) => setField(ev.id, 'Ubicacio', e.target.value)}
                        className="w-full min-w-[240px] rounded border bg-white p-1 text-xs xl:min-w-[300px]"
                      >
                        <option value="">Selecciona finca</option>
                        {rowLocations.map((location) => (
                          <option key={`${ev.id}-${location}`} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{ubicacio || '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 xl:px-4">
                    {isManager ? (
                      <input
                        type="date"
                        value={dataInici}
                        onChange={(e) => setField(ev.id, 'DataInici', e.target.value)}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{formatDayMonthValue(dataInici, '--/--')}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center xl:px-4">
                    {isManager ? (
                      <button
                        type="button"
                        onClick={() => onDeleteRow?.(ev.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Eliminar línia"
                        title="Eliminar línia"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })
          ) : !hasWarehouseTasks ? (
            <tr>
              <td colSpan={8} className="py-6 text-center text-gray-400">
                No hi ha dades disponibles.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {hasWarehouseTasks && (
        <div className="border-t bg-indigo-50/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-900">
            <ClipboardList className="h-4 w-4" />
            Comandes de magatzem assignades
          </div>
          <div className="space-y-4">
            {buildDayGroups([], warehouseTasks).map(([dayIso, items]) => {
              const comandaItems = items.filter(isWarehousePrepRow)
              if (!comandaItems.length) return null

              const label =
                dayIso && dayIso !== 'sense-data'
                  ? formatDayMonthValue(dayIso, dayIso)
                  : 'Sense data'

              return (
                <div key={dayIso}>
                  <div className="mb-2 text-xs font-semibold text-indigo-800">{label}</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {comandaItems.map((task) => (
                      <WarehouseComandaCard
                        key={task.id}
                        task={task}
                        onClick={onWarehouseComandaClick}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
