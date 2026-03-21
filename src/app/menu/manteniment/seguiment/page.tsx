'use client'

import { useEffect, useMemo, useState } from 'react'
import { addWeeks, endOfWeek, format, startOfWeek, subWeeks } from 'date-fns'
import { ca } from 'date-fns/locale'
import { Filter, History, Wrench } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import type { Ticket, TicketStatus } from '@/app/menu/manteniment/tickets/types'

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

const STATUS_BADGES: Record<TicketStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-800',
  assignat: 'bg-sky-100 text-sky-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-green-100 text-green-800',
  no_fet: 'bg-rose-100 text-rose-700',
  resolut: 'bg-violet-100 text-violet-800',
  validat: 'bg-violet-100 text-violet-800',
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
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursorDate, setCursorDate] = useState(() => new Date())
  const [scope, setScope] = useState<Scope>('active')
  const [dateMode, setDateMode] = useState<DateMode>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [historyTicket, setHistoryTicket] = useState<Ticket | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await fetch('/api/maintenance/tickets?ticketType=maquinaria&limit=200', {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('No s han pogut carregar els tickets')
        const json = await res.json()
        if (!cancelled) setTickets(Array.isArray(json?.tickets) ? json.tickets : [])
      } catch (err) {
        if (!cancelled) {
          setTickets([])
          setError(err instanceof Error ? err.message : 'Error carregant seguiment')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const weekStart = useMemo(() => startOfWeek(cursorDate, { weekStartsOn: 1 }), [cursorDate])
  const weekEnd = useMemo(() => endOfWeek(cursorDate, { weekStartsOn: 1 }), [cursorDate])

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
  }, [dateMode, scope, search, statusFilter, tickets, weekEnd, weekStart, workerFilter])

  const counts = useMemo(
    () => ({
      active: tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status)).length,
      closed: tickets.filter((ticket) => CLOSED_STATUSES.includes(ticket.status)).length,
    }),
    [tickets]
  )

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="space-y-5 px-4 pb-8">
        <ModuleHeader title="Manteniment" subtitle="Seguiment" mainHref="/menu/manteniment" />

        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Wrench className="h-4 w-4 text-emerald-700" />
              Seguiment operatiu
            </div>
            <div className="text-xs text-emerald-800/80">
              {dateMode === 'all' ? (
                <span>
                  Vista global sense setmana ni data.
                </span>
              ) : (
                <span>
                  La setmana filtra per <span className="font-semibold">{DATE_MODE_LABELS[dateMode]}</span>
                </span>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-emerald-800/80">
            Actius = nous, assignats, en curs, en espera, fets i no fets. Tancats = validats.
          </div>
        </section>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"
                onClick={() => setCursorDate((prev) => subWeeks(prev, 1))}
              >
                {'<'}
              </button>
              <span>
                {format(weekStart, 'd MMM', { locale: ca })} - {format(weekEnd, 'd MMM', { locale: ca })}
              </span>
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"
                onClick={() => setCursorDate((prev) => addWeeks(prev, 1))}
              >
                {'>'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setScope('active')}
                className={`min-h-[44px] rounded-full px-4 font-medium ${
                  scope === 'active' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                Actius {counts.active > 0 ? `(${counts.active})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setScope('closed')}
                className={`min-h-[44px] rounded-full px-4 font-medium ${
                  scope === 'closed' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                Tancats {counts.closed > 0 ? `(${counts.closed})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className="min-h-[44px] rounded-full border border-slate-200 px-4 font-medium text-slate-600 md:hidden"
              >
                Filtres
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 md:hidden">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {DATE_MODE_LABELS[dateMode]}
            </span>
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
          </div>

          <div className={`mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5 ${showFilters ? 'grid' : 'hidden md:grid'}`}>
            <label className="space-y-1 text-xs text-slate-600">
              <span className="font-medium">Filtrar per data</span>
              <select
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value as DateMode)}
                className="min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
              >
                <option value="all">Sense filtre de data</option>
                <option value="planned">Data planificada</option>
                <option value="created">Data creacio</option>
                <option value="updated">Ultim canvi</option>
                <option value="completed">Data tancament</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-600">
              <span className="font-medium">Estat</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
              >
                <option value="all">Tots</option>
                {(scope === 'active' ? ACTIVE_STATUSES : CLOSED_STATUSES).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-600">
              <span className="font-medium">Operari</span>
              <select
                value={workerFilter}
                onChange={(e) => setWorkerFilter(e.target.value)}
                className="min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900"
              >
                <option value="all">Tots</option>
                {workerOptions.map((worker) => (
                  <option key={worker} value={worker}>
                    {worker}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-600 xl:col-span-2">
              <span className="font-medium">Cerca</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Codi, maquina, ubicacio o descripcio..."
                className="min-h-[48px] w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </label>
          </div>
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
                return (
                  <article key={ticket.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900">{code}</span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGES[ticket.status]}`}
                        >
                          {STATUS_LABELS[ticket.status]}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            PRIORITY_BADGES[ticket.priority || 'normal'] || PRIORITY_BADGES.normal
                          }`}
                        >
                          {ticket.priority || 'normal'}
                        </span>
                      </div>
                      <div className="text-base text-slate-900">
                        {ticket.description || ticket.machine || ticket.location || '-'}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                        <span>Ubicacio: {ticket.location || '-'}</span>
                        <span>Maquina: {ticket.machine || '-'}</span>
                        <span>Equip: {(ticket.assignedToNames || []).join(', ') || '-'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      <div>
                        <span className="font-medium text-slate-800">Visible per:</span> {DATE_MODE_LABELS[dateMode]}
                      </div>
                      <div>{formatDateTime(effectiveDate?.getTime())}</div>
                      <div>Creat: {formatDateTime(ticket.createdAt)}</div>
                      <div>Planificat: {formatDateTime(ticket.plannedStart)}</div>
                      <div>
                        Ultim canvi: {latest ? `${STATUS_LABELS[latest.status]} - ${formatDateTime(latest.at)}` : '-'}
                      </div>
                      <div>
                        Tancament:{' '}
                        {completed ? `${STATUS_LABELS[completed.status]} - ${formatDateTime(completed.at)}` : '-'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setHistoryTicket(ticket)}
                        className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-sky-200 px-4 text-sm font-medium text-sky-700"
                      >
                        <History className="h-3.5 w-3.5" />
                        Veure historic
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>

        {historyTicket ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 md:items-center">
            <div className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl">
              <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Historic - {historyTicket.ticketCode || historyTicket.incidentNumber || historyTicket.id}
                  </div>
                  <div className="text-xs text-slate-500">
                    Creat {formatDateOnly(historyTicket.createdAt)} - {historyTicket.location || 'Sense ubicacio'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryTicket(null)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Tancar historic"
                >
                  <span className="text-sm font-semibold">x</span>
                </button>
              </div>
              <div className="space-y-2">
                {(historyTicket.statusHistory || [])
                  .slice()
                  .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
                  .map((item, index) => (
                    <div
                      key={`${item.status}-${item.at}-${index}`}
                      className="rounded-2xl border border-slate-100 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGES[item.status]}`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span className="text-xs text-slate-500">{formatDateTime(item.at)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {item.byName || '-'}
                        {item.startTime || item.endTime
                          ? ` - ${item.startTime || '--:--'}-${item.endTime || '--:--'}`
                          : ''}
                      </div>
                      {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                    </div>
                  ))}
                {(!historyTicket.statusHistory || historyTicket.statusHistory.length === 0) ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                    Aquest ticket encara no te historic de canvis.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </RoleGuard>
  )
}
