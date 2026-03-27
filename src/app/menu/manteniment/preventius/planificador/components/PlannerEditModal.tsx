'use client'

import React, { useEffect, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ca } from 'date-fns/locale'
import { CalendarDays, Trash2 } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { PlannerDraft, ScheduledItem } from '../types'

type Props = {
  draft: PlannerDraft
  days: Date[]
  dayCount: number
  machines: Array<{ code: string; name: string; label: string }>
  getWorkerConflicts: (
    dayIndex: number,
    start: string,
    end: string,
    workers: string[],
    ignoreId?: string
  ) => string[]
  availableWorkers: (
    dayIndex: number,
    start: string,
    end: string,
    ignoreId?: string
  ) => Array<{ id: string; name: string }>
  minutesFromTime: (time: string) => number
  timeFromMinutes: (total: number) => string
  setDraft: React.Dispatch<React.SetStateAction<PlannerDraft | null>>
  setIsModalOpen: (open: boolean) => void
  setScheduledItems: React.Dispatch<React.SetStateAction<ScheduledItem[]>>
  resolveWorkerIds: (names: string[]) => string[]
  weekStart: Date
  persistTicketPlanning: (item: ScheduledItem) => Promise<void>
  loadWeekSchedule: () => Promise<void>
  onUnplanPreventiu: (plannedId: string, templateId?: string | null) => Promise<void>
  onUnplanTicket: (ticketId: string, scheduledId?: string) => Promise<boolean>
}

