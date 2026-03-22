'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { addDays, addWeeks, endOfWeek, format, parseISO, startOfWeek, subDays, subWeeks } from 'date-fns'
import * as XLSX from 'xlsx'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { RoleGuard } from '@/lib/withRoleGuard'
import ExportMenu from '@/components/export/ExportMenu'
import { normalizeRole } from '@/lib/roles'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
type TicketStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat' | 'resolut'

type Ticket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  location?: string
  machine?: string
  description?: string
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  status: TicketStatus
  assignedToNames?: string[]
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

const getStatusLabel = (status?: string | null, fallback = 'pendent') => {
  const key = String(status || fallback).trim().toLowerCase()
  if (key in STATUS_LABELS) return STATUS_LABELS[key as TicketStatus]
  if (key === 'pendent') return 'Pendent'
  return key || fallback
}

export default function PreventiusFullsPage() {
  const { data: session } = useSession()
  const { setContent } = useFilters()
  const searchParams = useSearchParams()
  const role = normalizeRole((session?.user as any)?.role || '')
  const canFilterByWorker = role === 'admin' || role === 'direccio' || role === 'cap'
  const [filters, setFiltersState] = useState<{ start: string; end: string; mode: 'day' | 'week' }>(() => {
    const value = format(new Date(), 'yyyy-MM-dd')
    return { start: value, end: value, mode: 'day' }
  })
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [plannedItems, setPlannedItems] = useState<
    Array<{
      id: string
      kind: 'preventiu'
      title: string
      date: string
      startTime: string
      endTime: string
      location?: string
      worker?: string
      templateId?: string | null
      lastRecordId?: string | null
      lastStatus?: string | null
      lastProgress?: number | null
    }>
  >([])
  const [ticketItems, setTicketItems] = useState<
    Array<{
      id: string
      kind: 'ticket'
      title: string
      code?: string
      status?: 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat' | 'resolut'
      ticketType?: 'maquinaria' | 'deco'
      date: string
      startTime: string
      endTime: string
      location?: string
      worker?: string
      templateId?: string
    }>
  >([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [statusDraft, setStatusDraft] = useState<{
    status?: TicketStatus
    startTime: string
    endTime: string
    note: string
  }>({ startTime: '', endTime: '', note: '' })
  const queryTicketId = (searchParams?.get('ticketId') || '').trim()
  const queryStart = (searchParams?.get('start') || '').trim()
  const queryEnd = (searchParams?.get('end') || '').trim()

  useEffect(() => {
    if (!queryStart && !queryEnd) return
    setFiltersState((prev) => {
      const nextStart = queryStart || prev.start
      const nextEnd = queryEnd || prev.end
      const nextMode = nextStart === nextEnd ? 'day' : 'week'
      if (prev.start === nextStart && prev.end === nextEnd && prev.mode === nextMode) return prev
      return { ...prev, start: nextStart, end: nextEnd, mode: nextMode }
    })
  }, [queryEnd, queryStart])

  const loadPlannedItems = async (start: string, end: string) => {
    try {
      const res = await fetch(
        `/api/maintenance/preventius/planned?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setPlannedItems([])
        return
      }
      const json = await res.json()
      const list = Array.isArray(json?.items) ? json.items : []
      const mapped = list
        .map((item: any) => {
          if (!item?.date || !item?.startTime || !item?.endTime) return null
          return {
            id: String(item.id || ''),
            kind: 'preventiu' as const,
            title: String(item.title || ''),
            date: String(item.date || ''),
            startTime: String(item.startTime || ''),
            endTime: String(item.endTime || ''),
            location: String(item.location || ''),
            worker: Array.isArray(item.workerNames) ? item.workerNames.join(', ') : '',
            templateId: item.templateId || null,
            lastRecordId: item.lastRecordId || null,
            lastStatus: item.lastStatus || null,
            lastProgress: typeof item.lastProgress === 'number' ? item.lastProgress : null,
          }
        })
        .filter(Boolean)
      setPlannedItems(mapped as any)
    } catch {
      setPlannedItems([])
    }
  }

  useEffect(() => {
    loadPlannedItems(filters.start, filters.end)
    const onFocus = () => loadPlannedItems(filters.start, filters.end)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filters.start, filters.end])

  useEffect(() => {
    const loadTickets = async (start: string, end: string) => {
      try {
        const params = new URLSearchParams()
        params.set('ticketType', 'maquinaria')
        if (start) params.set('start', start)
        if (end) params.set('end', end)
        const res = await fetch(`/api/maintenance/tickets?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json?.tickets) ? json.tickets : []
        const mapped = list
          .filter((t: any) => t.plannedStart && t.plannedEnd)
          .map((t: any) => {
            const start = new Date(Number(t.plannedStart))
            const end = new Date(Number(t.plannedEnd))
            const code = t.ticketCode || t.incidentNumber || 'TIC'
            const title = t.description || t.machine || t.location || ''
            return {
              id: String(t.id || code),
              kind: 'ticket' as const,
              title,
              code,
              status: t.status || 'nou',
              ticketType: t.ticketType === 'deco' ? 'deco' : 'maquinaria',
              date: format(start, 'yyyy-MM-dd'),
              startTime: format(start, 'HH:mm'),
              endTime: format(end, 'HH:mm'),
              location: t.location || '',
              worker: Array.isArray(t.assignedToNames) ? t.assignedToNames.join(', ') : '',
            }
          })
        setTicketItems(mapped)
      } catch {
        setTicketItems([])
      }
    }
    loadTickets(filters.start, filters.end)
    const onFocus = () => loadTickets(filters.start, filters.end)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [filters.start, filters.end])

  useEffect(() => {
    if (!queryTicketId) return
    if (selectedTicket?.id === queryTicketId) return
    const existing = ticketItems.find((item) => item.id === queryTicketId)
    if (existing) {
      openTicket(existing.id, existing.code, existing.ticketType)
    }
  }, [queryTicketId, selectedTicket?.id, ticketItems])

  const currentStart = useMemo(() => parseISO(filters.start), [filters.start])
  const currentEnd = useMemo(() => parseISO(filters.end), [filters.end])

  const setMode = (nextMode: 'day' | 'week') => {
    if (nextMode === 'day') {
      const value = format(currentStart, 'yyyy-MM-dd')
      setFiltersState({ start: value, end: value, mode: 'day' })
      return
    }
    const weekStart = startOfWeek(currentStart, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentStart, { weekStartsOn: 1 })
    setFiltersState({
      start: format(weekStart, 'yyyy-MM-dd'),
      end: format(weekEnd, 'yyyy-MM-dd'),
      mode: 'week',
    })
  }

  const shiftRange = (direction: 'prev' | 'next') => {
    if (filters.mode === 'day') {
      const next = direction === 'next' ? addDays(currentStart, 1) : subDays(currentStart, 1)
      const value = format(next, 'yyyy-MM-dd')
      setFiltersState({ start: value, end: value, mode: 'day' })
      return
    }
    const next = direction === 'next' ? addWeeks(currentStart, 1) : subWeeks(currentStart, 1)
    const weekStart = startOfWeek(next, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(next, { weekStartsOn: 1 })
    setFiltersState({
      start: format(weekStart, 'yyyy-MM-dd'),
      end: format(weekEnd, 'yyyy-MM-dd'),
      mode: 'week',
    })
  }

  const rangeLabel =
    filters.mode === 'day'
      ? format(currentStart, 'dd MMM yyyy')
      : `${format(currentStart, 'd MMM')} - ${format(currentEnd, 'd MMM')}`

  const filteredByDate = useMemo(() => {
    const start = parseISO(filters.start)
    const end = parseISO(filters.end)
    return [...plannedItems, ...ticketItems].filter((item) => {
      const date = parseISO(item.date)
      return date >= start && date <= end
    })
  }, [filters.start, filters.end, plannedItems, ticketItems])

  const workerOptions = useMemo(() => {
    const values = new Set<string>()
    filteredByDate.forEach((item) => {
      const raw = (item.worker || '').trim()
      if (!raw) return
      raw
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .forEach((w) => values.add(w))
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [filteredByDate])

  const statusOptions = useMemo(() => {
    const values = new Set<string>()
    filteredByDate.forEach((item) => {
      const raw =
        item.kind === 'ticket'
          ? String((item as any).status || 'assignat').trim().toLowerCase()
          : String((item as any).lastStatus || 'pendent').trim().toLowerCase()
      if (!raw) return
      values.add(raw)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [filteredByDate])

  const grouped = useMemo(() => {
    const workerNeedle = workerFilter.toLowerCase()
    const items = filteredByDate.filter((item) => {
      const matchesWorker =
        !canFilterByWorker || workerFilter === 'all'
          ? true
          : (item.worker || '')
              .split(',')
              .map((w) => w.trim().toLowerCase())
              .filter(Boolean)
              .includes(workerNeedle)

      const itemStatus =
        item.kind === 'ticket'
          ? String((item as any).status || 'assignat').trim().toLowerCase()
          : String((item as any).lastStatus || 'pendent').trim().toLowerCase()
      const matchesStatus = statusFilter === 'all' ? true : itemStatus === statusFilter

      return matchesWorker && matchesStatus
    })

    const map = new Map<string, typeof items>()
    items.forEach((item) => {
      const list = map.get(item.date) || []
      list.push(item)
      map.set(item.date, list)
    })

    return Array.from(map.entries()).sort(([a], [b]) => (a > b ? 1 : -1))
  }, [filteredByDate, workerFilter, statusFilter, canFilterByWorker])

  const statusClasses: Record<string, string> = {
    nou: 'bg-emerald-100 text-emerald-800',
    assignat: 'bg-blue-100 text-blue-800',
    en_curs: 'bg-amber-100 text-amber-800',
    espera: 'bg-slate-100 text-slate-700',
    fet: 'bg-green-100 text-green-800',
    no_fet: 'bg-rose-100 text-rose-700',
    resolut: 'bg-purple-100 text-purple-800',
    validat: 'bg-purple-100 text-purple-800',
    pendent: 'bg-slate-100 text-slate-700',
  }

  const exportBase = `manteniment-fulls-${filters.start || 'start'}-${filters.end || 'end'}`

  useEffect(() => {
    setContent(
      <div className="space-y-4 p-4">
        {canFilterByWorker ? (
          <label className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">Treballador</span>
            <select
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
            >
              <option value="all">Tots</option>
              {workerOptions.map((w) => (
                <option key={w} value={w.toLowerCase()}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Estat</span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tots</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status, status)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end">
          <ResetFilterButton
            onClick={() => {
              setWorkerFilter('all')
              setStatusFilter('all')
            }}
          />
        </div>
      </div>
    )
  }, [canFilterByWorker, setContent, statusFilter, statusOptions, workerFilter, workerOptions])

  const exportRows = useMemo(
    () =>
      grouped.flatMap(([day, items]) =>
        items.map((item) => {
          const isTicket = item.kind === 'ticket'
          const status = isTicket
            ? (item as any).status || 'assignat'
            : (item as any).lastStatus || 'pendent'
          const progress =
            !isTicket && typeof (item as any).lastProgress === 'number'
              ? `${(item as any).lastProgress}%`
              : ''
          return {
            Data: format(parseISO(day), 'dd/MM/yyyy'),
            Tipus: isTicket ? 'Ticket' : 'Preventiu',
            Codi: isTicket ? (item as any).code || '' : '',
            Titol: item.title || '',
            HoraInici: item.startTime || '',
            HoraFi: item.endTime || '',
            Ubicacio: item.location || '',
            Operari: item.worker || '',
            Estat: getStatusLabel(status, isTicket ? 'assignat' : 'pendent'),
            Progres: progress,
          }
        })
      ),
    [grouped]
  )

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FullsTreball')
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
      'Data',
      'Tipus',
      'Codi',
      'Titol',
      'HoraInici',
      'HoraFi',
      'Ubicacio',
      'Operari',
      'Estat',
      'Progres',
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
    <h1>Manteniment - Fulls de treball</h1>
    <div class="meta">Rang: ${escapeHtml(filters.start || '')} - ${escapeHtml(
      filters.end || ''
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
    { label: 'Excel (.xlsx)', onClick: handleExportExcel, disabled: exportRows.length === 0 },
    { label: 'PDF (vista)', onClick: handleExportPdfView, disabled: grouped.length === 0 },
    { label: 'PDF (taula)', onClick: handleExportPdfTable, disabled: exportRows.length === 0 },
  ]

  const openFitxa = (id: string, recordId?: string | null) => {
    const url = recordId
      ? `/menu/manteniment/preventius/fulls/${id}?recordId=${encodeURIComponent(recordId)}`
      : `/menu/manteniment/preventius/fulls/${id}`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  const openTicket = async (
    id: string,
    code?: string,
    ticketType?: 'maquinaria' | 'deco'
  ) => {
    try {
      if (code) {
        const res = await fetch(
          `/api/maintenance/tickets?ticketType=${ticketType || 'maquinaria'}&code=${encodeURIComponent(code)}`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const json = await res.json()
          const list = Array.isArray(json?.tickets) ? json.tickets : []
          if (list[0]) {
            setSelectedTicket(list[0])
            return
          }
        }
      }
      const res = await fetch(
        `/api/maintenance/tickets?ticketType=${ticketType || 'maquinaria'}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const json = await res.json()
      const list = Array.isArray(json?.tickets) ? json.tickets : []
      const match = list.find((t: Ticket) => String(t.id) === String(id))
      if (match) setSelectedTicket(match)
    } catch {
      return
    }
  }

  const allowedNext = (status: TicketStatus) => {
    if (status === 'assignat') return ['en_curs', 'espera'] as TicketStatus[]
    if (status === 'en_curs') return role === 'treballador' ? (['espera', 'fet', 'no_fet'] as TicketStatus[]) : (['espera', 'fet', 'no_fet', 'validat'] as TicketStatus[])
    if (status === 'espera') return role === 'treballador' ? (['en_curs', 'fet', 'no_fet'] as TicketStatus[]) : (['en_curs', 'fet', 'no_fet', 'validat'] as TicketStatus[])
    if (status === 'fet') return role === 'treballador' ? ([] as TicketStatus[]) : (['validat'] as TicketStatus[])
    if (status === 'no_fet') return [] as TicketStatus[]
    return [] as TicketStatus[]
  }

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
      if (!res.ok) throw new Error()
      setSelectedTicket(null)
    } catch {
      alert('No s’ha pogut actualitzar')
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #manteniment-fulls-print-root, #manteniment-fulls-print-root * { visibility: visible; }
            #manteniment-fulls-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
        <ModuleHeader
          title="Manteniment"
          subtitle="Jornada"
          mainHref="/menu/manteniment"
          actions={<ExportMenu items={exportItems} />}
        />

        <MaintenanceToolbar
          rangeLabel={rangeLabel}
          onPrev={() => shiftRange('prev')}
          onNext={() => shiftRange('next')}
          modeValue={filters.mode}
          modeOptions={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Setmana' },
          ]}
          onModeChange={(value) => setMode(value as 'day' | 'week')}
          onOpenFilters={() => undefined}
        />

        <div className="flex flex-wrap gap-2">
          {canFilterByWorker && workerFilter !== 'all' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {workerOptions.find((w) => w.toLowerCase() === workerFilter) || workerFilter}
            </span>
          ) : null}
          {statusFilter !== 'all' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {getStatusLabel(statusFilter, statusFilter)}
            </span>
          ) : null}
        </div>

        <div id="manteniment-fulls-print-root" className="rounded-2xl border bg-white overflow-hidden">
          <div className="divide-y">
            {grouped.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">No hi ha tasques.</div>
            )}
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50">
                  {format(parseISO(day), 'dd/MM/yyyy')}
                </div>
                <div className="divide-y">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-gray-900">
                          {item.kind === 'ticket'
                            ? item.code
                              ? `${item.code} - ${item.title}`
                              : item.title
                            : item.title}
                        </div>
                        <div className="mt-1 text-sm text-gray-700">
                          {item.startTime}–{item.endTime}
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          {item.location}
                          {item.worker ? ` · ${item.worker}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 md:items-end">
                        <div className="flex flex-wrap gap-2">
                          {item.kind === 'ticket' && (
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                statusClasses[(item as any).status || 'assignat']
                              }`}
                            >
                              {getStatusLabel((item as any).status, 'assignat')}
                            </span>
                          )}
                          {item.kind === 'preventiu' && (
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                statusClasses[(item as any).lastStatus || 'pendent'] ||
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {getStatusLabel((item as any).lastStatus, 'pendent')}
                              {typeof (item as any).lastProgress === 'number'
                                ? ` · ${(item as any).lastProgress}%`
                                : ''}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="min-h-[44px] shrink-0 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
                          onClick={() =>
                            item.kind === 'ticket'
                              ? openTicket(
                                  item.id,
                                  (item as any).code,
                                  (item as any).ticketType
                                )
                              : openFitxa(item.id, (item as any).lastRecordId || null)
                          }
                        >
                          {item.kind === 'ticket' ? 'Obrir ticket' : 'Obrir fitxa'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:px-4">
            <div className="w-full max-w-2xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
              <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900 md:text-lg">
                      {selectedTicket.ticketCode || selectedTicket.incidentNumber || 'Ticket'}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {selectedTicket.location || ''}
                      {selectedTicket.machine ? ` · ${selectedTicket.machine}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-lg text-gray-500"
                    onClick={() => setSelectedTicket(null)}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5 md:px-6">
                <div>
                  <div className="text-sm font-medium text-gray-700">Canvi d'estat</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {allowedNext(selectedTicket.status).map((next) => (
                      <button
                        key={next}
                        type="button"
                        onClick={() =>
                          setStatusDraft((prev) => ({
                            ...prev,
                            status: next,
                          }))
                        }
                        className={`min-h-[52px] rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          statusDraft.status === next
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {STATUS_LABELS[next]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
                  <label className="text-sm text-gray-700">
                    {statusDraft.status === 'fet' ||
                    statusDraft.status === 'no_fet' ||
                    statusDraft.status === 'validat'
                      ? 'Hora fi'
                      : 'Hora inici'}
                    <input
                      type="time"
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-base"
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

                  <label className="text-sm text-gray-700">
                    Observacions
                    <textarea
                      className="mt-2 min-h-[140px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
                      rows={5}
                      value={statusDraft.note}
                      onChange={(e) =>
                        setStatusDraft((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end md:px-6">
                <button
                  type="button"
                  className="min-h-[48px] rounded-full border border-slate-200 px-5 text-sm font-medium text-gray-600"
                  onClick={() => setSelectedTicket(null)}
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white"
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
                    handleStatusChange(selectedTicket, statusDraft.status, {
                      startTime:
                        statusDraft.status === 'fet' || statusDraft.status === 'no_fet' || statusDraft.status === 'validat'
                          ? undefined
                          : statusDraft.startTime,
                      endTime:
                        statusDraft.status === 'fet' || statusDraft.status === 'no_fet' || statusDraft.status === 'validat'
                          ? statusDraft.endTime
                          : undefined,
                      note: statusDraft.note,
                    })
                  }}
                >
                  Guardar canvi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
