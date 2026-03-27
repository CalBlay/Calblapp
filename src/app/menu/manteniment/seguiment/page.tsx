'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { ChevronDown, ChevronUp, Filter } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import { maintenanceStatusBadge } from '@/lib/colors'
import { RoleGuard } from '@/lib/withRoleGuard'
import type { Ticket, TicketStatus } from '@/app/menu/manteniment/tickets/types'
import type { MachineItem, UserItem } from '@/app/menu/manteniment/tickets/types'
import PlannerTicketModal from '@/app/menu/manteniment/preventius/planificador/components/PlannerTicketModal'

type Scope = 'active' | 'closed'
type DateMode = 'all' | 'planned' | 'created' | 'updated' | 'completed'

const ACTIVE_STATUSES: TicketStatus[] = ['nou', 'assignat', 'en_curs', 'espera', 'fet', 'no_fet']
const CLOSED_STATUSES: TicketStatus[] = ['validat', 'resolut']

const STATUS_LABELS: Record<TicketStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'En espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
}

const DATE_MODE_LABELS: Record<DateMode, string> = {
  all: 'Sense filtre de data',
  planned: 'Data planificada',
  created: 'Data creacio',
  updated: 'Ultim canvi',
  completed: 'Data tancament',
}

const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-700',
  baixa: 'bg-blue-100 text-blue-700',
}

const parseDate = (value?: number | string | null) => {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateTime = (value?: number | string | null) => {
  const date = parseDate(value)
  return date ? format(date, 'dd/MM/yyyy HH:mm') : '-'
}

const formatDateOnly = (value?: number | string | null) => {
  const date = parseDate(value)
  return date ? format(date, 'dd/MM/yyyy') : '-'
}

const getLatestHistoryItem = (ticket: Ticket) =>
  [...(ticket.statusHistory || [])].sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]

const getCompletedHistoryItem = (ticket: Ticket) =>
  [...(ticket.statusHistory || [])]
    .filter((item) => item.status === 'validat' || item.status === 'resolut')
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]

const getTicketDate = (ticket: Ticket, mode: DateMode) => {
  if (mode === 'all') return parseDate(ticket.plannedStart || ticket.createdAt)
  if (mode === 'planned') return parseDate(ticket.plannedStart)
  if (mode === 'created') return parseDate(ticket.createdAt)
  if (mode === 'updated') return parseDate(getLatestHistoryItem(ticket)?.at || ticket.assignedAt || ticket.createdAt)
  return parseDate(getCompletedHistoryItem(ticket)?.at)
}

const getSearchBlob = (ticket: Ticket) =>
  [
    ticket.ticketCode,
    ticket.incidentNumber,
    ticket.description,
    ticket.machine,
    ticket.location,
    ...(ticket.assignedToNames || []),
  ]
    .join(' ')
    .toLowerCase()

