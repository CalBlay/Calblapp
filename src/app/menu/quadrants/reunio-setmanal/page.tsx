'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import {
  Check,
  ChefHat,
  Clock3,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Mail,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { CorporateFiltersShell } from '@/components/layout/corporate-filters'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import type {
  MeetingCommentDepartment,
  MeetingDepartment,
  MeetingScheduleEntry,
  WeeklyMeetingRow,
} from '@/lib/quadrantsWeeklyMeeting'
import { cn } from '@/lib/utils'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { QUADRANTS_MEETING_MINUTES_PERM } from '@/lib/quadrantsPermissions'
import { Button } from '@/components/ui/button'
import type {
  IncidentMeetingAttendee,
  MeetingAttendance,
} from '@/lib/incidentMeetingSession'

type MeetingResponse = {
  rows: WeeklyMeetingRow[]
  editableCommentDepartment: MeetingCommentDepartment | null
}
type KitchenAttendanceFilter = 'all' | 'required' | 'not-required'

type MeetingSession = {
  id: string
  weekStart: string
  weekEnd: string
  status: 'draft' | 'finalized'
  notes: string
  rows: WeeklyMeetingRow[]
  attendees: IncidentMeetingAttendee[]
  additionalEmails: string[]
  updatedAt: string
  createdByName: string
  finalizedAt: string
  finalizedByName: string
  emailSentAt: string
  emailSentByName: string
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

const compactScheduleEntries = (entries: MeetingScheduleEntry[]) =>
  entries.map((entry) => ({
    ...entry,
    label: /^Inici de l[’']esdeveniment$/iu.test(entry.label.trim())
      ? 'Inici'
      : entry.label,
  }))

function decisionLabel(row: WeeklyMeetingRow, department: MeetingDepartment) {
  const decision = row[department]
  if (!decision.required) return 'NO VA'
  return decision.arrivalTime || 'SÍ · hora pendent'
}

function buildMinutesHtml(session: MeetingSession, fallbackRows: WeeklyMeetingRow[]) {
  const rows = session.rows.length ? session.rows : fallbackRows
  const departmentComment = (row: WeeklyMeetingRow, department: MeetingCommentDepartment) => {
    const stored = row.departmentComments?.[department]
    const text = stored?.saved
      ? stored.text
      : department === 'serveis'
        ? row.meetingComment
        : stored?.text || ''
    return text || ''
  }
  const body = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(format(parseISO(row.eventDay), 'dd/MM/yyyy'))}</strong>${row.eventCode ? `<br><small>Codi: ${escapeHtml(row.eventCode)}</small>` : ''}${row.servicesResponsible ? `<br><strong>${escapeHtml(row.servicesResponsible)}</strong>` : ''}</td>
      <td><strong>${escapeHtml(row.location || 'Ubicació pendent')}</strong>${row.eventName ? `<br><small>${escapeHtml(row.eventName)}</small>` : ''}${row.servicesSetup ? `<br><strong>Muntatge: ${escapeHtml(row.servicesSetup).replaceAll('\n', '<br>Muntatge: ')}</strong>` : ''}${row.servicesTeam ? `<br><small>${escapeHtml(row.servicesTeam).replaceAll('\n', '<br>')}</small>` : ''}</td>
      <td>${escapeHtml(row.pax)}</td>
      <td>${escapeHtml(row.scheduleNotes || row.eventSchedule).replaceAll('\n', '<br>')}</td>
      <td>${escapeHtml(departmentComment(row, 'serveis')).replaceAll('\n', '<br>')}</td>
      <td>${escapeHtml(departmentComment(row, 'logistica')).replaceAll('\n', '<br>')}<hr>${escapeHtml(decisionLabel(row, 'logistica'))}</td>
      <td>${escapeHtml(departmentComment(row, 'cuina')).replaceAll('\n', '<br>')}<hr>${escapeHtml(decisionLabel(row, 'cuina'))}</td>
    </tr>`).join('')
  const attendanceRows = session.attendees.map((attendee) => {
    const attendance = attendee.attendance === 'in_person'
      ? 'Presencial'
      : attendee.attendance === 'online'
        ? 'En línia'
        : attendee.attendance === 'absent'
          ? `Absent${attendee.absenceReason ? ` · ${attendee.absenceReason}` : ''}`
          : 'Presencial'
    return `<tr><td>${escapeHtml(attendee.name)}</td><td>${escapeHtml(attendee.department || '—')}</td><td>${escapeHtml(attendance)}</td></tr>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Acta reunió de quadrants</title>
    <style>
      body{font-family:Arial,sans-serif;color:#172033;padding:24px;font-size:10px}h1{font-size:20px;margin:0 0 5px}p{white-space:pre-wrap}.meta{color:#64748b;margin-bottom:18px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:6px;vertical-align:top}th{background:#111827;color:white;text-align:left}.minutes-grid th:nth-child(1){width:8%}.minutes-grid th:nth-child(2){width:22%}.minutes-grid th:nth-child(3){width:4%}.minutes-grid th:nth-child(4){width:17%}.minutes-grid th:nth-child(5){width:16%}.minutes-grid th:nth-child(6),.minutes-grid th:nth-child(7){width:16.5%}hr{border:0;border-top:1px solid #cbd5e1;margin:7px 0}.notes{margin-top:20px;border:1px solid #cbd5e1;padding:12px}@page{size:A4 landscape;margin:12mm}</style>
    </head><body><h1>Acta de reunió setmanal de quadrants</h1>
    <div class="meta">Període del ${escapeHtml(format(parseISO(session.weekStart), 'dd/MM/yyyy'))} al ${escapeHtml(format(parseISO(session.weekEnd), 'dd/MM/yyyy'))}${session.finalizedByName ? ` · Tancada per ${escapeHtml(session.finalizedByName)}` : ''}</div>
    <table class="minutes-grid"><thead><tr><th>DIA</th><th>LLOC / SERVEIS</th><th>PAX</th><th>HORARI</th><th>OBS. SERVEIS</th><th>LOGÍSTICA</th><th>CUINA</th></tr></thead><tbody>${body}</tbody></table>
    <div class="notes"><strong>Assistència</strong><table><thead><tr><th>Nom</th><th>Departament</th><th>Assistència</th></tr></thead><tbody>${attendanceRows}</tbody></table></div>
    ${session.notes.trim() ? `<div class="notes"><strong>Observacions de l’acta</strong><p>${escapeHtml(session.notes)}</p></div>` : ''}</body></html>`
}

function MeetingAttendeesPanel({
  attendees,
  disabled,
  onChange,
}: {
  attendees: IncidentMeetingAttendee[]
  disabled?: boolean
  onChange: (attendees: IncidentMeetingAttendee[]) => void
}) {
  const patchAttendee = (key: string, patch: Partial<IncidentMeetingAttendee>) => {
    onChange(attendees.map((attendee) => attendee.key === key ? { ...attendee, ...patch } : attendee))
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Assistència i correu</h3>
        <p className="text-xs text-slate-500">Marca com ha assistit cada persona i si ha de rebre l’acta.</p>
      </div>
      <div className="space-y-2">
        {attendees.map((attendee) => (
          <div key={attendee.key} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(160px,1fr)_150px_120px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{attendee.name}</p>
              <p className="truncate text-xs text-slate-500">{attendee.department || 'Sense departament'}</p>
            </div>
            <select
              value={attendee.attendance || 'in_person'}
              disabled={disabled}
              onChange={(event) => patchAttendee(attendee.key, {
                attendance: event.target.value as MeetingAttendance,
                ...(event.target.value !== 'absent' ? { absenceReason: '' } : {}),
              })}
              aria-label={`Assistència de ${attendee.name}`}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-100"
            >
              <option value="in_person">Presencial</option>
              <option value="online">En línia</option>
              <option value="absent">Absent</option>
            </select>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={attendee.receiveEmail !== false}
                disabled={disabled}
                onChange={(event) => patchAttendee(attendee.key, { receiveEmail: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
              />
              Rebre correu
            </label>
            {attendee.attendance === 'absent' ? (
              <input
                value={attendee.absenceReason || ''}
                disabled={disabled}
                onChange={(event) => patchAttendee(attendee.key, { absenceReason: event.target.value })}
                placeholder="Motiu de l’absència"
                aria-label={`Motiu d’absència de ${attendee.name}`}
                className="h-9 rounded-md border border-slate-300 px-3 text-sm sm:col-start-2 sm:col-end-4 disabled:bg-slate-100"
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
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
    <div className="flex w-[88px] shrink-0 flex-col gap-1.5">
      <label className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-bold transition',
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
        {decision.required ? 'Va' : 'No va'}
      </label>
      {decision.required ? (
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Hora
          <input
            type="time"
            aria-label={`Hora d'arribada de ${department}`}
            value={decision.arrivalTime}
            onChange={(event) =>
              onChange({ required: true, arrivalTime: event.target.value })
            }
            className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      ) : null}
      <span className="h-3 text-[10px] text-slate-400">
        {saving ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Desant</span>
        ) : decision.saved ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> Desat</span>
        ) : 'Per defecte'}
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
  const [entries, setEntries] = useState(() => compactScheduleEntries(row.scheduleEntries))

  useEffect(() => {
    setEntries(compactScheduleEntries(row.scheduleEntries))
  }, [row.scheduleEntries])

  const updateEntry = (id: string, patch: Partial<MeetingScheduleEntry>) => {
    setEntries((current) =>
      current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
    )
  }

  return (
    <div
      className="min-w-0 space-y-2"
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
            className="w-[88px] shrink-0 rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
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

function DepartmentCommentCell({
  row,
  department,
  canEdit,
  saving,
  onSave,
}: {
  row: WeeklyMeetingRow
  department: MeetingCommentDepartment
  canEdit: boolean
  saving: boolean
  onSave: (comment: string) => void
}) {
  const storedDepartmentComment = row.departmentComments?.[department]
  const saved = !!(
    storedDepartmentComment?.saved ||
    (department === 'serveis' && row.meetingCommentSaved)
  )
  const storedComment = storedDepartmentComment?.saved
    ? storedDepartmentComment.text
    : department === 'serveis'
      ? row.meetingComment
      : storedDepartmentComment?.text || ''
  const [comment, setComment] = useState(storedComment)

  useEffect(() => {
    setComment(storedComment)
  }, [storedComment])

  return (
    <div className="min-w-0 flex-1">
      <textarea
        aria-label={`Observacions de ${department} per ${row.eventName || row.eventCode || 'l’esdeveniment'}`}
        value={comment}
        readOnly={!canEdit}
        onChange={(event) => {
          if (canEdit) setComment(event.target.value)
        }}
        onBlur={() => {
          if (canEdit && comment !== storedComment) onSave(comment)
        }}
        rows={3}
        maxLength={4000}
        placeholder={canEdit ? 'Observacions del departament…' : ''}
        className={cn(
          'w-full rounded-lg border px-2.5 py-2 text-sm outline-none',
          canEdit
            ? 'resize-none border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
            : 'resize-none border-slate-200 bg-slate-50 text-slate-600'
        )}
      />
      <span className="mt-1 block h-4 text-[11px] text-slate-400">
        {!canEdit ? (
          'Només lectura'
        ) : saving ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Desant comentari</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> Comentari desat</span>
        ) : 'Es desa en sortir del camp'}
      </span>
    </div>
  )
}

