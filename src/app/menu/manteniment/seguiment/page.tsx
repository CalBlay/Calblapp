'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ca } from 'date-fns/locale'
import { ChevronDown, ChevronUp, ExternalLink, Filter, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import { maintenanceStatusBadge } from '@/lib/colors'
import { RoleGuard } from '@/lib/withRoleGuard'
import type { MachineItem, Ticket, TicketStatus, UserItem } from '@/app/menu/manteniment/tickets/types'
import PlannerTicketModal from '@/app/menu/manteniment/preventius/planificador/components/PlannerTicketModal'

type TabKey = 'tickets' | 'preventius'
type DateMode = 'all' | 'planned' | 'created' | 'updated' | 'completed'
type MaintenanceStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat'
type WorkHistoryEntry = { status?: string | null; at?: number | string | null; startTime?: string | null; endTime?: string | null }
type Preventiu = {
  id: string
  title: string
  location: string
  workerNames: string[]
  status: MaintenanceStatus
  progress: number | null
  plannedDate: string | null
  plannedStart: string | null
  plannedEnd: string | null
  createdAt: number | string | null
  updatedAt: number | string | null
  completedAt: number | string | null
  recordId?: string | null
  history: Array<{ status: MaintenanceStatus; at: number; byName?: string; startTime?: string | null; endTime?: string | null; note?: string | null }>
}

const STATUSES: MaintenanceStatus[] = ['nou', 'assignat', 'en_curs', 'espera', 'fet', 'no_fet', 'validat']
const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'En espera',
  fet: 'Fet',
  no_fet: 'No fet',
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

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const parseDate = (value?: number | string | null) => {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const parseDateFromParts = (date?: string | null, time?: string | null) => parseDate(date ? `${date}T${time || '00:00'}:00` : null)
const formatDateTime = (value?: number | string | null) => (parseDate(value) ? format(parseDate(value) as Date, 'dd/MM/yyyy HH:mm') : '-')
const normalizeStatus = (value?: string | null): MaintenanceStatus => {
  const raw = String(value || 'assignat').trim().toLowerCase()
  if (raw === 'nou') return 'nou'
  if (raw === 'assignat' || raw === 'pendent') return 'assignat'
  if (raw === 'en_curs' || raw === 'en curs') return 'en_curs'
  if (raw === 'espera') return 'espera'
  if (raw === 'fet') return 'fet'
  if (raw === 'no_fet' || raw === 'no fet') return 'no_fet'
  if (raw === 'validat' || raw === 'resolut') return 'validat'
  return 'assignat'
}
const getDaysOpen = (value?: number | string | null) => (parseDate(value) ? Math.max(0, differenceInCalendarDays(new Date(), parseDate(value) as Date)) : null)
const getDaysBadge = (days: number | null) => (days === null ? 'bg-slate-100 text-slate-600' : days >= 8 ? 'bg-red-100 text-red-700' : days >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')
const parseHistoryTime = (at?: number | string | null, time?: string | null) => {
  if (!time) return null
  const base = parseDate(at)
  if (!base) return null
  const [hoursRaw, minutesRaw] = String(time).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const next = new Date(base)
  next.setHours(hours, minutes, 0, 0)
  return next
}
const getTrackedMinutes = (history?: WorkHistoryEntry[]) => {
  const entries = Array.isArray(history) ? history.slice().sort((a, b) => (parseDate(a.at)?.getTime() || 0) - (parseDate(b.at)?.getTime() || 0)) : []
  let openStart: Date | null = null
  let total = 0
  entries.forEach((entry) => {
    const start = parseHistoryTime(entry.at, entry.startTime)
    const end = parseHistoryTime(entry.at, entry.endTime)
    if (start && end) {
      const diff = end.getTime() - start.getTime()
      if (diff > 0) total += diff
      openStart = null
      return
    }
    if (start) {
      openStart = start
    }
    if (end && openStart) {
      const diff = end.getTime() - openStart.getTime()
      if (diff > 0) total += diff
      openStart = null
    }
  })
  return Math.round(total / 60000)
}
const hoursNumberFormatter = new Intl.NumberFormat('ca-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const formatTrackedHours = (minutes: number) => {
  if (!minutes) return '--'
  const hours = minutes / 60
  return `${hoursNumberFormatter.format(hours)} h`
}
const getMinutesFromTime = (value?: string | null) => {
  if (!value) return null
  const [hoursRaw, minutesRaw] = String(value).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}
const getPlannedMinutes = (start?: string | null, end?: string | null, fallback?: number | null) => {
  const startMinutes = getMinutesFromTime(start)
  const endMinutes = getMinutesFromTime(end)
  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) return endMinutes - startMinutes
  return typeof fallback === 'number' && fallback > 0 ? fallback : 0
}
const normalizeMachineLabel = (value?: string | null, machineNameMap?: Map<string, string>) => {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  if (machineNameMap?.has(raw)) return machineNameMap.get(raw) || raw
  if (raw.includes('Â·')) return raw.split('Â·').slice(1).join('Â·').trim() || raw
  const dashMatch = raw.match(/^[A-Z0-9-]+\s*-\s*(.+)$/i)
  if (dashMatch?.[1]) return dashMatch[1].trim()
  return raw
}
const getCurrentWeekRange = () => {
  const now = new Date()
  const start = new Date(now)
  const day = start.getDay() || 7
  if (day !== 1) start.setDate(start.getDate() - (day - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
}

export default function MaintenanceSeguimentPage() {
  const { setContent } = useFilters()
  const [tab, setTab] = useState<TabKey>('tickets')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [preventius, setPreventius] = useState<Preventiu[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateMode, setDateMode] = useState<DateMode>('all')
  const [externalFilter, setExternalFilter] = useState<'all' | 'internal' | 'external'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [pendingValidationOnly, setPendingValidationOnly] = useState(false)
  const [stalledOnly, setStalledOnly] = useState(false)
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openedTicket, setOpenedTicket] = useState<Ticket | null>(null)
  const [dateRange, setDateRange] = useState(getCurrentWeekRange)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [ticketsJson, plannedJson, completedJson, locationsJson, machinesJson, usersJson] = await Promise.all([
        fetcher('/api/maintenance/tickets?ticketType=maquinaria&limit=300'),
        fetcher('/api/maintenance/preventius/planned'),
        fetcher('/api/maintenance/preventius/completed'),
        fetcher('/api/spaces/internal'),
        fetcher('/api/maintenance/machines'),
        fetcher('/api/personnel?department=manteniment'),
      ])
      const nextTickets = Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets.map((ticket: Ticket) => ({ ...ticket, status: normalizeStatus(ticket.status) as TicketStatus })) : []
      const records = Array.isArray(completedJson?.records) ? completedJson.records : []
      const latestByPlannedId = new Map<string, any>()
      records.forEach((record: any) => {
        const plannedId = String(record.plannedId || '').trim()
        if (!plannedId) return
        const current = latestByPlannedId.get(plannedId)
        const currentTime = parseDate(current?.completedAt || current?.updatedAt)?.getTime() || 0
        const nextTime = parseDate(record.completedAt || record.updatedAt)?.getTime() || 0
        if (!current || nextTime >= currentTime) latestByPlannedId.set(plannedId, record)
      })
      const nextPreventius = Array.isArray(plannedJson?.items)
        ? plannedJson.items.map((item: any) => {
            const record = latestByPlannedId.get(String(item.id)) || null
            const history = Array.isArray(record?.statusHistory)
              ? record.statusHistory.map((entry: any) => ({ ...entry, status: normalizeStatus(entry.status) }))
              : []
            return {
              id: String(item.id || ''),
              title: String(item.title || 'Preventiu'),
              location: String(item.location || ''),
              workerNames: Array.isArray(item.workerNames) ? item.workerNames.map(String).filter(Boolean) : [],
              status: normalizeStatus(record?.status || item.lastStatus || (Array.isArray(item.workerNames) && item.workerNames.length ? 'assignat' : 'nou')),
              progress: typeof item.lastProgress === 'number' ? item.lastProgress : null,
              plannedDate: item.date || null,
              plannedStart: item.startTime || null,
              plannedEnd: item.endTime || null,
              createdAt: item.createdAt || parseDateFromParts(item.date, item.startTime)?.getTime() || null,
              updatedAt: item.lastUpdatedAt || record?.updatedAt || item.updatedAt || null,
              completedAt: record?.completedAt || item.lastCompletedAt || null,
              recordId: record?.id || item.lastRecordId || null,
              history,
            } satisfies Preventiu
          })
        : []
      setTickets(nextTickets)
      setPreventius(nextPreventius)
      setLocations(Array.isArray(locationsJson?.locations) ? locationsJson.locations : [])
      setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])
      setUsers(Array.isArray(usersJson?.data) ? usersJson.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant seguiment')
      setTickets([])
      setPreventius([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Filtrar per data</span><select value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="all">Sense filtre de data</option><option value="planned">Data planificada</option><option value="created">Data creacio</option><option value="updated">Ultim canvi</option><option value="completed">Data tancament</option></select></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Estat</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="all">Tots</option>{STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        {tab === 'tickets' ? <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Flux</span><select value={externalFilter} onChange={(e) => setExternalFilter(e.target.value as 'all' | 'internal' | 'external')} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="all">Tots</option><option value="internal">Interns</option><option value="external">Derivats a proveidor</option></select></label> : null}
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Operari</span><select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="all">Tots</option>{users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}</select></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Ubicació</span><select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"><option value="all">Totes</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={pendingValidationOnly} onChange={(e) => setPendingValidationOnly(e.target.checked)} />Només pendents de validar</label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={stalledOnly} onChange={(e) => setStalledOnly(e.target.checked)} />Només oberts 3+ dies</label>
        <div className="flex justify-end"><ResetFilterButton onClick={() => { setDateMode('all'); setStatusFilter('all'); setExternalFilter('all'); setWorkerFilter('all'); setLocationFilter('all'); setPendingValidationOnly(false); setStalledOnly(false); setSearch(''); setDateRange(getCurrentWeekRange()); setDateResetSignal((current) => current + 1) }} /></div>
      </div>
    )
  }, [dateMode, externalFilter, locationFilter, locations, pendingValidationOnly, setContent, stalledOnly, statusFilter, tab, users, workerFilter])

  const weekStart = useMemo(() => parseISO(dateRange.start), [dateRange.start])
  const weekEnd = useMemo(() => parseISO(dateRange.end), [dateRange.end])
  const applyDateFilter = useCallback((value: number | string | null) => {
    if (dateMode === 'all') return true
    const date = parseDate(value)
    if (!date) return false
    const ms = date.getTime()
    return ms >= weekStart.getTime() && ms <= weekEnd.getTime()
  }, [dateMode, weekEnd, weekStart])

  const ticketRows = useMemo(() => tickets.filter((ticket) => {
    if (statusFilter !== 'all' && normalizeStatus(ticket.status) !== statusFilter) return false
    if (externalFilter === 'external' && !ticket.externalized) return false
    if (externalFilter === 'internal' && ticket.externalized) return false
    if (workerFilter !== 'all' && !(ticket.assignedToNames || []).includes(workerFilter)) return false
    if (locationFilter !== 'all' && ticket.location !== locationFilter) return false
    if (pendingValidationOnly && normalizeStatus(ticket.status) !== 'fet') return false
    if (stalledOnly && (getDaysOpen(ticket.createdAt) || 0) < 3) return false
    if (search.trim() && ![ticket.ticketCode, ticket.incidentNumber, ticket.description, ticket.machine, ticket.location, ...(ticket.assignedToNames || []), ticket.supplierName].join(' ').toLowerCase().includes(search.trim().toLowerCase())) return false
    const reference = dateMode === 'planned' ? ticket.plannedStart : dateMode === 'created' ? ticket.createdAt : dateMode === 'updated' ? (ticket.statusHistory || []).slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at || ticket.assignedAt || ticket.createdAt : dateMode === 'completed' ? (ticket.statusHistory || []).filter((item) => normalizeStatus(item.status) === 'validat').sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at : ticket.createdAt
    return applyDateFilter(reference || null)
  }).sort((a, b) => (parseDate((b.statusHistory || []).slice().sort((x, y) => Number(y.at || 0) - Number(x.at || 0))[0]?.at || b.createdAt)?.getTime() || 0) - (parseDate((a.statusHistory || []).slice().sort((x, y) => Number(y.at || 0) - Number(x.at || 0))[0]?.at || a.createdAt)?.getTime() || 0)), [applyDateFilter, dateMode, externalFilter, locationFilter, pendingValidationOnly, search, stalledOnly, statusFilter, tickets, workerFilter])

  const preventiuRows = useMemo(() => preventius.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (workerFilter !== 'all' && !item.workerNames.includes(workerFilter)) return false
    if (locationFilter !== 'all' && item.location !== locationFilter) return false
    if (pendingValidationOnly && item.status !== 'fet') return false
    if (stalledOnly && (getDaysOpen(item.createdAt) || 0) < 3) return false
    if (search.trim() && ![item.title, item.location, ...item.workerNames].join(' ').toLowerCase().includes(search.trim().toLowerCase())) return false
    const reference = dateMode === 'planned' ? parseDateFromParts(item.plannedDate, item.plannedStart)?.getTime() : dateMode === 'created' ? item.createdAt : dateMode === 'updated' ? item.updatedAt : dateMode === 'completed' ? item.completedAt : item.createdAt
    return applyDateFilter(reference || null)
  }).sort((a, b) => (parseDate(b.updatedAt || b.createdAt)?.getTime() || 0) - (parseDate(a.updatedAt || a.createdAt)?.getTime() || 0)), [applyDateFilter, dateMode, locationFilter, pendingValidationOnly, preventius, search, stalledOnly, statusFilter, workerFilter])

  const currentRows = tab === 'tickets' ? ticketRows : preventiuRows
  const statusCounts = useMemo(() => Object.fromEntries(STATUSES.map((status) => [status, currentRows.filter((row: any) => normalizeStatus(row.status) === status).length])) as Record<MaintenanceStatus, number>, [currentRows])
  const summaryStatuses = useMemo(() => STATUSES.filter((status) => status !== 'fet'), [])
  const pendingValidationCount = currentRows.filter((row: any) => normalizeStatus(row.status) === 'fet').length
  const averageDays = currentRows.length ? Math.round(currentRows.reduce((sum: number, row: any) => sum + (getDaysOpen(row.createdAt) || 0), 0) / currentRows.length) : 0
  const totalTrackedMinutes = useMemo(() => tab === 'tickets' ? ticketRows.reduce((sum, row) => sum + getTrackedMinutes(row.statusHistory), 0) : preventiuRows.reduce((sum, row) => sum + getTrackedMinutes(row.history), 0), [preventiuRows, tab, ticketRows])
  const totalPlannedMinutes = useMemo(() => tab === 'tickets' ? ticketRows.reduce((sum, row) => sum + getPlannedMinutes(parseDate(row.plannedStart) ? format(parseDate(row.plannedStart) as Date, 'HH:mm') : null, parseDate(row.plannedEnd) ? format(parseDate(row.plannedEnd) as Date, 'HH:mm') : null, row.estimatedMinutes || null), 0) : preventiuRows.reduce((sum, row) => sum + getPlannedMinutes(row.plannedStart, row.plannedEnd), 0), [preventiuRows, tab, ticketRows])
  const machineNameMap = useMemo(() => new Map(machines.map((machine) => [String(machine.code || '').trim(), String(machine.name || '').trim()])), [machines])

  const openPreventiu = (item: Preventiu) => {
    const url = item.recordId ? `/menu/manteniment/preventius/fulls/${encodeURIComponent(item.id)}?recordId=${encodeURIComponent(item.recordId)}` : `/menu/manteniment/preventius/fulls/${encodeURIComponent(item.id)}`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-8">
        <ModuleHeader title="Manteniment" subtitle="Seguiment" mainHref="/menu/manteniment" />
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
            <div className="shrink-0"><SmartFilters modeDefault="week" modeOptions={['week', 'month', 'year', 'day', 'range']} resetSignal={dateResetSignal} role="Treballador" showDepartment={false} showWorker={false} showLocation={false} showStatus={false} onChange={(f: SmartFiltersChange) => f.start && f.end ? setDateRange({ start: f.start, end: f.end }) : null} initialStart={dateRange.start} initialEnd={dateRange.end} /></div>
            <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{DATE_MODE_LABELS[dateMode]}</div>
            <div className="min-w-[260px] flex-1">
              <div className="relative">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === 'tickets' ? 'Codi, maquina, ubicacio o descripcio...' : 'Preventiu, ubicacio o operari...'} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400" />
                {search.trim() ? <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['tickets', 'preventius'] as TabKey[]).map((item) => <button key={item} type="button" onClick={() => { setTab(item); setExpandedId(null) }} className={`min-h-[40px] rounded-full px-4 text-xs font-medium ${tab === item ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>{item === 'tickets' ? 'Tickets' : 'Preventius'}</button>)}
              <FilterButton onClick={() => undefined} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusFilter !== 'all' ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{STATUS_LABELS[statusFilter as MaintenanceStatus]}</span> : null}
            {workerFilter !== 'all' ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{workerFilter}</span> : null}
            {locationFilter !== 'all' ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{locationFilter}</span> : null}
            {tab === 'tickets' && externalFilter !== 'all' ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{externalFilter === 'external' ? 'Derivats a proveidor' : 'Interns'}</span> : null}
            {pendingValidationOnly ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">Pendents de validar</span> : null}
            {stalledOnly ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">Oberts 3+ dies</span> : null}
            {search.trim() ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Cerca activa</span> : null}
          </div>
        </div>
        <div className="grid w-full gap-3 xl:grid-cols-6">
          <div className="flex min-h-[126px] flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Pendents de validar</div>
            <div className="text-[32px] font-semibold leading-none text-amber-900">{pendingValidationCount}</div>
            <div className="mt-1 text-xs text-amber-700">Tasques en estat fet</div>
          </div>
          <div className="flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dies oberts mig</div>
            <div className="text-[32px] font-semibold leading-none text-slate-900">{averageDays}</div>
            <div className="mt-1 text-xs text-slate-500">Velocitat d'execucio</div>
          </div>
          <div className="flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Externalitzats</div>
            <div className="text-[32px] font-semibold leading-none text-slate-900">{tab === 'tickets' ? ticketRows.filter((row) => row.externalized).length : 0}</div>
            <div className="mt-1 text-xs text-slate-500">Només tickets</div>
          </div>
          <div className="flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hores planificades</div>
            <div className="whitespace-nowrap text-[32px] font-semibold leading-none text-slate-900">{formatTrackedHours(totalPlannedMinutes)}</div>
            <div className="mt-1 text-xs invisible">.</div>
          </div>
          <div className="flex min-h-[126px] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hores reals</div>
            <div className="whitespace-nowrap text-[32px] font-semibold leading-none text-slate-900">{formatTrackedHours(totalTrackedMinutes)}</div>
            <div className="mt-1 text-xs invisible">.</div>
          </div>
          <div className="flex min-h-[126px] items-stretch rounded-2xl border border-slate-200 bg-white p-3">
            <div className="grid h-full w-full grid-cols-3 gap-1.5">
              {summaryStatuses.map((status) => (
                <div key={status} className="flex min-h-[50px] flex-col items-center justify-center rounded-md bg-slate-50 px-2 py-1 text-center">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{STATUS_LABELS[status]}</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{statusCounts[status]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {loading ? <div className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">Carregant seguiment...</div> : null}
        {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-600">{error}</div> : null}
        {!loading && !error ? <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><div className="text-sm font-semibold text-slate-900">{tab === 'tickets' ? 'Tickets' : 'Preventius'}</div><div className="text-xs text-slate-500">{currentRows.length} resultats</div></div></div><div className="divide-y divide-slate-100">{currentRows.length === 0 ? <div className="px-4 py-8 text-sm text-slate-500">No hi ha registres amb aquests filtres.</div> : null}{tab === 'tickets' ? ticketRows.map((ticket) => { const expanded = expandedId === ticket.id; const days = getDaysOpen(ticket.createdAt); const trackedMinutes = getTrackedMinutes(ticket.statusHistory); const plannedMinutes = getPlannedMinutes(parseDate(ticket.plannedStart) ? format(parseDate(ticket.plannedStart) as Date, 'HH:mm') : null, parseDate(ticket.plannedEnd) ? format(parseDate(ticket.plannedEnd) as Date, 'HH:mm') : null, ticket.estimatedMinutes || null); const lastMovement = (ticket.statusHistory || []).slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at || ticket.assignedAt || ticket.createdAt; return <article key={ticket.id} className="px-4 py-4"><div className="space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setOpenedTicket(ticket)} className="text-left text-base font-semibold text-slate-900 hover:underline">{ticket.description || normalizeMachineLabel(ticket.machine, machineNameMap) || ticket.location || ticket.ticketCode || ticket.id}</button><span className={`rounded-full px-3 py-1 text-xs font-semibold ${maintenanceStatusBadge(ticket.status)}`}>{STATUS_LABELS[normalizeStatus(ticket.status)]}</span>{days !== null ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getDaysBadge(days)}`}>{days} dies</span> : null}{ticket.status === 'fet' ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Pendent de validar</span> : null}{ticket.externalized ? <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">Proveidor</span> : null}<span className={`rounded-full px-3 py-1 text-xs font-semibold ${PRIORITY_BADGES[ticket.priority || 'normal'] || PRIORITY_BADGES.normal}`}>{ticket.priority || 'normal'}</span></div><div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-7"><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ubicacio</div><div className="mt-1 text-slate-700">{ticket.location || '-'}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Maquina</div><div className="mt-1 text-slate-700">{normalizeMachineLabel(ticket.machine, machineNameMap)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Operari</div><div className="mt-1 text-slate-700">{(ticket.assignedToNames || []).join(', ') || '-'}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores planificades</div><div className="mt-1 text-slate-700">{formatTrackedHours(plannedMinutes)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores reals</div><div className="mt-1 text-slate-700">{formatTrackedHours(trackedMinutes)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ultim moviment</div><div className="mt-1 text-slate-700">{formatDateTime(lastMovement)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Data alta</div><div className="mt-1 text-slate-700">{formatDateTime(ticket.createdAt)}</div></div></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setExpandedId((prev) => prev === ticket.id ? null : ticket.id)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div></div>{expanded ? <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</div><div className="mt-3 space-y-2">{(ticket.statusHistory || []).slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).map((item, index) => <div key={`${item.status}-${item.at}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="grid gap-2 text-xs text-slate-600 md:grid-cols-[120px_140px_120px_minmax(0,1fr)_140px]"><div><div className="font-medium text-slate-500">Estat</div><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maintenanceStatusBadge(item.status)}`}>{STATUS_LABELS[normalizeStatus(item.status)]}</span></div><div><div className="font-medium text-slate-500">Operari</div><div>{item.byName || '-'}</div></div><div><div className="font-medium text-slate-500">Hora</div><div>{item.startTime || item.endTime ? `${item.startTime || '--:--'}-${item.endTime || '--:--'}` : '-'}</div></div><div><div className="font-medium text-slate-500">Observacions</div><div>{item.note || '-'}</div></div><div><div className="font-medium text-slate-500">Data</div><div>{formatDateTime(item.at)}</div></div></div></div>)}</div></div> : null}</div></article>}) : preventiuRows.map((item) => { const expanded = expandedId === item.id; const days = getDaysOpen(item.createdAt); const trackedMinutes = getTrackedMinutes(item.history); const plannedMinutes = getPlannedMinutes(item.plannedStart, item.plannedEnd); return <article key={item.id} className="px-4 py-4"><div className="space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openPreventiu(item)} className="text-left text-base font-semibold text-slate-900 hover:underline">{item.title}</button><span className={`rounded-full px-3 py-1 text-xs font-semibold ${maintenanceStatusBadge(item.status)}`}>{STATUS_LABELS[item.status]}</span>{days !== null ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getDaysBadge(days)}`}>{days} dies</span> : null}{item.status === 'fet' ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Pendent de validar</span> : null}{typeof item.progress === 'number' ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Checklist {item.progress}%</span> : null}</div><div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-7"><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ubicacio</div><div className="mt-1 text-slate-700">{item.location || '-'}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Operari</div><div className="mt-1 text-slate-700">{item.workerNames.join(', ') || '-'}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores planificades</div><div className="mt-1 text-slate-700">{formatTrackedHours(plannedMinutes)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores reals</div><div className="mt-1 text-slate-700">{formatTrackedHours(trackedMinutes)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Planificat</div><div className="mt-1 text-slate-700">{formatDateTime(parseDateFromParts(item.plannedDate, item.plannedStart)?.toISOString() || null)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ultim moviment</div><div className="mt-1 text-slate-700">{formatDateTime(item.updatedAt || item.createdAt)}</div></div><div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Data alta</div><div className="mt-1 text-slate-700">{formatDateTime(item.createdAt)}</div></div></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setExpandedId((prev) => prev === item.id ? null : item.id)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div></div>{expanded ? <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</div><div className="mt-3 space-y-2">{item.history.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">Aquest preventiu encara no te historial de canvis.</div> : item.history.slice().sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).map((entry, index) => <div key={`${entry.status}-${entry.at}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="grid gap-2 text-xs text-slate-600 md:grid-cols-[120px_140px_120px_minmax(0,1fr)_140px]"><div><div className="font-medium text-slate-500">Estat</div><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maintenanceStatusBadge(entry.status)}`}>{STATUS_LABELS[entry.status]}</span></div><div><div className="font-medium text-slate-500">Operari</div><div>{entry.byName || '-'}</div></div><div><div className="font-medium text-slate-500">Hora</div><div>{entry.startTime || entry.endTime ? `${entry.startTime || '--:--'}-${entry.endTime || '--:--'}` : '-'}</div></div><div><div className="font-medium text-slate-500">Observacions</div><div>{entry.note || '-'}</div></div><div><div className="font-medium text-slate-500">Data</div><div>{formatDateTime(entry.at)}</div></div></div></div>)}</div></div> : null}</div></article>})}</div></section> : null}
        {openedTicket ? <PlannerTicketModal ticketId={openedTicket.id} initialTicket={openedTicket} initialDate={format(parseDate(openedTicket.plannedStart || openedTicket.createdAt) || new Date(), 'yyyy-MM-dd')} initialStartTime={parseDate(openedTicket.plannedStart) ? format(parseDate(openedTicket.plannedStart) as Date, 'HH:mm') : '08:00'} initialDurationMinutes={Math.max(30, Number(openedTicket.estimatedMinutes || 60))} locations={locations} machines={machines} users={users} onClose={() => setOpenedTicket(null)} onRefresh={loadData} /> : null}
      </div>
    </RoleGuard>
  )
}