export default function PlannerEditModal({
  draft,
  days,
  dayCount,
  machines,
  getWorkerConflicts,
  availableWorkers,
  minutesFromTime,
  timeFromMinutes,
  setDraft,
  setIsModalOpen,
  setScheduledItems,
  resolveWorkerIds,
  weekStart,
  persistTicketPlanning,
  loadWeekSchedule,
  onUnplanPreventiu,
  onUnplanTicket,
}: Props) {
  const [dateOpen, setDateOpen] = useState(false)
  const [externalizeBusy, setExternalizeBusy] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [supplierSubject, setSupplierSubject] = useState('')
  const [supplierMessage, setSupplierMessage] = useState('')
  const [isValidatedTicket, setIsValidatedTicket] = useState(false)
  const [latestExternalSummary, setLatestExternalSummary] = useState<{
    supplierName?: string
    supplierEmail?: string
    at?: number | string | null
    reference?: string | null
  } | null>(null)
  const conflicts = getWorkerConflicts(draft.dayIndex, draft.start, draft.end, draft.workers, draft.id)
  const selectedDay = addDays(weekStart, draft.dayIndex)
  const createdAtLabel =
    draft.createdAt != null && !Number.isNaN(new Date(draft.createdAt).getTime())
      ? format(new Date(draft.createdAt), 'dd/MM')
      : '-'

  useEffect(() => {
    if (draft.kind !== 'ticket' || !draft.ticketId) {
      setSupplierName('')
      setSupplierEmail('')
      setExternalReference('')
      setSupplierSubject('')
      setSupplierMessage('')
      setIsValidatedTicket(false)
      setLatestExternalSummary(null)
      return
    }

    let cancelled = false
    const loadTicket = async () => {
      try {
        const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(draft.ticketId || '')}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json()
        const ticket = json?.ticket
        if (!ticket || cancelled) return
        const code = String(ticket.ticketCode || ticket.incidentNumber || draft.ticketId || 'TIC').trim()
        const location = String(ticket.location || draft.location || '').trim()
        const description = String(ticket.description || '').trim()
        const machine = String(ticket.machine || draft.machine || '').trim()
        const history = Array.isArray(ticket.externalizationHistory)
          ? [...ticket.externalizationHistory].sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0))
          : []
        const latest = history.length > 0 ? history[history.length - 1] : null

        setSupplierName(String(ticket.supplierName || '').trim())
        setSupplierEmail(String(ticket.supplierEmail || '').trim())
        setExternalReference(String(ticket.externalReference || '').trim())
        setSupplierSubject(
          location ? `Ticket manteniment ${code} - ${location}` : `Ticket manteniment ${code}`
        )
        setSupplierMessage(
          [
            'Bon dia,',
            '',
            'Us fem arribar aquesta incidencia per a la seva revisio.',
            '',
            `Ticket: ${code}`,
            location ? `Ubicacio: ${location}` : '',
            machine ? `Maquinaria: ${machine}` : '',
            description ? `Descripcio: ${description}` : '',
            '',
            'Si us plau, confirmeu recepcio i disponibilitat.',
            '',
            'Gracies.',
          ]
            .filter(Boolean)
            .join('\n')
        )
        setIsValidatedTicket(['validat', 'resolut'].includes(String(ticket.status || '').trim().toLowerCase()))
        setLatestExternalSummary(
          latest
            ? {
                supplierName: latest.supplierName || ticket.supplierName || '',
                supplierEmail: latest.supplierEmail || ticket.supplierEmail || '',
                at: latest.at || ticket.externalSentAt || null,
                reference: latest.reference || ticket.externalReference || null,
              }
            : ticket.externalized
              ? {
                  supplierName: ticket.supplierName || '',
                  supplierEmail: ticket.supplierEmail || '',
                  at: ticket.externalSentAt || null,
                  reference: ticket.externalReference || null,
                }
              : null
        )
      } catch {
        return
      }
    }

    void loadTicket()
    return () => {
      cancelled = true
    }
  }, [draft.kind, draft.ticketId, draft.location, draft.machine])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-4xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900">{draft.title || 'Nova tasca'}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">Creat: {createdAtLabel}</span>
                {draft.location ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1">Ubicació: {draft.location}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm text-gray-500"
              onClick={() => setIsModalOpen(false)}
            >
              Tancar
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-5 md:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Planificació
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">Data</span>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full justify-between rounded-2xl px-4 text-base font-normal"
                    >
                      <span className="truncate">{format(selectedDay, 'd MMM yyyy', { locale: ca })}</span>
                      <CalendarDays className="h-4 w-4 text-gray-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <Calendar
                      mode="single"
                      selected={selectedDay}
                      onSelect={(date) => {
                        if (!date) return
                        const nextIndex = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
                        if (nextIndex < 0 || nextIndex >= dayCount) return
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                dayIndex: nextIndex,
                              }
                            : current
                        )
                        setDateOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">Hora inici</span>
                <input
                  type="time"
                  className="h-12 rounded-2xl border px-4 text-base"
                  value={draft.start}
                  onChange={(e) => {
                    const start = e.target.value
                    const end = timeFromMinutes(minutesFromTime(start) + draft.duration)
                    setDraft((current) => (current ? { ...current, start, end } : current))
                  }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">Durada (min)</span>
                <input
                  type="number"
                  className="h-12 rounded-2xl border px-4 text-base"
                  value={draft.duration}
                  onChange={(e) => {
                    const duration = Math.max(15, Number(e.target.value) || 0)
                    const end = timeFromMinutes(minutesFromTime(draft.start) + duration)
                    setDraft((current) => (current ? { ...current, duration, end } : current))
                  }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">Hora fi</span>
                <input
                  type="time"
                  className="h-12 rounded-2xl border px-4 text-base"
                  value={draft.end}
                  onChange={(e) => {
                    const end = e.target.value
                    const duration = minutesFromTime(end) - minutesFromTime(draft.start)
                    setDraft((current) =>
                      current ? { ...current, end, duration: Math.max(15, duration) } : current
                    )
                  }}
                />
              </label>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignació
              </div>
              <div className="flex flex-wrap gap-3">
                {availableWorkers(draft.dayIndex, draft.start, draft.end, draft.id).map((op) => {
                  const checked = draft.workers.includes(op.name)
                  return (
                    <label
                      key={op.id}
                      className="flex min-h-[44px] items-center gap-3 rounded-full border px-4 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setDraft((current) => {
                            if (!current) return current
                            if (checked) {
                              const nextWorkers = current.workers.filter((worker) => worker !== op.name)
                              return {
                                ...current,
                                workers: nextWorkers,
                                workersCount: Math.max(1, nextWorkers.length),
                              }
                            }
                            const nextWorkers = [...current.workers, op.name]
                            return {
                              ...current,
                              workers: nextWorkers,
                              workersCount: Math.max(1, nextWorkers.length),
                            }
                          })
                        }}
                      />
                      {op.name}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Classificació
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Urgència</span>
                  <select
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              priority: e.target.value as 'urgent' | 'alta' | 'normal' | 'baixa',
                            }
                          : current
                      )
                    }
                  >
                    <option value="urgent">Urgent</option>
                    <option value="alta">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </label>

                {draft.kind === 'ticket' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">Maquinària</span>
                    <select
                      className="h-12 rounded-2xl border px-4 text-base"
                      value={draft.machine}
                      onChange={(e) =>
                        setDraft((current) => (current ? { ...current, machine: e.target.value } : current))
                      }
                    >
                      <option value="">Selecciona maquinària</option>
                      {machines.map((machine) => (
                        <option key={`${machine.code}-${machine.name}`} value={machine.label}>
                          {machine.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          </div>

          {draft.kind === 'ticket' && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Proveidor
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Envia aquest ticket per correu i el deixa en espera.
                  </div>
                </div>
                {isValidatedTicket && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    Reobrir abans d externalitzar
                  </span>
                )}
              </div>

              {latestExternalSummary && (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
                  <div className="font-semibold text-slate-800">
                    Ultim enviament: {latestExternalSummary.supplierName || 'Proveidor'}
                  </div>
                  <div className="mt-1">
                    {latestExternalSummary.supplierEmail || 'Sense email'}
                    {latestExternalSummary.at ? ` · ${createdAtLabel === '-' ? '' : ''}` : ''}
                    {latestExternalSummary.at ? format(new Date(latestExternalSummary.at), 'dd/MM/yyyy HH:mm') : ''}
                  </div>
                  {latestExternalSummary.reference ? (
                    <div className="mt-1">Referencia: {latestExternalSummary.reference}</div>
                  ) : null}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Nom proveidor</span>
                  <input
                    type="text"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={supplierName}
                    disabled={externalizeBusy || isValidatedTicket}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Email proveidor</span>
                  <input
                    type="email"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={supplierEmail}
                    disabled={externalizeBusy || isValidatedTicket}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Referencia externa</span>
                  <input
                    type="text"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={externalReference}
                    disabled={externalizeBusy || isValidatedTicket}
                    onChange={(e) => setExternalReference(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Assumpte</span>
                  <input
                    type="text"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={supplierSubject}
                    disabled={externalizeBusy || isValidatedTicket}
                    onChange={(e) => setSupplierSubject(e.target.value)}
                  />
                </label>
              </div>

              <label className="mt-3 flex flex-col gap-1">
                <span className="text-xs text-gray-600">Missatge</span>
                <textarea
                  className="min-h-[140px] rounded-2xl border px-4 py-3 text-base"
                  value={supplierMessage}
                  disabled={externalizeBusy || isValidatedTicket}
                  onChange={(e) => setSupplierMessage(e.target.value)}
                />
              </label>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="min-h-[44px] rounded-full bg-slate-900 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={externalizeBusy || isValidatedTicket || !draft.ticketId}
                  onClick={async () => {
                    if (!draft.ticketId) return
                    try {
                      setExternalizeBusy(true)
                      const res = await fetch(
                        `/api/maintenance/tickets/${encodeURIComponent(draft.ticketId)}/externalize`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            supplierName: supplierName.trim(),
                            supplierEmail: supplierEmail.trim(),
                            subject: supplierSubject.trim(),
                            message: supplierMessage.trim(),
                            externalReference: externalReference.trim() || null,
                          }),
                        }
                      )
                      const json = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
                      if (json?.ticket) {
                        const nextTicket = json.ticket
                        setLatestExternalSummary({
                          supplierName: nextTicket.supplierName || supplierName.trim(),
                          supplierEmail: nextTicket.supplierEmail || supplierEmail.trim(),
                          at: nextTicket.externalSentAt || Date.now(),
                          reference: nextTicket.externalReference || externalReference.trim() || null,
                        })
                      }
                      await loadWeekSchedule()
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'No s ha pogut enviar'
                      alert(message)
                    } finally {
                      setExternalizeBusy(false)
                    }
                  }}
                >
                  {externalizeBusy
                    ? 'Enviant...'
                    : latestExternalSummary
                      ? 'Reenviar a proveidor'
                      : 'Enviar a proveidor'}
                </button>
              </div>
            </div>
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="mx-5 mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 md:mx-6">
            Atenció: aquests operaris ja tenen una tasca en aquesta franja: {conflicts.join(', ')}
          </div>
        )}

        <div className="sticky bottom-0 mt-4 flex items-center justify-between rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 md:px-6">
          {draft.id ? (
            <button
              type="button"
              title="Eliminar"
              aria-label="Eliminar"
              className="rounded-full border border-red-300 p-3 text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (!draft.id) return
                if (draft.kind === 'preventiu') {
                  setScheduledItems((prev) => prev.filter((item) => item.id !== draft.id))
                  setIsModalOpen(false)
                  await onUnplanPreventiu(draft.id, draft.templateId)
                  return
                }

                const ticketId = draft.ticketId || draft.id
                if (!ticketId) return
                try {
                  setScheduledItems((prev) => prev.filter((item) => item.id !== draft.id))
                  const ok = await onUnplanTicket(ticketId, draft.id)
                  if (!ok) {
                    await loadWeekSchedule()
                    return
                  }
                } catch {
                  await loadWeekSchedule()
                }
                setIsModalOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="min-h-[48px] rounded-full border px-5 text-sm text-gray-600"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel·lar
            </button>
            <button
              type="button"
              className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white"
              onClick={async () => {
                if (!draft.start || !draft.end) return
                if (draft.kind === 'ticket') {
                  const ticketId = draft.ticketId || draft.id
                  if (!ticketId) {
                    alert('Arrossega un ticket des de la columna lateral.')
                    return
                  }
                  const nextItem: ScheduledItem = {
                    id: ticketId,
                    kind: 'ticket',
                    ticketId,
                    title: draft.title,
                    createdAt: draft.createdAt || null,
                    workers: draft.workers,
                    workersCount: Math.max(1, draft.workers.length || 1),
                    dayIndex: draft.dayIndex,
                    start: draft.start,
                    end: draft.end,
                    minutes: draft.duration,
                    priority: draft.priority,
                    location: draft.location,
                    machine: draft.machine,
                    templateId: null,
                  }
                  setScheduledItems((prev) => {
                    const next = prev.filter((item) => item.id !== ticketId)
                    return [...next, nextItem]
                  })
                  await persistTicketPlanning(nextItem)
                  setIsModalOpen(false)
                  await loadWeekSchedule()
                  return
                }

                if (!draft.title) {
                  alert('Omple el títol del preventiu.')
                  return
                }

                const dateStr = format(addDays(weekStart, draft.dayIndex), 'yyyy-MM-dd')
                const workerNames = draft.workers || []
                const workerIds = resolveWorkerIds(workerNames)
                const payload = {
                  templateId: draft.templateId || null,
                  title: draft.title,
                  date: dateStr,
                  startTime: draft.start,
                  endTime: draft.end,
                  priority: draft.priority,
                  location: draft.location || '',
                  workerNames,
                  workerIds,
                }

                try {
                  if (draft.id) {
                    await fetch(`/api/maintenance/preventius/planned/${draft.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                  } else {
                    const res = await fetch('/api/maintenance/preventius/planned', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    if (!res.ok) throw new Error('create_failed')
                    const json = await res.json().catch(() => null)
                    const newId = json?.id ? String(json.id) : null
                    if (newId) {
                      setScheduledItems((prev) => [
                        ...prev,
                        {
                          id: newId,
                          kind: 'preventiu',
                          templateId: payload.templateId,
                          ticketId: null,
                          title: payload.title,
                          workers: workerNames,
                          workersCount: Math.max(1, workerNames.length || 1),
                          dayIndex: draft.dayIndex,
                          start: payload.startTime,
                          end: payload.endTime,
                          minutes: draft.duration,
                          priority: draft.priority,
                          location: payload.location,
                        } as ScheduledItem,
                      ])
                    }
                  }
                } catch {
                  alert('No s’ha pogut guardar el preventiu.')
                }
                setIsModalOpen(false)
                await loadWeekSchedule()
              }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