export default function QuadrantsWeeklyMeetingPage() {
  const searchParams = useSearchParams()
  const { ready: uiPermsReady, hasAction } = useUiPermissions()
  const canMeetingMinutes =
    uiPermsReady && hasAction(QUADRANTS_MEETING_MINUTES_PERM)
  const requestedStart = String(searchParams?.get('start') || '')
  const requestedEnd = String(searchParams?.get('end') || '')
  const initialWeek = useMemo(
    () => /^\d{4}-\d{2}-\d{2}$/.test(requestedStart)
      ? parseISO(requestedStart)
      : startOfWeek(new Date(), { weekStartsOn: 1 }),
    [requestedStart]
  )
  const [weekStart, setWeekStart] = useState(format(initialWeek, 'yyyy-MM-dd'))
  const [weekEnd, setWeekEnd] = useState(
    /^\d{4}-\d{2}-\d{2}$/.test(requestedEnd)
      ? requestedEnd
      : format(endOfWeek(initialWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  )
  const meetingUrl = `/api/quadrants/meeting?start=${weekStart}&end=${weekEnd}`
  const { data, error, isLoading, mutate } = useSWR<MeetingResponse>(meetingUrl, fetchJson)
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [attendees, setAttendees] = useState<IncidentMeetingAttendee[]>([])
  const [additionalEmailsText, setAdditionalEmailsText] = useState('')
  const [minutesBusy, setMinutesBusy] = useState(false)
  const [minutesSending, setMinutesSending] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState('')
  const [kitchenAttendanceFilter, setKitchenAttendanceFilter] =
    useState<KitchenAttendanceFilter>('all')

  const visibleRows = useMemo(() => {
    const rows = data?.rows || []
    if (kitchenAttendanceFilter === 'all') return rows
    const kitchenIsRequired = kitchenAttendanceFilter === 'required'
    return rows.filter((row) => row.cuina.required === kitchenIsRequired)
  }, [data?.rows, kitchenAttendanceFilter])

  const minutesUrl = canMeetingMinutes
    ? `/api/quadrants/meeting/minutes?weekStart=${weekStart}&weekEnd=${weekEnd}`
    : null
  const { data: minutesData, mutate: mutateMinutes } = useSWR<{
    session: MeetingSession | null
    attendees?: IncidentMeetingAttendee[]
  }>(minutesUrl, fetchJson)
  const { data: historyData, mutate: mutateHistory } = useSWR<{ sessions: MeetingSession[] }>(
    canMeetingMinutes && minutesOpen ? '/api/quadrants/meeting/minutes?history=1' : null,
    fetchJson
  )
  const currentSession = minutesData?.session || null
  const selectedSession = selectedHistoryId
    ? historyData?.sessions.find((item) => item.id === selectedHistoryId) || currentSession
    : currentSession

  useEffect(() => {
    setNotes(currentSession?.notes || '')
    setAttendees(currentSession?.attendees?.length
      ? currentSession.attendees
      : minutesData?.attendees || [])
    setAdditionalEmailsText((currentSession?.additionalEmails || []).join(', '))
    setSelectedHistoryId('')
  }, [currentSession?.id, currentSession?.notes, currentSession?.attendees, currentSession?.additionalEmails, minutesData?.attendees, weekStart, weekEnd])

  useEffect(() => {
    if (!canMeetingMinutes) return
    if (searchParams?.get('acta') === '1' || searchParams?.get('history') === '1') {
      setMinutesOpen(true)
    }
  }, [canMeetingMinutes, searchParams])

  useEffect(() => {
    if (searchParams?.get('history') !== '1' || selectedHistoryId) return
    const latest = historyData?.sessions?.[0]
    if (latest) setSelectedHistoryId(latest.id)
  }, [historyData?.sessions, searchParams, selectedHistoryId])

  const handlePeriodChange = useCallback((filters: SmartFiltersChange) => {
    if (!filters.start || !filters.end) return
    setWeekStart(filters.start)
    setWeekEnd(filters.end)
  }, [])

  const updateDecision = async (
    row: WeeklyMeetingRow,
    department: MeetingDepartment,
    patch: { required: boolean; arrivalTime: string }
  ) => {
    const saveKey = `${row.key}:${department}`
    const previous = data
    setSavingKeys((current) => new Set(current).add(saveKey))
    await mutate(
      (current) => current ? ({
        ...current,
        rows: (current?.rows || []).map((item) =>
          item.key === row.key
            ? { ...item, [department]: { ...patch, saved: true } }
            : item
        ),
      }) : current,
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
      (current) => current ? ({
        ...current,
        rows: (current?.rows || []).map((item) =>
          item.key === row.key
            ? { ...item, scheduleNotes, scheduleEntries, scheduleNotesSaved: true }
            : item
        ),
      }) : current,
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

  const updateMeetingComment = async (
    row: WeeklyMeetingRow,
    department: MeetingCommentDepartment,
    meetingComment: string
  ) => {
    const saveKey = `${row.key}:comment:${department}`
    const previous = data
    const normalizedComment = meetingComment.trim()
    setSavingKeys((current) => new Set(current).add(saveKey))
    await mutate(
      (current) => current ? ({
        ...current,
        rows: (current?.rows || []).map((item) =>
          item.key === row.key
            ? {
                ...item,
                departmentComments: {
                  ...item.departmentComments,
                  [department]: { text: normalizedComment, saved: true },
                },
                ...(department === 'serveis'
                  ? { meetingComment: normalizedComment, meetingCommentSaved: true }
                  : {}),
              }
            : item
        ),
      }) : current,
      false
    )
    try {
      await fetchJson('/api/quadrants/meeting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'comment',
          eventId: row.eventId,
          eventCode: row.eventCode,
          eventDay: row.eventDay,
          commentDepartment: department,
          meetingComment: normalizedComment,
        }),
      })
    } catch (saveError) {
      await mutate(previous, false)
      window.alert(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar el comentari')
    } finally {
      setSavingKeys((current) => {
        const next = new Set(current)
        next.delete(saveKey)
        return next
      })
    }
  }

  const saveMinutes = async (
    action: 'save' | 'finalize' | 'reopen',
    options?: { closeAfter?: boolean }
  ) => {
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
          attendees,
          additionalEmails: additionalEmailsText
            .split(/[;,\n]+/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
          rows: data?.rows || [],
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No s’ha pogut desar l’acta')
      await mutateMinutes({ session: body.session, attendees: body.session?.attendees || attendees }, false)
      setSelectedHistoryId('')
      if (options?.closeAfter) setMinutesOpen(false)
      return true
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar l’acta')
      return false
    } finally {
      setMinutesBusy(false)
    }
  }

  const sendMinutesByEmail = async () => {
    if (!currentSession?.id) return
    setMinutesSending(true)
    try {
      const saved = await saveMinutes('save')
      if (!saved) return
      const response = await fetch('/api/quadrants/meeting/minutes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentSession.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No s’ha pogut enviar l’acta')
      window.alert(`Acta enviada a ${body.recipients || 0} destinataris.`)
      await mutateMinutes()
    } catch (sendError) {
      window.alert(sendError instanceof Error ? sendError.message : 'No s’ha pogut enviar l’acta')
    } finally {
      setMinutesSending(false)
    }
  }

  const deleteSelectedMinutes = async () => {
    if (!selectedSession?.id || minutesBusy) return
    const period = `${format(parseISO(selectedSession.weekStart), 'dd/MM/yyyy')} – ${format(parseISO(selectedSession.weekEnd), 'dd/MM/yyyy')}`
    if (!window.confirm(`Vols eliminar definitivament l’acta del ${period}?`)) return

    setMinutesBusy(true)
    try {
      const response = await fetch('/api/quadrants/meeting/minutes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedSession.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No s’ha pogut eliminar l’acta')
      setSelectedHistoryId('')
      await Promise.all([mutateMinutes(), mutateHistory()])
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'No s’ha pogut eliminar l’acta')
    } finally {
      setMinutesBusy(false)
    }
  }

  const closeMinutes = async () => {
    if (minutesBusy) return
    if (selectedHistoryId || (!currentSession && !notes.trim())) {
      setMinutesOpen(false)
      return
    }
    await saveMinutes('save', { closeAfter: true })
  }

  const printSession = () => {
    const session = selectedHistoryId && selectedSession
      ? selectedSession
      : currentSession?.status === 'finalized'
        ? currentSession
        : {
            id: currentSession?.id || '',
            weekStart,
            weekEnd,
            status: 'draft' as const,
            notes,
            rows: data?.rows || [],
            attendees,
            additionalEmails: additionalEmailsText
              .split(/[;,\n]+/)
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean),
            updatedAt: currentSession?.updatedAt || '',
            createdByName: currentSession?.createdByName || '',
            finalizedAt: '',
            finalizedByName: '',
            emailSentAt: '',
            emailSentByName: '',
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

      <CorporateFiltersShell variant="toolbar">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
          <SmartFilters
            modeDefault="week"
            modeOptions={['week', 'day', 'range']}
            role="Treballador"
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            onChange={handlePeriodChange}
            initialStart={weekStart}
            initialEnd={weekEnd}
            compact
          />
          <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <ChefHat className="h-4 w-4 text-amber-600" />
            <span>Cuina</span>
            <select
              value={kitchenAttendanceFilter}
              onChange={(event) =>
                setKitchenAttendanceFilter(event.target.value as KitchenAttendanceFilter)
              }
              aria-label="Filtrar segons si hi va Cuina"
              className="bg-transparent font-semibold text-slate-900 outline-none"
            >
              <option value="all">Tots</option>
              <option value="required">Va</option>
              <option value="not-required">No va</option>
            </select>
          </label>
          {canMeetingMinutes ? (
            <div className="flex items-center gap-0.5 rounded-xl border border-indigo-200/70 bg-indigo-50/70 p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title={
                  currentSession?.status === 'draft'
                    ? 'Apunts de la reunió'
                    : currentSession?.status === 'finalized'
                      ? 'Tancar acta'
                      : 'Acta de la reunió'
                }
                className="h-8 gap-1.5 whitespace-nowrap px-2 text-slate-700 hover:bg-white hover:text-slate-950"
                onClick={() => setMinutesOpen(true)}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden lg:inline">
                  {currentSession?.status === 'draft'
                    ? 'Apunts'
                    : currentSession?.status === 'finalized'
                      ? 'Tancar acta'
                      : 'Acta'}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Historial d'actes"
                aria-label="Historial d'actes"
                className="h-8 gap-1.5 whitespace-nowrap px-2 text-slate-700 hover:bg-white hover:text-slate-950"
                onClick={() => setMinutesOpen(true)}
              >
                <Clock3 className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden lg:inline">Historial</span>
              </Button>
            </div>
          ) : null}
          </div>
        </div>
      </CorporateFiltersShell>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Graella del període</h2>
            {data?.rows.length ? (
              <span className="text-xs font-medium text-slate-500">
                {visibleRows.length} de {data.rows.length} esdeveniments
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">Tothom pot veure les observacions dels tres departaments; cada departament només pot editar les seves.</p>
        </div>
        {isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregant esdeveniments…</div>
        : error ? <div className="p-8 text-center text-rose-700">{error.message}</div>
        : !data?.rows.length ? <div className="p-12 text-center text-slate-500">No hi ha esdeveniments en aquest període.</div>
        : !visibleRows.length ? <div className="p-12 text-center text-slate-500">No hi ha esdeveniments que coincideixin amb el filtre de Cuina.</div>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-white">
              <tr><th className="w-[8%] p-2.5">Dia</th><th className="w-[21%] p-2.5">Lloc / quadrant de Serveis</th><th className="w-[4%] p-2 text-center">PAX</th><th className="w-[17%] p-2.5">Horari</th><th className="w-[16%] p-2.5">Obs. Serveis</th><th className="w-[17%] p-2.5">Logística</th><th className="w-[17%] p-2.5">Cuina</th></tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.key} className={cn('border-b border-slate-200 align-top', index % 2 ? 'bg-slate-50/60' : 'bg-white')}>
                  <td className="p-3">
                    <strong>{format(parseISO(row.eventDay), 'dd/MM/yyyy')}</strong>
                    {row.eventCode ? <div className="mt-1 font-mono text-xs font-bold text-slate-600">{row.eventCode}</div> : null}
                    {row.servicesResponsible ? <div className="mt-2 font-bold uppercase text-indigo-700">{row.servicesResponsible}</div> : null}
                  </td>
                  <td className="p-3">
                    <div className="text-base font-extrabold uppercase leading-tight text-indigo-800">{row.location || 'Ubicació pendent'}</div>
                    {row.eventName ? <div className="mt-1 font-medium text-slate-600">{row.eventName}</div> : null}
                    {row.servicesSetup ? <div className="mt-2 whitespace-pre-line rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900">Muntatge: {row.servicesSetup}</div> : null}
                    {row.servicesTeam ? <div className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">{row.servicesTeam}</div> : <div className="mt-2 text-xs italic text-slate-400">{row.servicesSetup ? 'Personal de l’esdeveniment pendent' : 'Quadrant de Serveis pendent'}</div>}
                    {row.servicesClosing ? <div className="mt-1 text-xs font-medium text-slate-700">Tancament: {row.servicesClosing}</div> : null}
                  </td>
                  <td className="p-2 text-center font-bold">{row.pax || '—'}</td>
                  <td className="p-2.5"><ScheduleNotesCell row={row} saving={savingKeys.has(`${row.key}:schedule`)} onSave={(entries) => updateScheduleNotes(row, entries)} /></td>
                  <td className="p-2.5">
                    <DepartmentCommentCell
                      row={row}
                      department="serveis"
                      canEdit={data.editableCommentDepartment === 'serveis'}
                      saving={savingKeys.has(`${row.key}:comment:serveis`)}
                      onSave={(comment) => updateMeetingComment(row, 'serveis', comment)}
                    />
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <DepartmentCommentCell
                          row={row}
                          department="logistica"
                          canEdit={data.editableCommentDepartment === 'logistica'}
                          saving={savingKeys.has(`${row.key}:comment:logistica`)}
                          onSave={(comment) => updateMeetingComment(row, 'logistica', comment)}
                        />
                      </div>
                      <div className="border-l border-slate-200 pl-2">
                        <DepartmentDecisionCell row={row} department="logistica" saving={savingKeys.has(`${row.key}:logistica`)} onChange={(patch) => updateDecision(row, 'logistica', patch)} />
                      </div>
                    </div>
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <DepartmentCommentCell
                          row={row}
                          department="cuina"
                          canEdit={data.editableCommentDepartment === 'cuina'}
                          saving={savingKeys.has(`${row.key}:comment:cuina`)}
                          onSave={(comment) => updateMeetingComment(row, 'cuina', comment)}
                        />
                      </div>
                      <div className="border-l border-slate-200 pl-2">
                        <DepartmentDecisionCell row={row} department="cuina" saving={savingKeys.has(`${row.key}:cuina`)} onChange={(patch) => updateDecision(row, 'cuina', patch)} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      {minutesOpen && canMeetingMinutes ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Acta de reunió setmanal">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5"><div><h2 className="text-xl font-bold">{currentSession?.status === 'finalized' ? 'Tancament de reunió' : 'Apunt ràpid'}</h2><p className="text-sm text-slate-500">Del {format(parseISO(weekStart), 'dd/MM/yyyy')} al {format(parseISO(weekEnd), 'dd/MM/yyyy')}</p></div><Button type="button" variant="ghost" size="icon" disabled={minutesBusy} onClick={() => void closeMinutes()} aria-label="Sortir (desa l’acta)" title="Sortir (desa l’acta)" className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></Button></div>
            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="mb-1 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Historial d’actes</label>
                <select value={selectedHistoryId} onChange={(event) => setSelectedHistoryId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Període seleccionat</option>
                  {(historyData?.sessions || []).map((session) => <option key={session.id} value={session.id}>{format(parseISO(session.weekStart), 'dd/MM/yyyy')} – {format(parseISO(session.weekEnd), 'dd/MM/yyyy')} · {session.status === 'finalized' ? 'Finalitzada' : 'Esborrany'}</option>)}
                </select>
              </div>
              {selectedHistoryId && selectedSession ? (
                <div className="space-y-4"><div><div className="mb-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">Acta històrica · {selectedSession.status === 'finalized' ? 'Finalitzada' : 'Esborrany'}</div><div className="min-h-32 whitespace-pre-wrap rounded-xl border border-slate-200 p-3 text-sm">{selectedSession.notes}</div></div>{selectedSession.attendees?.length ? <MeetingAttendeesPanel attendees={selectedSession.attendees} disabled onChange={() => undefined} /> : null}</div>
              ) : (
                <div className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">Anotacions de la reunió</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void saveMinutes('save', { closeAfter: true }) } }} rows={currentSession?.status === 'finalized' ? 7 : 14} placeholder={'• Comentari general\n• Acord\n• Següent pas…'} className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /><span className="mt-2 block text-xs text-slate-400">Ctrl+Enter per desar i tornar al tauler.</span></label>{currentSession?.status === 'finalized' ? <><MeetingAttendeesPanel attendees={attendees} onChange={setAttendees} /><label className="block rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="mb-1 block text-sm font-semibold text-slate-900">Correus addicionals</span><span className="mb-2 block text-xs text-slate-500">Adreces que també rebran l’acta, separades per comes.</span><input type="text" value={additionalEmailsText} onChange={(event) => setAdditionalEmailsText(event.target.value)} placeholder="nom@empresa.com, altre@empresa.com" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label></> : null}</div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                {selectedHistoryId || currentSession?.status === 'finalized' ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={printSession}><Printer className="mr-2 h-4 w-4" /> Vista prèvia / PDF</Button>{selectedHistoryId ? <Button type="button" variant="destructive" disabled={minutesBusy} onClick={() => void deleteSelectedMinutes()}><Trash2 className="mr-2 h-4 w-4" /> {minutesBusy ? 'Eliminant…' : 'Eliminar acta'}</Button> : null}</div> : <span />}
                {!selectedHistoryId ? <div className="flex flex-wrap gap-2">
                  {currentSession?.status === 'finalized' ? <><Button type="button" variant="outline" disabled={minutesBusy || minutesSending} onClick={() => void saveMinutes('reopen')}><RotateCcw className="mr-2 h-4 w-4" /> Reobrir reunió</Button><Button type="button" variant="outline" disabled={minutesBusy || minutesSending} onClick={() => void saveMinutes('save')}><Save className="mr-2 h-4 w-4" /> {minutesBusy ? 'Desant…' : 'Desar'}</Button><Button type="button" disabled={minutesBusy || minutesSending} onClick={() => void sendMinutesByEmail()}><Mail className="mr-2 h-4 w-4" /> {minutesSending ? 'Enviant…' : 'Enviar per correu'}</Button></> : <><Button type="button" variant="outline" disabled={minutesBusy} onClick={() => void saveMinutes('finalize')}>Finalitzar reunió</Button><Button type="button" disabled={minutesBusy} onClick={() => void saveMinutes('save', { closeAfter: true })}><Save className="mr-2 h-4 w-4" /> {minutesBusy ? 'Desant…' : 'Desar i tornar'}</Button></>}
                </div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
