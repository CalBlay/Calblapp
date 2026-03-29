'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { typography } from '@/lib/typography'
import { formatDateOnly, formatDateTimeValue } from '@/lib/date-format'
import type { PlannerDraft, ScheduledItem } from '../types'

type Props = {
  draft: PlannerDraft
  days: Date[]
  dayCount: number
  machines: Array<{ code: string; name: string; label: string }>
  users: Array<{ id: string; name: string; department?: string }>
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

function summaryCard(label: string, value: string, accent = false) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        accent ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/70'
      }`}
    >
      <div className={typography('eyebrow')}>{label}</div>
      <div className="mt-1 text-base font-medium text-slate-900">{value || '-'}</div>
    </div>
  )
}

type PreventiuHistoryRecord = {
  id: string
  status?: string
  completedAt?: string | number | null
  updatedAt?: string | number | null
  updatedByName?: string
  createdByName?: string
  notes?: string
}

const normalizePreventiuStatus = (value?: string) => {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'assignat' || v === 'pendent') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'validat' || v === 'resolut') return 'validat'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  return 'assignat'
}

const statusLabel = (value?: string) => {
  const status = normalizePreventiuStatus(value)
  if (status === 'en_curs') return 'En curs'
  if (status === 'espera') return 'Espera'
  if (status === 'fet') return 'Fet'
  if (status === 'validat') return 'Validat'
  if (status === 'no_fet') return 'No fet'
  return 'Assignat'
}

export default function PlannerEditModal({
  draft,
  days,
  dayCount,
  machines,
  users,
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
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availableIds, setAvailableIds] = useState<string[]>([])
  const [infoOpen, setInfoOpen] = useState(true)
  const [jobDetailsOpen, setJobDetailsOpen] = useState(true)
  const [planningOpen, setPlanningOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<PreventiuHistoryRecord[]>([])
  const availabilityCacheRef = useRef<Map<string, string[]>>(new Map())

  const selectedDay = addDays(weekStart, draft.dayIndex)
  const createdAtLabel =
    draft.createdAt != null && !Number.isNaN(new Date(draft.createdAt).getTime())
      ? formatDateOnly(draft.createdAt, '-')
      : '-'
  const planningLabel = [format(selectedDay, 'dd/MM/yyyy'), draft.start, draft.end].filter(Boolean).join(' - ')
  const conflicts = getWorkerConflicts(draft.dayIndex, draft.start, draft.end, draft.workers, draft.id)
  const isAssignedStage = Boolean(draft.id || draft.workers.length > 0)
  const currentStatus = normalizePreventiuStatus(draft.status)
  const isReadOnlyStage = ['en_curs', 'espera', 'fet', 'validat'].includes(currentStatus)
  const showPlanningAction = !isReadOnlyStage
  const planningSectionTitle = showPlanningAction ? 'Planificar i assignar' : 'Planificacio'
  const progressLabel =
    typeof draft.progress === 'number' && Number.isFinite(draft.progress) ? `${draft.progress}%` : ''

  const operatorPool = useMemo(() => {
    const maintenanceUsers = users
      .filter((user) => String(user.department || '').toLowerCase().includes('manten'))
      .map((user) => ({ id: String(user.id), name: String(user.name || '').trim() }))
      .filter((user) => user.id && user.name)
    const list =
      maintenanceUsers.length > 0
        ? maintenanceUsers
        : users
            .map((user) => ({ id: String(user.id), name: String(user.name || '').trim() }))
            .filter((user) => user.id && user.name)
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const machineOptions = useMemo(
    () =>
      Array.from(new Set(machines.map((machine) => String(machine.label || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [machines]
  )

  const locallyAvailableIds = useMemo(
    () =>
      new Set(
        availableWorkers(draft.dayIndex, draft.start, draft.end, draft.id).map((worker) => String(worker.id))
      ),
    [availableWorkers, draft.dayIndex, draft.end, draft.id, draft.start]
  )

  const remotelyAvailableIds = useMemo(() => new Set(availableIds.map(String)), [availableIds])

  const selectableOperators = useMemo(
    () =>
      operatorPool.map((operator) => {
        const checked = draft.workers.includes(operator.name)
        const availableLocal = locallyAvailableIds.has(operator.id)
        const availableRemote = remotelyAvailableIds.has(operator.id)
        const available = checked || (availableLocal && availableRemote)
        return { ...operator, checked, available }
      }),
    [draft.workers, locallyAvailableIds, operatorPool, remotelyAvailableIds]
  )

  const loadAvailability = async () => {
    const dateStr = format(selectedDay, 'yyyy-MM-dd')
    const availabilityKey = [dateStr, draft.start, draft.end, draft.id || 'new'].join('|')
    const cached = availabilityCacheRef.current.get(availabilityKey)
    if (cached) {
      setAvailableIds(cached)
      return cached
    }

    try {
      setAvailabilityLoading(true)
      const params = new URLSearchParams({
        department: 'manteniment',
        startDate: dateStr,
        endDate: dateStr,
        startTime: draft.start,
        endTime: draft.end,
      })
      if (draft.id) params.set('excludeMaintenancePlannedId', draft.id)
      const res = await fetch(`/api/personnel/available?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        setAvailableIds([])
        return []
      }
      const json = await res.json()
      const list = Array.isArray(json?.treballadors) ? json.treballadors : []
      const nextIds = list.map((person: { id?: string }) => String(person?.id || '')).filter(Boolean)
      availabilityCacheRef.current.set(availabilityKey, nextIds)
      setAvailableIds(nextIds)
      return nextIds
    } finally {
      setAvailabilityLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAvailability()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft.dayIndex, draft.end, draft.id, draft.start, selectedDay])

  useEffect(() => {
    let cancelled = false
    const loadHistory = async () => {
      if (!draft.templateId) {
        setHistoryRecords([])
        return
      }
      try {
        setHistoryLoading(true)
        const res = await fetch(
          `/api/maintenance/preventius/completed?templateId=${encodeURIComponent(draft.templateId)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          if (!cancelled) setHistoryRecords([])
          return
        }
        const json = await res.json()
        const records = Array.isArray(json?.records) ? json.records : []
        if (!cancelled) {
          setHistoryRecords(records.slice(0, 8))
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [draft.templateId])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
      <div className="w-full max-w-4xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className={typography('pageTitle')}>{draft.title || 'Nou preventiu'}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">Preventiu</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Creat: {createdAtLabel}</span>
                {draft.location ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1">Ubicacio: {draft.location}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm text-slate-600"
              onClick={() => setIsModalOpen(false)}
            >
              Tancar
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-5 md:px-6">
          <section className="space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setInfoOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Informacio del preventiu</div>
              {infoOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
            </button>

            {infoOpen ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {summaryCard('Planificacio', planningLabel, true)}
                {summaryCard('Operaris', draft.workers.length ? draft.workers.join(', ') : 'Sense assignar')}
                {summaryCard(
                  'Estat',
                  [statusLabel(currentStatus), progressLabel].filter(Boolean).join(' · ') || statusLabel(currentStatus)
                )}
              </div>
            ) : null}
          </section>

          <section className="mt-4 space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setJobDetailsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Dades de la feina</div>
              {jobDetailsOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
            </button>

            {jobDetailsOpen ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {summaryCard('Ubicacio', draft.location || 'Sense ubicacio')}
                {summaryCard('Maquinaria', draft.machine || 'Sense maquinaria')}
                {summaryCard('Tipus', 'Preventiu')}
              </div>
            ) : null}
          </section>

          <section className="mt-4 space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setPlanningOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <div className={typography('sectionTitle')}>{planningSectionTitle}</div>
              </div>
              {planningOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
            </button>

            {planningOpen ? (
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {format(selectedDay, 'dd/MM/yyyy')}
                  </span>
                  {availabilityLoading ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      Comprovant disponibilitat...
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      Nomes disponibles
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-2xl bg-slate-50/70 p-3">
                    <div className={typography('eyebrow')}>Franja de treball</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr]">
                      <label className="text-sm text-slate-700">
                        <div className={typography('eyebrow')}>Data</div>
                        <input
                          type="date"
                          className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                          value={format(selectedDay, 'yyyy-MM-dd')}
                          disabled={isReadOnlyStage}
                          onChange={(e) => {
                            const value = e.target.value
                            if (!value) return
                            const date = new Date(`${value}T00:00:00`)
                            if (Number.isNaN(date.getTime())) return
                            const nextIndex = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
                            if (nextIndex < 0 || nextIndex >= dayCount) return
                            setDraft((current) => (current ? { ...current, dayIndex: nextIndex } : current))
                          }}
                        />
                      </label>

                      <label className="text-sm text-slate-700">
                        <div className={typography('eyebrow')}>Hora</div>
                        <input
                          type="time"
                          className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                          value={draft.start}
                          disabled={isReadOnlyStage}
                          onChange={(e) => {
                            const start = e.target.value
                            const end = timeFromMinutes(minutesFromTime(start) + draft.duration)
                            setDraft((current) => (current ? { ...current, start, end } : current))
                          }}
                        />
                      </label>

                      <label className="text-sm text-slate-700">
                        <div className={typography('eyebrow')}>Hora fi</div>
                        <input
                          type="time"
                          className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                          value={draft.end}
                          disabled={isReadOnlyStage}
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
                  </section>

                  <section className="rounded-2xl bg-slate-50/70 p-3">
                    <div className={typography('eyebrow')}>Dades de la feina</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-[0.8fr_1.2fr]">
                      <label className="text-sm text-slate-700">
                        <div className={typography('eyebrow')}>Urgencia</div>
                        <select
                          className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                          value={draft.priority}
                          disabled={isReadOnlyStage}
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

                      {machineOptions.length > 0 ? (
                        <label className="text-sm text-slate-700">
                          <div className={typography('eyebrow')}>Maquinaria</div>
                          <select
                            className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
                            value={draft.machine}
                            disabled={isReadOnlyStage}
                            onChange={(e) =>
                              setDraft((current) => (current ? { ...current, machine: e.target.value } : current))
                            }
                          >
                            <option value="">Sense maquinaria</option>
                            {machineOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div />
                      )}
                    </div>
                  </section>
                </div>

                <section className="mt-4 rounded-2xl border-t border-slate-200 pt-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_auto_1fr] md:items-center">
                    <div className="flex items-center gap-3">
                      <div className={typography('eyebrow')}>Operaris disponibles</div>
                      <div className="text-xs text-slate-500">
                        Seleccionats {draft.workers.length}/{Math.max(1, draft.workersCount)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:justify-self-start">
                      <span className="text-xs text-slate-500">Treballadors</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="h-8 w-14 rounded-xl border bg-white px-2.5 text-center text-sm text-slate-700"
                        value={draft.workersCount}
                        disabled={isReadOnlyStage}
                        onChange={(e) =>
                          setDraft((current) =>
                            current ? { ...current, workersCount: Math.max(1, Number(e.target.value || 1)) } : current
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="flex items-center gap-2 md:justify-self-start">
                      <span className="text-xs text-slate-500">Durada</span>
                      <input
                        type="time"
                        step={60}
                        className="h-8 w-24 rounded-xl border bg-white px-2.5 text-center text-sm text-slate-700"
                        value={timeFromMinutes(draft.duration)}
                        disabled={isReadOnlyStage}
                        onChange={(e) => {
                          const duration = Math.max(15, minutesFromTime(e.target.value || '00:15'))
                          const end = timeFromMinutes(minutesFromTime(draft.start) + duration)
                          setDraft((current) => (current ? { ...current, duration, end } : current))
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {selectableOperators.map((operator) => (
                      <label
                        key={operator.id}
                        className={`flex min-h-[40px] items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm ${
                          operator.checked
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                            : operator.available
                              ? 'border-slate-200 bg-slate-50 text-slate-800'
                              : 'border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={operator.checked}
                          disabled={isReadOnlyStage || (!operator.available && !operator.checked)}
                          onChange={() => {
                            setDraft((current) => {
                              if (!current) return current
                              if (operator.checked) {
                                const nextWorkers = current.workers.filter((worker) => worker !== operator.name)
                                return {
                                  ...current,
                                  workers: nextWorkers,
                                  workersCount: Math.max(1, current.workersCount),
                                }
                              }

                              const nextWorkers = [...current.workers]
                              if (nextWorkers.length >= Math.max(1, current.workersCount)) {
                                if (current.workersCount === 1) {
                                  nextWorkers.splice(0, nextWorkers.length)
                                } else {
                                  return current
                                }
                              }
                              nextWorkers.push(operator.name)
                              return {
                                ...current,
                                workers: nextWorkers,
                                workersCount: Math.max(1, current.workersCount),
                              }
                            })
                          }}
                        />
                        <span>{operator.name}</span>
                        {!operator.available && !operator.checked ? (
                          <span className="text-[11px] text-slate-400">Ocupat</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </section>

          <section className="mt-4 space-y-4 rounded-2xl border p-4">
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className={typography('sectionTitle')}>Historial</div>
              {historyOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
            </button>

            {historyOpen ? (
              <div className="space-y-2 rounded-2xl border p-4">
                {draft.createdAt ? (
                  <div className="text-sm text-slate-600">
                    Planificat - {formatDateTimeValue(draft.createdAt)}{draft.location ? ` - ${draft.location}` : ''}
                  </div>
                ) : null}

                {historyLoading ? (
                  <div className="text-sm text-slate-500">Carregant historial...</div>
                ) : historyRecords.length > 0 ? (
                  historyRecords.map((record) => (
                    <div key={record.id} className="text-sm text-slate-600">
                      {String(record.status || 'Assignat')} -{' '}
                      {formatDateTimeValue(record.completedAt || record.updatedAt)} -{' '}
                      {record.updatedByName || record.createdByName || ''}
                      {record.notes ? ` - ${record.notes}` : ''}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400">Sense historial.</div>
                )}
              </div>
            ) : null}
          </section>
        </div>

        {conflicts.length > 0 ? (
          <div className="mx-5 mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 md:mx-6">
            Aquests operaris ja tenen una altra tasca en aquesta franja: {conflicts.join(', ')}
          </div>
        ) : null}

        <div className="sticky bottom-0 mt-4 flex items-center justify-between rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 md:px-6">
          {draft.id ? (
            <button
              type="button"
              title="Eliminar"
              aria-label="Eliminar"
              className="rounded-full border border-red-300 p-3 text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (!draft.id) return
                setScheduledItems((prev) => prev.filter((item) => item.id !== draft.id))
                setIsModalOpen(false)
                await onUnplanPreventiu(draft.id, draft.templateId)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {showPlanningAction ? (
              <button
                type="button"
                className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white"
                onClick={async () => {
                if (!draft.start || !draft.end) return
                const latestAvailableIds = await loadAvailability()
                const selectedIds = resolveWorkerIds(draft.workers)
                const unavailableSelected = selectedIds.filter((id) => !latestAvailableIds.includes(id))
                if (unavailableSelected.length > 0) {
                  alert('Hi ha operaris seleccionats que ja no estan disponibles en aquesta franja.')
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
                          machine: draft.machine,
                        } as ScheduledItem,
                      ])
                    }
                  }
                } catch {
                  alert('No s ha pogut guardar el preventiu.')
                }
                setIsModalOpen(false)
                await loadWeekSchedule()
              }}
              >
                {isAssignedStage ? 'Reassignar' : 'Assignar'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

