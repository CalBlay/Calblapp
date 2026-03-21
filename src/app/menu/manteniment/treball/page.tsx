'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import { RoleGuard } from '@/lib/withRoleGuard'
import { normalizeRole } from '@/lib/roles'

type TicketStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat' | 'resolut'
type TicketPriority = 'urgent' | 'alta' | 'normal' | 'baixa'

type Ticket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  location: string
  machine: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  createdAt: number | string
  assignedToIds?: string[]
  assignedToNames?: string[]
  plannedStart?: number | string | null
  assignedAt?: number | string | null
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const formatMachine = (value?: string) => {
  if (!value) return ''
  const parts = value.split('·').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) return parts.slice(1).join(' · ').trim()
  return value.replace(/^([A-Z]{1,3}\d{3,}|Z\d{6,})\s*[-–]\s*/i, '').trim()
}
const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const getTicketDate = (ticket: Ticket) => {
  const base = ticket.plannedStart || ticket.assignedAt || ticket.createdAt
  if (!base) return null
  const date = typeof base === 'string' ? new Date(base) : new Date(Number(base))
  if (Number.isNaN(date.getTime())) return null
  return date
}

const formatHour = (ticket: Ticket) => {
  const base = ticket.plannedStart
  if (!base) return ''
  const date = typeof base === 'string' ? new Date(base) : new Date(Number(base))
  if (!date) return ''
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const getDayKey = (date: Date | null) => {
  if (!date) return 'sense-data'
  return format(date, 'yyyy-MM-dd')
}

export default function MaintenanceWorkPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userId = (session?.user as any)?.id || ''
  const role = normalizeRole((session?.user as any)?.role || '')
  const dept = normalizeDept((session?.user as any)?.department || '')
  const isCap = role === 'cap'
  const isAdmin = role === 'admin' || role === 'direccio'

  const isDecorations =
    dept === 'decoracio' || dept === 'decoracions' || dept === 'decoracion'
  const hasAccess = isAdmin || isDecorations

  useEffect(() => {
    if (status === 'loading') return
    if (!hasAccess) router.replace('/menu')
  }, [hasAccess, router, status])

  if (!hasAccess && status !== 'loading') return null

  const todayStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const todayEnd = endOfWeek(new Date(), { weekStartsOn: 1 })

  const [filters, setFiltersState] = useState<FiltersState>(() => ({
    start: format(todayStart, 'yyyy-MM-dd'),
    end: format(todayEnd, 'yyyy-MM-dd'),
    mode: 'week',
    status: '__all__',
  }))

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [usersById, setUsersById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState<{
    status?: TicketStatus
    startTime: string
    endTime: string
    note: string
  }>({ startTime: '', endTime: '', note: '' })

  const setFilters = (partial: Partial<FiltersState>) =>
    setFiltersState((prev) => ({ ...prev, ...partial }))

  const statusFilter = filters.status ?? '__all__'

  const fetchTickets = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      params.set('limit', '200')
      params.set('ticketType', 'deco')
      if (statusFilter && statusFilter !== '__all__') {
        params.set('status', statusFilter)
      }
      if (role === 'treballador' && userId) {
        params.set('assignedToId', userId)
      }
      const res = await fetch(`/api/maintenance/tickets?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const list = Array.isArray(json?.tickets) ? json.tickets : []
      setTickets(list.filter((t: Ticket) => t.status !== 'validat'))
    } catch {
      setTickets([])
      setError('No s’han pogut carregar els tickets.')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const list = Array.isArray(json) ? json : []
      const next: Record<string, string> = {}
      list.forEach((u: any) => {
        if (!u?.id) return
        const d = normalizeDept(u.departmentLower || u.department)
        if (d) next[String(u.id)] = d
      })
      setUsersById(next)
    } catch {
      setUsersById({})
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [statusFilter])

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleStatusChange = async (
    ticket: Ticket,
    status: TicketStatus,
    meta?: { startTime?: string; endTime?: string; note?: string }
  ) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          statusStartTime: meta?.startTime ?? null,
          statusEndTime: meta?.endTime ?? null,
          statusNote: meta?.note ?? null,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
    } catch (err: any) {
      alert(err?.message || 'No s’ha pogut actualitzar')
    }
  }

  const allowedNext = (status: TicketStatus) => {
    if (status === 'assignat') return ['en_curs', 'espera'] as TicketStatus[]
    if (status === 'en_curs') return role === 'treballador' ? (['espera', 'fet', 'no_fet'] as TicketStatus[]) : (['espera', 'fet', 'no_fet', 'validat'] as TicketStatus[])
    if (status === 'espera') return role === 'treballador' ? (['en_curs', 'fet', 'no_fet'] as TicketStatus[]) : (['en_curs', 'fet', 'no_fet', 'validat'] as TicketStatus[])
    if (status === 'fet' || status === 'no_fet') return role === 'treballador' ? ([] as TicketStatus[]) : (['validat'] as TicketStatus[])
    return [] as TicketStatus[]
  }

  const filteredTickets = useMemo(() => {
    const list = tickets.filter((t) => {
      if (isAdmin) return true
      if (isCap) {
        const ids = Array.isArray(t.assignedToIds) ? t.assignedToIds : []
        return ids.some((id) => usersById[String(id)] === dept)
      }
      if (role === 'treballador') {
        return Array.isArray(t.assignedToIds) && t.assignedToIds.includes(userId)
      }
      return false
    })
    if (statusFilter && statusFilter !== '__all__') {
      return list.filter((t) => t.status === statusFilter)
    }
    return list
  }, [tickets, role, dept, userId, isCap, statusFilter, usersById])

  const weekStart = parseISO(filters.start)
  const weekEnd = parseISO(filters.end)

  const inWeek = (t: Ticket) => {
    const date = getTicketDate(t)
    if (!date) return false
    return date >= weekStart && date <= new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000)
  }

  const groupedTickets = useMemo(() => {
    const list = filteredTickets.filter(inWeek)
    list.sort((a, b) => {
      const da = getTicketDate(a)?.getTime() ?? 0
      const db = getTicketDate(b)?.getTime() ?? 0
      return da - db
    })

    const grouped = new Map<string, Ticket[]>()
    list.forEach((ticket) => {
      const key = getDayKey(getTicketDate(ticket))
      const prev = grouped.get(key) ?? []
      prev.push(ticket)
      grouped.set(key, prev)
    })

    return Array.from(grouped.entries())
  }, [filteredTickets, filters.start, filters.end])

  return (
    <RoleGuard allowedRoles={['treballador', 'cap', 'admin', 'direccio']}>
      <main className="w-full">
        <ModuleHeader title="Deco" mainHref="/menu/deco" />

        <FiltersBar
          filters={filters}
          setFilters={setFilters}
          statusLabel="Estat del ticket"
          statusOptions={[
            { value: '__all__', label: 'Tots' },
            { value: 'assignat', label: 'Assignat' },
            { value: 'en_curs', label: 'En curs' },
            { value: 'espera', label: 'Espera' },
            { value: 'fet', label: 'Fet' },
            { value: 'no_fet', label: 'No fet' },
          ]}
        />

        <div className="mx-auto w-full max-w-none px-3 py-4">
          {loading && (
            <p className="text-center text-gray-500 py-10">Carregant...</p>
          )}

          {error && (
            <p className="text-center text-red-600 py-10">{error}</p>
          )}

          {!loading && !error && groupedTickets.length === 0 && (
            <p className="text-center text-gray-400 py-10">
              No hi ha tickets assignats.
            </p>
          )}

          {!loading && !error && groupedTickets.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-indigo-100 text-indigo-900 font-semibold">
                  <tr>
                    <th className="px-3 py-2 text-left">Codi</th>
                    <th className="px-3 py-2 text-left">Ubicació</th>
                    <th className="px-3 py-2 text-left">Equip</th>
                    <th className="px-3 py-2 text-left">Màquina</th>
                    <th className="px-3 py-2 text-left">Explicació</th>
                    <th className="px-3 py-2 text-left">Hora</th>
                    <th className="px-3 py-2 text-left">Importància</th>
                    <th className="px-3 py-2 text-left">Estat</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedTickets.map(([day, items]) => (
                    <React.Fragment key={day}>
                      <tr className="bg-indigo-50 text-indigo-800">
                        <td colSpan={8} className="px-3 py-2 font-semibold">
                          {day === 'sense-data'
                            ? 'Sense data assignació'
                            : format(parseISO(day), 'dd-MM-yyyy')}
                        </td>
                      </tr>
                      {items.map((ticket) => {
                        const names = Array.isArray(ticket.assignedToNames)
                          ? ticket.assignedToNames
                          : []
                        const teamLabel = names.length > 0 ? names.join(', ') : '-'
                        const machineLabel = formatMachine(ticket.machine)
                        const nextOptions = allowedNext(ticket.status)
                        return (
                          <tr key={ticket.id} className="border-t">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {ticket.incidentNumber || ticket.ticketCode || 'TIC'}
                            </td>
                            <td className="px-3 py-2">{ticket.location}</td>
                            <td className="px-3 py-2">{teamLabel}</td>
                            <td className="px-3 py-2 font-semibold">{machineLabel}</td>
                            <td className="px-3 py-2">{ticket.description}</td>
                            <td className="px-3 py-2">{formatHour(ticket)}</td>
                            <td className="px-3 py-2">
                              {PRIORITY_LABELS[ticket.priority]}
                            </td>
                            <td className="px-3 py-2">
                              <div className="relative flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (statusPopoverId === ticket.id) {
                                      setStatusPopoverId(null)
                                      return
                                    }
                                    setStatusDraft({
                                      status: undefined,
                                      startTime: '',
                                      endTime: '',
                                      note: '',
                                    })
                                    setStatusPopoverId(ticket.id)
                                  }}
                                  className="inline-flex w-fit items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800"
                                >
                                  {STATUS_LABELS[ticket.status]}
                                </button>
                                {statusPopoverId === ticket.id && nextOptions.length > 0 && (
                                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
                                    <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
                                      <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold text-gray-800">
                                          Canviar etapa
                                        </div>
                                        <button
                                          type="button"
                                          className="text-gray-500 hover:text-gray-700"
                                          onClick={() => setStatusPopoverId(null)}
                                        >
                                          ×
                                        </button>
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-end gap-3">
                                        <div className="flex flex-wrap gap-2">
                                          {nextOptions.map((next) => (
                                            <button
                                              key={next}
                                              type="button"
                                              onClick={() =>
                                                setStatusDraft((prev) => ({
                                                  ...prev,
                                                  status: next,
                                                }))
                                              }
                                              className={`px-3 py-1 rounded-full border text-xs ${
                                                statusDraft.status === next
                                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                                  : 'bg-white'
                                              }`}
                                            >
                                              {STATUS_LABELS[next]}
                                            </button>
                                          ))}
                                        </div>
                                        <label className="text-xs text-gray-600">
                                          {statusDraft.status === 'fet' ||
                                          statusDraft.status === 'no_fet' ||
                                          statusDraft.status === 'validat'
                                            ? 'Hora fi'
                                            : 'Hora inici'}
                                          <input
                                            type="time"
                                            className="mt-1 h-9 w-32 rounded-lg border px-2 text-xs"
                                            value={
                                              statusDraft.status === 'fet' ||
                                              statusDraft.status === 'no_fet' ||
                                              statusDraft.status === 'validat'
                                                ? statusDraft.endTime
                                                : statusDraft.startTime
                                            }
                                            onChange={(e) =>
                                              setStatusDraft((prev) => ({
                                                ...prev,
                                                startTime:
                                                  prev.status === 'fet' ||
                                                  prev.status === 'no_fet' ||
                                                  prev.status === 'validat'
                                                    ? prev.startTime
                                                    : e.target.value,
                                                endTime:
                                                  prev.status === 'fet' ||
                                                  prev.status === 'no_fet' ||
                                                  prev.status === 'validat'
                                                    ? e.target.value
                                                    : prev.endTime,
                                              }))
                                            }
                                          />
                                        </label>
                                      </div>
                                      <label className="mt-3 block text-xs text-gray-600">
                                        Observacions
                                        <textarea
                                          className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                                          rows={3}
                                          value={statusDraft.note}
                                          onChange={(e) =>
                                            setStatusDraft((prev) => ({
                                              ...prev,
                                              note: e.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <div className="mt-4 flex justify-end gap-2">
                                        <button
                                          type="button"
                                          className="px-3 py-1 text-xs text-gray-600"
                                          onClick={() => setStatusPopoverId(null)}
                                        >
                                          Cancel·lar
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white"
                                          onClick={() => {
                                            if (!statusDraft.status) return
                                            if (
                                              statusDraft.status === 'fet' ||
                                              statusDraft.status === 'no_fet' ||
                                              statusDraft.status === 'validat'
                                            ) {
                                              if (!statusDraft.endTime) {
                                                alert('Omple hora fi.')
                                                return
                                              }
                                            } else if (!statusDraft.startTime) {
                                              alert('Omple hora inici.')
                                              return
                                            }
                                            handleStatusChange(ticket, statusDraft.status, {
                                              startTime:
                                                statusDraft.status === 'fet' ||
                                                statusDraft.status === 'no_fet' ||
                                                statusDraft.status === 'validat'
                                                  ? undefined
                                                  : statusDraft.startTime,
                                              endTime:
                                                statusDraft.status === 'fet' ||
                                                statusDraft.status === 'no_fet' ||
                                                statusDraft.status === 'validat'
                                                  ? statusDraft.endTime
                                                  : undefined,
                                              note: statusDraft.note,
                                            })
                                            setStatusPopoverId(null)
                                          }}
                                        >
                                          Guardar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  )
}