export default function MaintenanceSeguimentPage() {
  const { setContent } = useFilters()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    const start = new Date(now)
    const day = start.getDay() || 7
    if (day !== 1) start.setDate(start.getDate() - (day - 1))
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    }
  })
  const [scope, setScope] = useState<Scope>('active')
  const [dateMode, setDateMode] = useState<DateMode>('all')
  const [externalFilter, setExternalFilter] = useState<'all' | 'internal' | 'external'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
  const [openedTicket, setOpenedTicket] = useState<Ticket | null>(null)

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch('/api/maintenance/tickets?ticketType=maquinaria&limit=200', {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('No s han pogut carregar els tickets')
      const json = await res.json()
      setTickets(Array.isArray(json?.tickets) ? json.tickets : [])
    } catch (err) {
      setTickets([])
      setError(err instanceof Error ? err.message : 'Error carregant seguiment')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    let cancelled = false
    const loadMeta = async () => {
      try {
        const [locationsRes, machinesRes, usersRes] = await Promise.all([
          fetch('/api/spaces/internal', { cache: 'no-store' }),
          fetch('/api/maintenance/machines', { cache: 'no-store' }),
          fetch('/api/personnel?department=manteniment', { cache: 'no-store' }),
        ])
        if (cancelled) return
        if (locationsRes.ok) {
          const json = await locationsRes.json()
          setLocations(Array.isArray(json?.locations) ? json.locations : [])
        }
        if (machinesRes.ok) {
          const json = await machinesRes.json()
          setMachines(Array.isArray(json?.machines) ? json.machines : [])
        }
        if (usersRes.ok) {
          const json = await usersRes.json()
          setUsers(Array.isArray(json?.data) ? json.data : [])
        }
      } catch {
        if (cancelled) return
        setLocations([])
        setMachines([])
        setUsers([])
      }
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [])

  const weekStart = useMemo(() => parseISO(dateRange.start), [dateRange.start])
  const weekEnd = useMemo(() => parseISO(dateRange.end), [dateRange.end])

  const workerOptions = useMemo(() => {
    const values = new Set<string>()
    tickets.forEach((ticket) => {
      ;(ticket.assignedToNames || []).forEach((name) => {
        const clean = String(name || '').trim()
        if (clean) values.add(clean)
      })
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ca'))
  }, [tickets])

  useEffect(() => {
    if (scope === 'closed' && dateMode === 'planned') setDateMode('completed')
    if (scope === 'active' && dateMode === 'completed') setDateMode('planned')
  }, [dateMode, scope])

  const filteredTickets = useMemo(() => {
    const allowedStatuses = scope === 'active' ? ACTIVE_STATUSES : CLOSED_STATUSES
    const startMs = weekStart.getTime()
    const endMs = weekEnd.getTime()
    const needle = search.trim().toLowerCase()

    return tickets
      .filter((ticket) => allowedStatuses.includes(ticket.status))
      .filter((ticket) => {
        if (externalFilter === 'all') return true
        if (externalFilter === 'external') return Boolean(ticket.externalized)
        return !ticket.externalized
      })
      .filter((ticket) => (statusFilter === 'all' ? true : ticket.status === statusFilter))
      .filter((ticket) => {
        if (workerFilter === 'all') return true
        return (ticket.assignedToNames || []).includes(workerFilter)
      })
      .filter((ticket) => (needle ? getSearchBlob(ticket).includes(needle) : true))
      .filter((ticket) => {
        if (dateMode === 'all') return true
        const date = getTicketDate(ticket, dateMode)
        if (!date) return false
        const ms = date.getTime()
        return ms >= startMs && ms <= endMs
      })
      .sort((a, b) => {
        const aDate = getTicketDate(a, dateMode)?.getTime() || 0
        const bDate = getTicketDate(b, dateMode)?.getTime() || 0
        return bDate - aDate
      })
  }, [dateMode, externalFilter, scope, search, statusFilter, tickets, weekEnd, weekStart, workerFilter])

  const counts = useMemo(
    () => ({
      active: tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status)).length,
      closed: tickets.filter((ticket) => CLOSED_STATUSES.includes(ticket.status)).length,
    }),
    [tickets]
  )

  const openTicket = (ticket: Ticket) => setOpenedTicket(ticket)

  const handleDateChange = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    setDateRange({
      start: f.start,
      end: f.end,
    })
  }

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filtrar per data</span>
          <select
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value as DateMode)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Sense filtre de data</option>
            <option value="planned">Data planificada</option>
            <option value="created">Data creacio</option>
            <option value="updated">Ultim canvi</option>
            <option value="completed">Data tancament</option>
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Estat</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tots</option>
            {(scope === 'active' ? ACTIVE_STATUSES : CLOSED_STATUSES).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Flux</span>
          <select
            value={externalFilter}
            onChange={(e) => setExternalFilter(e.target.value as 'all' | 'internal' | 'external')}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tots</option>
            <option value="internal">Interns</option>
            <option value="external">Derivats a proveidor</option>
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Operari</span>
          <select
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tots</option>
            {workerOptions.map((worker) => (
              <option key={worker} value={worker}>
                {worker}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              setDateMode('all')
              setStatusFilter('all')
              setExternalFilter('all')
              setWorkerFilter('all')
              setSearch('')
            }}
          />
        </div>
      </div>
    )
  }, [dateMode, externalFilter, scope, setContent, statusFilter, workerFilter, workerOptions])

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-8">
        <ModuleHeader title="Manteniment" subtitle="Seguiment" mainHref="/menu/manteniment" />
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="shrink-0">
              <SmartFilters
                modeDefault="week"
                role="Treballador"
                showDepartment={false}
                showWorker={false}
                showLocation={false}
                showStatus={false}
                onChange={handleDateChange}
                initialStart={dateRange.start}
                initialEnd={dateRange.end}
              />
            </div>

            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {DATE_MODE_LABELS[dateMode]}
            </span>

            <div className="min-w-[280px] flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Codi, maquina, ubicacio o descripcio..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dateMode === 'all' ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Filter className="h-4 w-4" />
                  Tots els tickets
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Filter className="h-4 w-4" />
                  Setmana {format(weekStart, "'W'II", { locale: ca })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setScope('active')}
                className={`min-h-[40px] rounded-full px-4 text-xs font-medium ${
                  scope === 'active' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                Actius {counts.active > 0 ? `(${counts.active})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setScope('closed')}
                className={`min-h-[40px] rounded-full px-4 text-xs font-medium ${
                  scope === 'closed' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                Tancats {counts.closed > 0 ? `(${counts.closed})` : ''}
              </button>
              <FilterButton onClick={() => undefined} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusFilter !== 'all' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {STATUS_LABELS[statusFilter as TicketStatus]}
            </span>
          ) : null}
          {workerFilter !== 'all' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {workerFilter}
            </span>
          ) : null}
          {externalFilter !== 'all' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {externalFilter === 'external' ? 'Derivats a proveidor' : 'Interns'}
            </span>
          ) : null}
          {search.trim() ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              Cerca activa
            </span>
          ) : null}
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Tickets</div>
              <div className="text-xs text-slate-500">
                {dateMode === 'all'
                  ? `${filteredTickets.length} resultats sense filtre temporal`
                  : `${filteredTickets.length} resultats per ${DATE_MODE_LABELS[dateMode].toLowerCase()}`}
              </div>
            </div>
          </div>

          {loading ? <div className="px-4 py-6 text-sm text-slate-500">Carregant tickets...</div> : null}
          {error ? <div className="px-4 py-6 text-sm text-red-600">{error}</div> : null}
          {!loading && !error && filteredTickets.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">
              {dateMode === 'all'
                ? 'No hi ha tickets amb aquests filtres.'
                : 'No hi ha tickets en aquest rang amb aquest criteri de data.'}
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="divide-y divide-slate-100">
              {filteredTickets.map((ticket) => {
                const latest = getLatestHistoryItem(ticket)
                const completed = getCompletedHistoryItem(ticket)
                const effectiveDate = getTicketDate(ticket, dateMode)
                const code = ticket.ticketCode || ticket.incidentNumber || ticket.id
                const isExpanded = expandedTicketId === ticket.id
                return (
                  <article key={ticket.id} className="px-4 py-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTicketId((prev) => (prev === ticket.id ? null : ticket.id))
                              }
                              className="text-left text-base font-semibold text-slate-900 hover:underline"
                            >
                              {ticket.description || ticket.machine || ticket.location || code}
                            </button>
                            <span className="text-sm text-slate-400">·</span>
                            <span className="text-sm text-slate-500">{code}</span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${maintenanceStatusBadge(ticket.status)}`}
                            >
                              {STATUS_LABELS[ticket.status]}
                            </span>
                            {ticket.externalized ? (
                              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
                                Proveidor
                              </span>
                            ) : null}
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                PRIORITY_BADGES[ticket.priority || 'normal'] || PRIORITY_BADGES.normal
                              }`}
                            >
                              {ticket.priority || 'normal'}
                            </span>
                          </div>
                          <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Ubicacio
                              </div>
                              <div className="mt-1 text-slate-700">{ticket.location || '-'}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Maquina
                              </div>
                              <div className="mt-1 text-slate-700">{ticket.machine || '-'}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Equip
                              </div>
                              <div className="mt-1 text-slate-700">
                                {(ticket.assignedToNames || []).join(', ') || '-'}
                              </div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Referencia temporal
                              </div>
                              <div className="mt-1 text-slate-700">
                                {effectiveDate ? formatDateTime(effectiveDate.toISOString()) : '-'}
                              </div>
                            </div>
                            {ticket.externalized ? (
                              <div className="rounded-xl bg-slate-50 px-3 py-2 md:col-span-2 xl:col-span-4">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Proveidor
                                </div>
                                <div className="mt-1 text-slate-700">
                                  {ticket.supplierName || ticket.supplierEmail || '-'}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTicketId((prev) => (prev === ticket.id ? null : ticket.id))
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                          aria-label={isExpanded ? 'Plegar detall' : 'Desplegar detall'}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
                          <div className="lg:col-span-2 space-y-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Historial
                            </div>
                            <div className="space-y-2">
                              {(ticket.statusHistory || [])
                                .slice()
                                .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                                .map((item, index) => (
                                  <div
                                    key={`${item.status}-${item.at}-${index}`}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                                  >
                                    <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-[120px_120px_120px_minmax(0,1fr)_140px] md:items-start">
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-500">Estat</div>
                                        <span
                                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maintenanceStatusBadge(item.status)}`}
                                        >
                                          {STATUS_LABELS[item.status]}
                                        </span>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-500">Treballador</div>
                                        <div>{item.byName || '-'}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-500">Hora</div>
                                        <div>
                                          {item.startTime || item.endTime
                                            ? `${item.startTime || '--:--'}-${item.endTime || '--:--'}`
                                            : '-'}
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-500">Observacions</div>
                                        <div className="break-words">{item.note || '-'}</div>
                                      </div>
                                      <div className="space-y-1 md:text-right">
                                        <div className="font-medium text-slate-500">Data i hora</div>
                                        <div>{formatDateTime(item.at)}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              {(!ticket.statusHistory || ticket.statusHistory.length === 0) ? (
                                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                                  Aquest ticket encara no te historic de canvis.
                                </div>
                              ) : null}
                            </div>

                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>

        {openedTicket ? (
          <PlannerTicketModal
            ticketId={openedTicket.id}
            initialTicket={openedTicket}
            initialDate={format(parseDate(openedTicket.plannedStart || openedTicket.createdAt) || new Date(), 'yyyy-MM-dd')}
            initialStartTime={
              parseDate(openedTicket.plannedStart)
                ? format(parseDate(openedTicket.plannedStart) as Date, 'HH:mm')
                : '08:00'
            }
            initialDurationMinutes={Math.max(30, Number(openedTicket.estimatedMinutes || 60))}
            locations={locations}
            machines={machines}
            users={users}
            onClose={() => setOpenedTicket(null)}
            onRefresh={loadTickets}
          />
        ) : null}
      </div>
    </RoleGuard>
  )
}
