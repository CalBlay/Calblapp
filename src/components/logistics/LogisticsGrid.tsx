// file: src/components/logistics/LogisticsGrid.tsx
'use client'

import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { RefreshCcw, CalendarClock } from 'lucide-react'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { formatDayMonthValue } from '@/lib/date-format'

export type EditedMap = Record<string, { PreparacioData?: string; PreparacioHora?: string }>

interface LogisticsGridProps {
  rows: any[]
  loading: boolean
  isWorker: boolean
  isManager: boolean
  edited: EditedMap
  setEdited: Dispatch<SetStateAction<EditedMap>>
  onFilterChange: (f: SmartFiltersChange) => void
  onRefresh: () => void
  onConfirm: () => void
  updating: boolean
  filterRole: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
}

function fmtDM(dateIsoOrEmpty: string) {
  if (!dateIsoOrEmpty) return ''
  const formatted = formatDayMonthValue(dateIsoOrEmpty, '')
  return formatted === '-' ? '' : formatted
}

export default function LogisticsGrid({
  rows,
  loading,
  isWorker,
  isManager,
  edited,
  setEdited,
  onFilterChange,
  onRefresh,
  onConfirm,
  updating,
  filterRole,
}: LogisticsGridProps) {

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
            modeDefault="week"
            onChange={onFilterChange}
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showAdvanced={false}
          />
        </div>
      </div>

      <div id="preparacio-print-root">
        {isWorker ? (
          <WorkerGroupedView events={rows} loading={loading} />
        ) : (
          <EditableTable
            rows={rows}
            edited={edited}
            setEdited={setEdited}
            isManager={isManager}
            loading={loading}
          />
        )}
      </div>

      {isManager && (
        <div className="flex justify-between border-t bg-gray-50 p-4">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-100"
          >
            <RefreshCcw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
            Actualitzar
          </button>
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

function WorkerGroupedView({ events, loading }: { events: any[]; loading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    events.forEach(ev => {
      const key = ev.PreparacioData || ev.DataInici?.toString() || 'sense-data'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    })
    return Array.from(map.entries()).sort((a, b) => {
      const da = new Date(a[0]).getTime()
      const db = new Date(b[0]).getTime()
      return da - db
    })
  }, [events])

  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-500">Carregant dades...</div>
  }

  if (!groups.length) {
    return <div className="p-4 text-center text-sm text-gray-400">No hi ha dades disponibles.</div>
  }

  return (
    <div className="divide-y">
      {groups.map(([dayIso, items]) => {
        const label = dayIso && dayIso !== 'sense-data'
          ? (() => {
              const d = parseISO(dayIso)
              const dowIdx = d.getDay()
              const dowMap = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds']
              const dow = dowMap[dowIdx] || format(d, 'EEE', { locale: ca })
              return `${dow} ${format(d, 'dd/LL/yy', { locale: ca })}`
            })()
          : 'Sense data de preparació'

        const ordered = [...items].sort((a, b) => {
          const ha = a.PreparacioHora || ''
          const hb = b.PreparacioHora || ''
          if (ha && hb) return ha.localeCompare(hb)
          if (ha) return -1
          if (hb) return 1
          return 0
        })

        return (
          <div key={dayIso} className="pb-4">
            <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-900">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                <span className="uppercase tracking-wide">{label}</span>
              </div>
              <div className="text-xs font-semibold text-pink-600">
                {ordered.length} prep
              </div>
            </div>

            {/* Targetes per mòbil */}
            <div className="mt-2 flex flex-col gap-3 md:hidden">
              {ordered.map(ev => (
                <div key={ev.id} className="rounded-xl border bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      {ev.PreparacioHora || '--:--'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {ev.DataInici ? formatDayMonthValue(ev.DataInici, '--/--') : '--/--'}
                    </div>
                  </div>

                  <div className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                    {ev.NomEvent || 'Sense nom'}
                  </div>

                  <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {ev.Ubicacio || 'Sense ubicació'}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-700">
                    <span>Pax: {ev.NumPax ?? '--'}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Prep: {ev.PreparacioHora || '--:--'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Taula per desktop */}
            <div className="mt-2 hidden overflow-x-auto md:block">
              <table className="w-full min-w-full overflow-hidden rounded-lg border border-slate-200 text-xs sm:min-w-[560px]">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="w-24 px-3 py-2 text-left">Hora prep.</th>
                    <th className="px-3 py-2 text-left">Nom esdeveniment</th>
                    <th className="w-16 px-3 py-2 text-left">Pax</th>
                    <th className="px-3 py-2 text-left">Ubicació</th>
                    <th className="w-28 px-3 py-2 text-left">Data event</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(ev => (
                    <tr key={ev.id} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-700">{ev.PreparacioHora || '--:--'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{ev.NomEvent || 'Sense nom'}</td>
                      <td className="px-3 py-2 text-slate-700">{ev.NumPax ?? '--'}</td>
                      <td className="px-3 py-2 text-slate-700">{ev.Ubicacio || 'Sense ubicació'}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {ev.DataInici ? formatDayMonthValue(ev.DataInici, '--/--') : '--/--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EditableTable({
  rows,
  edited,
  setEdited,
  isManager,
  loading,
}: {
  rows: any[]
  edited: EditedMap
  setEdited: React.Dispatch<React.SetStateAction<EditedMap>>
  isManager: boolean
  loading: boolean
}) {
  return (
    <div className="overflow-x-auto scroll-smooth">
      <table className="min-w-full w-full border-collapse text-[10px] sm:min-w-[560px] sm:text-xs">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="sticky left-0 z-30 bg-white p-2 shadow-sm">Data preparació</th>
            <th className="p-2">Hora preparació</th>
            <th className="p-2">Nom</th>
            <th className="p-2">Pax</th>
            <th className="p-2">Ubicació</th>
            <th className="p-2">Data esdeveniment</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-gray-400">
                Carregant dades...
              </td>
            </tr>
          ) : rows.length > 0 ? (
            rows.map((ev, idx) => {
              const prepDM = edited[ev.id]?.PreparacioData ?? fmtDM(ev.PreparacioData || '')
              const prepH = edited[ev.id]?.PreparacioHora ?? (ev.PreparacioHora || '')

              return (
                <tr
                  key={`row-${idx}`}
                  className="border-t text-left align-top transition-colors hover:bg-gray-50"
                >
                  <td className="sticky left-0 border-r bg-white p-2 font-medium shadow-sm">
                    {isManager ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="dd/MM"
                        pattern="\d{1,2}/\d{1,2}"
                        value={prepDM}
                        onChange={(e) => {
                          const v = e.target.value
                          setEdited((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], PreparacioData: v },
                          }))
                        }}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{prepDM || '-'}</span>
                    )}
                  </td>

                  <td className="p-2">
                    {isManager ? (
                      <input
                        type="time"
                        value={prepH}
                        onChange={(e) => {
                          const v = e.target.value
                          setEdited((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], PreparacioHora: v },
                          }))
                        }}
                        className="w-full rounded border p-1 text-xs"
                      />
                    ) : (
                      <span>{prepH || '-'}</span>
                    )}
                  </td>

                  <td className="p-2">{ev.NomEvent}</td>
                  <td className="p-2">{ev.NumPax ?? '-'}</td>
                  <td className="p-2">{ev.Ubicacio}</td>
                  <td className="p-2">
                    {formatDayMonthValue(ev.DataInici, '--/--')}
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={6} className="py-6 text-center text-gray-400">
                No hi ha dades disponibles.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
