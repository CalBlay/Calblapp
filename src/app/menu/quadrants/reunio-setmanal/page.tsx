'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { addWeeks, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import type {
  MeetingDepartment,
  MeetingScheduleEntry,
  WeeklyMeetingRow,
} from '@/lib/quadrantsWeeklyMeeting'
import { cn } from '@/lib/utils'

type MeetingResponse = { rows: WeeklyMeetingRow[] }
type MeetingSession = {
  id: string
  weekStart: string
  weekEnd: string
  status: 'draft' | 'finalized'
  notes: string
  rows: WeeklyMeetingRow[]
  updatedAt: string
  createdByName: string
  finalizedAt: string
  finalizedByName: string
}

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init || { cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body as T
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

function decisionLabel(row: WeeklyMeetingRow, department: MeetingDepartment) {
  const decision = row[department]
  if (!decision.required) return 'NO VA'
  return decision.arrivalTime || 'SÍ · hora pendent'
}

function buildMinutesHtml(session: MeetingSession, fallbackRows: WeeklyMeetingRow[]) {
  const rows = session.rows.length ? session.rows : fallbackRows
  const body = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(format(parseISO(row.eventDay), 'dd/MM/yyyy'))}</strong>${row.eventCode ? `<br><small>Codi: ${escapeHtml(row.eventCode)}</small>` : ''}${row.servicesResponsible ? `<br><strong>${escapeHtml(row.servicesResponsible)}</strong>` : ''}</td>
      <td><strong>${escapeHtml(row.location || 'Ubicació pendent')}</strong>${row.eventName ? `<br><small>${escapeHtml(row.eventName)}</small>` : ''}${row.servicesTeam ? `<br><small>${escapeHtml(row.servicesTeam).replaceAll('\n', '<br>')}</small>` : ''}</td>
      <td>${escapeHtml(row.pax)}</td>
      <td>${escapeHtml(row.scheduleNotes || row.eventSchedule).replaceAll('\n', '<br>')}</td>
      <td>${escapeHtml(decisionLabel(row, 'logistica'))}</td>
      <td>${escapeHtml(decisionLabel(row, 'cuina'))}</td>
    </tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Acta reunió de quadrants</title>
    <style>
      body{font-family:Arial,sans-serif;color:#172033;padding:24px;font-size:11px}h1{font-size:20px;margin:0 0 5px}p{white-space:pre-wrap}.meta{color:#64748b;margin-bottom:18px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:7px;vertical-align:top}th{background:#111827;color:white;text-align:left}th:nth-child(1){width:14%}th:nth-child(2){width:38%}th:nth-child(3){width:8%}th:nth-child(4){width:12%}th:nth-child(5),th:nth-child(6){width:14%}.notes{margin-top:20px;border:1px solid #cbd5e1;padding:12px}@page{size:A4 landscape;margin:12mm}</style>
    </head><body><h1>Acta de reunió setmanal de quadrants</h1>
    <div class="meta">Setmana del ${escapeHtml(format(parseISO(session.weekStart), 'dd/MM/yyyy'))} al ${escapeHtml(format(parseISO(session.weekEnd), 'dd/MM/yyyy'))}${session.finalizedByName ? ` · Tancada per ${escapeHtml(session.finalizedByName)}` : ''}</div>
    <table><thead><tr><th>DIA</th><th>LLOC / SERVEIS</th><th>PAX</th><th>HORARI</th><th>LOGÍSTICA</th><th>CUINA</th></tr></thead><tbody>${body}</tbody></table>
    <div class="notes"><strong>Observacions de l’acta</strong><p>${escapeHtml(session.notes) || 'Sense observacions.'}</p></div></body></html>`
}

function DepartmentDecisionCell({
  row,
  department,
  saving,
  onChange,
}: {
  row: WeeklyMeetingRow
  department: MeetingDepartment
  saving: boolean
  onChange: (patch: { required: boolean; arrivalTime: string }) => void
}) {
  const decision = row[department]
  return (
    <div className="flex min-w-[145px] flex-col gap-2">
      <label className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition',
        decision.required
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-rose-300 bg-rose-50 text-rose-700'
      )}>
        <input
          type="checkbox"
          checked={decision.required}
          onChange={(event) => onChange({
            required: event.target.checked,
            arrivalTime: decision.arrivalTime,
          })}
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
        />
        {decision.required ? 'Sí, va' : 'No va'}
      </label>
      {decision.required ? (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Hora
          <input
            type="time"
            value={decision.arrivalTime}
            onChange={(event) =>
              onChange({ required: true, arrivalTime: event.target.value })
            }
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      ) : (
        <span className="rounded-lg bg-rose-50 px-2 py-1.5 text-center text-xs font-bold text-rose-700">
          NO VA
        </span>
      )}
      <span className="h-4 text-[11px] text-slate-400">
        {saving ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Desant</span>
        ) : decision.saved ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> Desat</span>
        ) : 'Valor per defecte'}
      </span>
    </div>
  )
}

function ScheduleNotesCell({
  row,
  saving,
  onSave,
}: {
  row: WeeklyMeetingRow
  saving: boolean
  onSave: (entries: MeetingScheduleEntry[]) => void
}) {
  const [entries, setEntries] = useState(row.scheduleEntries)

  useEffect(() => {
    setEntries(row.scheduleEntries)
  }, [row.scheduleEntries])

  const updateEntry = (id: string, patch: Partial<MeetingScheduleEntry>) => {
    setEntries((current) =>
      current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
    )
  }

  return (
    <div
      className="min-w-[245px] space-y-2"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) onSave(entries)
      }}
    >
      {entries.map((entry, index) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <input
            type="time"
            aria-label={`Hora del servei ${index + 1}`}
            value={entry.time}
            onChange={(event) => updateEntry(entry.id, { time: event.target.value })}
            className="w-[92px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <input
            type="text"
            aria-label={`Nom del servei ${index + 1}`}
            value={entry.label}
            onChange={(event) => updateEntry(entry.id, { label: event.target.value })}
            placeholder="Nom del servei"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            aria-label={`Eliminar servei ${index + 1}`}
            disabled={entries.length === 1}
            onClick={() => {
              const next = entries.filter((item) => item.id !== entry.id)
              setEntries(next)
              onSave(next)
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const next = [
            ...entries,
            { id: `schedule-${Date.now()}`, time: '', label: '' },
          ]
          setEntries(next)
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
      >
        <Plus className="h-3.5 w-3.5" /> Afegir servei
      </button>
      <span className="mt-1 block h-4 text-[11px] text-slate-400">
        {saving ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Desant escaleta</span>
        ) : row.scheduleNotesSaved ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> Escaleta desada</span>
        ) : 'Editable · es desa en sortir del camp'}
      </span>
    </div>
  )
}

export default function QuadrantsWeeklyMeetingPage() {
  const initialWeek = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const [weekStart, setWeekStart] = useState(format(initialWeek, 'yyyy-MM-dd'))
  const weekEnd = format(endOfWeek(parseISO(weekStart), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const meetingUrl = `/api/quadrants/meeting?start=${weekStart}&end=${weekEnd}`
  const { data, error, isLoading, mutate } = useSWR<MeetingResponse>(meetingUrl, fetchJson)
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [minutesBusy, setMinutesBusy] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState('')

  const minutesUrl = minutesOpen
    ? `/api/quadrants/meeting/minutes?weekStart=${weekStart}&weekEnd=${weekEnd}`
    : null
  const { data: minutesData, mutate: mutateMinutes } = useSWR<{ session: MeetingSession | null }>(minutesUrl, fetchJson)
  const { data: historyData } = useSWR<{ sessions: MeetingSession[] }>(
    minutesOpen ? '/api/quadrants/meeting/minutes?history=1' : null,
    fetchJson
  )
  const currentSession = minutesData?.session || null
  const selectedSession = selectedHistoryId
    ? historyData?.sessions.find((item) => item.id === selectedHistoryId) || currentSession
    : currentSession

  useEffect(() => {
    setNotes(currentSession?.notes || '')
    setSelectedHistoryId('')
  }, [currentSession?.id, currentSession?.notes, weekStart])

  const changeWeek = (amount: number) => {
    setWeekStart(format(addWeeks(parseISO(weekStart), amount), 'yyyy-MM-dd'))
  }

  const updateDecision = async (
    row: WeeklyMeetingRow,
    department: MeetingDepartment,
    patch: { required: boolean; arrivalTime: string }
  ) => {
    const saveKey = `${row.key}:${department}`
    const previous = data
    setSavingKeys((current) => new Set(current).add(saveKey))
    await mutate(
      (current) => ({
        rows: (current?.rows || []).map((item) =>
          item.key === row.key
            ? { ...item, [department]: { ...patch, saved: true } }
            : item
        ),
      }),
      false
    )
    try {
      await fetchJson('/api/quadrants/meeting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: row.eventId,
          eventCode: row.eventCode,
          eventDay: row.eventDay,
          department,
          ...patch,
        }),
      })
    } catch (saveError) {
      await mutate(previous, false)
      window.alert(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar')
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current)
        next.delete(saveKey)
        return next
      })
    }
  }

  const updateScheduleNotes = async (row: WeeklyMeetingRow, scheduleEntries: MeetingScheduleEntry[]) => {
    const saveKey = `${row.key}:schedule`
    const previous = data
    const scheduleNotes = scheduleEntries
      .map((entry) => [entry.time, entry.label.trim()].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n')
    setSavingKeys((current) => new Set(current).add(saveKey))
    await mutate(
      (current) => ({
        rows: (current?.rows || []).map((item) =>
          item.key === row.key
            ? { ...item, scheduleNotes, scheduleEntries, scheduleNotesSaved: true }
            : item
        ),
      }),
      false
    )
    try {
      await fetchJson('/api/quadrants/meeting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'schedule',
          eventId: row.eventId,
          eventCode: row.eventCode,
          eventDay: row.eventDay,
          scheduleEntries,
        }),
      })
    } catch (saveError) {
      await mutate(previous, false)
      window.alert(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar l’escaleta')
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current)
        next.delete(saveKey)
        return next
      })
    }
  }

  const saveMinutes = async (action: 'save' | 'finalize' | 'reopen') => {
    setMinutesBusy(true)
    try {
      const response = await fetch('/api/quadrants/meeting/minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          action,
          notes,
          rows: data?.rows || [],
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No s’ha pogut desar l’acta')
      await mutateMinutes({ session: body.session }, false)
      setSelectedHistoryId('')
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar l’acta')
    } finally {
      setMinutesBusy(false)
    }
  }

  const printSession = () => {
    const session = selectedSession || {
      id: '', weekStart, weekEnd, status: 'draft' as const, notes,
      rows: data?.rows || [], updatedAt: '', createdByName: '', finalizedAt: '', finalizedByName: '',
    }
    printBrandedHtmlInNewWindow(buildMinutesHtml(session, data?.rows || []))
  }

  return (
    <main className="flex w-full max-w-none flex-col gap-4 p-4 pb-12">
      <ModuleHeader
        icon={<ClipboardList className="h-7 w-7 text-indigo-600" />}
        title="Quadrants"
        subtitle="Reunió setmanal de Serveis, Logística i Cuina"
        actions={<Link href="/menu/quadrants" className="font-medium hover:underline">Tauler de treball</Link>}
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeWeek(-1)} aria-label="Setmana anterior" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(format(startOfWeek(parseISO(event.target.value), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}
              className="bg-transparent outline-none"
            />
          </label>
          <button type="button" onClick={() => changeWeek(1)} aria-label="Setmana següent" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
          <span className="text-sm text-slate-500">fins al {format(parseISO(weekEnd), 'dd/MM/yyyy')}</span>
        </div>
        <button type="button" onClick={() => setMinutesOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <FileText className="h-4 w-4" /> Acta de la reunió
        </button>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Graella setmanal</h2>
          <p className="text-sm text-slate-500">Serveis és informatiu. Només s’editen les decisions de Logística i Cuina.</p>
        </div>
        {isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregant esdeveniments…</div>
        : error ? <div className="p-8 text-center text-rose-700">{error.message}</div>
        : !data?.rows.length ? <div className="p-12 text-center text-slate-500">No hi ha esdeveniments aquesta setmana.</div>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-white">
              <tr><th className="w-[13%] p-3">Dia</th><th className="w-[35%] p-3">Lloc / quadrant de Serveis</th><th className="w-[8%] p-3 text-center">PAX</th><th className="w-[12%] p-3">Horari</th><th className="w-[16%] p-3">Logística</th><th className="w-[16%] p-3">Cuina</th></tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.key} className={cn('border-b border-slate-200 align-top', index % 2 ? 'bg-slate-50/60' : 'bg-white')}>
                  <td className="p-3">
                    <strong>{format(parseISO(row.eventDay), 'dd/MM/yyyy')}</strong>
                    {row.eventCode ? <div className="mt-1 font-mono text-xs font-bold text-slate-600">{row.eventCode}</div> : null}
                    {row.servicesResponsible ? <div className="mt-2 font-bold uppercase text-indigo-700">{row.servicesResponsible}</div> : null}
                  </td>
                  <td className="p-3">
                    <div className="text-base font-extrabold uppercase leading-tight text-indigo-800">{row.location || 'Ubicació pendent'}</div>
                    {row.eventName ? <div className="mt-1 font-medium text-slate-600">{row.eventName}</div> : null}
                    {row.servicesTeam ? <div className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">{row.servicesTeam}</div> : <div className="mt-2 text-xs italic text-slate-400">Quadrant de Serveis pendent</div>}
                    {row.servicesClosing ? <div className="mt-1 text-xs font-medium text-slate-700">Tancament: {row.servicesClosing}</div> : null}
                  </td>
                  <td className="p-3 text-center font-bold">{row.pax || '—'}</td>
                  <td className="p-3"><ScheduleNotesCell row={row} saving={savingKeys.has(`${row.key}:schedule`)} onSave={(entries) => updateScheduleNotes(row, entries)} /></td>
                  <td className="p-3"><DepartmentDecisionCell row={row} department="logistica" saving={savingKeys.has(`${row.key}:logistica`)} onChange={(patch) => updateDecision(row, 'logistica', patch)} /></td>
                  <td className="p-3"><DepartmentDecisionCell row={row} department="cuina" saving={savingKeys.has(`${row.key}:cuina`)} onChange={(patch) => updateDecision(row, 'cuina', patch)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      {minutesOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Acta de reunió setmanal">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 className="text-xl font-bold">Acta de reunió setmanal</h2><p className="text-sm text-slate-500">Del {format(parseISO(weekStart), 'dd/MM/yyyy')} al {format(parseISO(weekEnd), 'dd/MM/yyyy')}</p></div><button type="button" onClick={() => setMinutesOpen(false)} aria-label="Tancar" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="mb-1 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Historial d’actes</label>
                <select value={selectedHistoryId} onChange={(event) => setSelectedHistoryId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Setmana seleccionada</option>
                  {(historyData?.sessions || []).map((session) => <option key={session.id} value={session.id}>{format(parseISO(session.weekStart), 'dd/MM/yyyy')} – {format(parseISO(session.weekEnd), 'dd/MM/yyyy')} · {session.status === 'finalized' ? 'Finalitzada' : 'Esborrany'}</option>)}
                </select>
              </div>
              {selectedHistoryId && selectedSession ? (
                <div><div className="mb-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">Acta històrica · {selectedSession.status === 'finalized' ? 'Finalitzada' : 'Esborrany'}</div><div className="min-h-32 whitespace-pre-wrap rounded-xl border border-slate-200 p-3 text-sm">{selectedSession.notes || 'Sense observacions.'}</div></div>
              ) : (
                <label className="block"><span className="mb-2 block text-sm font-semibold">Observacions i acords</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={8} disabled={currentSession?.status === 'finalized'} placeholder="Anoteu aquí els acords generals de la reunió…" className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" /></label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <button type="button" onClick={printSession} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Printer className="h-4 w-4" /> Document imprimible</button>
                {!selectedHistoryId ? <div className="flex flex-wrap gap-2">
                  {currentSession?.status === 'finalized' ? <button type="button" disabled={minutesBusy} onClick={() => saveMinutes('reopen')} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">Reobrir acta</button> : <><button type="button" disabled={minutesBusy} onClick={() => saveMinutes('save')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Desar esborrany</button><button type="button" disabled={minutesBusy} onClick={() => saveMinutes('finalize')} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Finalitzar acta</button></>}
                </div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
