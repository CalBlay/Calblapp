'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Check, Loader2, MessageSquareText, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Incident, type IncidentAction } from '@/hooks/useIncidents'
import { formatDateString } from '@/lib/formatDate'
import { INCIDENT_ORIGIN_DEPARTMENTS } from '@/lib/incidentOriginDepartments'
import { IconActionButton } from '@/lib/iconActionButton'
import { INCIDENT_ACTION_STATUS, type IncidentActionStatus } from '@/lib/incidentPolicy'
import { INCIDENTS_UI_PATH } from '@/lib/incidentsPermissions'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  INCIDENT_MEETING_COMMENT_MAX_LENGTH,
  type IncidentMeetingComment,
  type IncidentMeetingSessionStatus,
} from '@/lib/incidentMeetingSession'

export type IncidentActionRow = IncidentAction & {
  status: IncidentActionStatus
}

const ACTION_STATUS_LABELS: Record<IncidentActionStatus, string> = {
  open: 'Oberta',
  in_progress: 'En curs',
  done: 'Feta',
  cancelled: 'Cancel.lada',
}

const CAP_NONE = '__cap_none__'
const DEPT_NONE = '__dept_none__'

const ctrl =
  'h-8 rounded-md border border-slate-200 bg-white text-slate-800 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:border-amber-300/60 hover:border-slate-300 disabled:opacity-50'

function summarizeLocalActions(actions: IncidentActionRow[]) {
  const openCount = actions.filter((a) => a.status === 'open' || a.status === 'in_progress').length
  return {
    hasActions: actions.length > 0,
    actionsCount: actions.length,
    openActionsCount: openCount,
  }
}

function applyActionPatchLocally(
  action: IncidentActionRow,
  body: Record<string, unknown>
): IncidentActionRow {
  const next = { ...action }

  if (typeof body.title === 'string') next.title = body.title.trim()
  if (typeof body.description === 'string') next.description = body.description.trim()
  if (typeof body.department === 'string') next.department = body.department.trim()
  if (typeof body.assignedToId === 'string') next.assignedToId = body.assignedToId.trim()
  if (typeof body.assignedToName === 'string') next.assignedToName = body.assignedToName.trim()
  if (typeof body.status === 'string') next.status = body.status as IncidentActionStatus

  if (body.dueAt !== undefined) {
    if (body.dueAt === null || body.dueAt === '') next.dueAt = ''
    else if (typeof body.dueAt === 'string') next.dueAt = body.dueAt
  }

  return next
}

function normalizeComparableText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function useCapsForDepartment(department: string | undefined | null) {
  const [caps, setCaps] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const d = (department || '').trim()
    if (!d) {
      setCaps([])
      return
    }
    let cancel = false
    setLoading(true)
    void fetch(`/api/incidents/caps?department=${encodeURIComponent(d)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!cancel) setCaps(Array.isArray(j.caps) ? j.caps : [])
      })
      .catch(() => {
        if (!cancel) setCaps([])
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [department])

  return { caps, loading }
}

function departmentOptionsWithLegacy(current?: string) {
  const s = new Set<string>([...INCIDENT_ORIGIN_DEPARTMENTS])
  const c = (current || '').trim()
  if (c) s.add(c)
  return [...s].sort((a, b) => a.localeCompare(b, 'ca'))
}

function ActionRowStatusSelect({
  value,
  onValueChange,
  disabled = false,
}: {
  value: IncidentActionStatus
  onValueChange: (v: IncidentActionStatus) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as IncidentActionStatus)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(ctrl, 'h-8 w-[7rem] px-2 text-xs font-medium shrink-0')}
        title="Estat accio"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-slate-200 shadow-lg">
        {INCIDENT_ACTION_STATUS.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {ACTION_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function toDateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : ''
}

interface Props {
  incident: Incident
  onIncidentPatch: (id: string, data: Partial<Incident>) => Promise<unknown>
  onIncidentLocalPatch?: (id: string, data: Partial<Incident>) => void
  initialActions?: IncidentActionRow[]
  onIncidentActionsLocalPatch?: (id: string, actions: IncidentActionRow[]) => void
  meetingSessionId?: string | null
  meetingSessionStatus?: IncidentMeetingSessionStatus | null
  initialMeetingComment?: string
  onMeetingCommentSaved?: (incidentId: string, comment: IncidentMeetingComment | null) => void
}

function ActionRowDeptAssignInline({
  action,
  patchAction,
}: {
  action: IncidentActionRow
  patchAction: (actionId: string, body: Record<string, unknown>) => Promise<void>
}) {
  const deptOpts = useMemo(() => departmentOptionsWithLegacy(action.department), [action.department])
  const deptStored = (action.department || '').trim()
  const deptSelectValue = deptStored || DEPT_NONE
  const { caps, loading } = useCapsForDepartment(deptStored || undefined)

  const assigneeSelectItems = useMemo(() => {
    const items: { value: string; label: string; id?: string }[] = [{ value: CAP_NONE, label: '-' }]
    const seen = new Set<string>([CAP_NONE])
    const currentName = (action.assignedToName || '').trim()
    if (currentName && !caps.some((c) => c.name === currentName)) {
      items.push({ value: currentName, label: `${currentName} (fora llistat)` })
      seen.add(currentName)
    }
    for (const c of caps) {
      if (!seen.has(c.name)) {
        items.push({ value: c.name, label: c.name, id: c.id })
        seen.add(c.name)
      }
    }
    return items
  }, [caps, action.assignedToName])

  const assigneeValue = (action.assignedToName || '').trim() || CAP_NONE

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[8rem]">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Departament
        </span>
        <Select
          value={deptOpts.includes(deptStored) ? deptStored : deptSelectValue}
          onValueChange={(v) => {
            const nextDept = v === DEPT_NONE ? '' : v
            const prev = (action.department || '').trim()
            void patchAction(action.id, {
              department: nextDept,
              assignedToName: nextDept === prev ? action.assignedToName : '',
            })
          }}
        >
          <SelectTrigger
            className={cn(ctrl, 'h-8 w-full px-2 text-xs font-medium')}
            title="Departament accio"
          >
            <SelectValue placeholder="Dept" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-200 shadow-lg">
            <SelectItem value={DEPT_NONE}>-</SelectItem>
            {deptOpts.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[11rem]">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Assignat a
        </span>
        <Select
          value={assigneeSelectItems.some((x) => x.value === assigneeValue) ? assigneeValue : CAP_NONE}
          onValueChange={(v) => {
            const selected = assigneeSelectItems.find((item) => item.value === v)
            void patchAction(action.id, {
              assignedToId: v === CAP_NONE ? '' : selected?.id || '',
              assignedToName: v === CAP_NONE ? '' : v,
            })
          }}
          disabled={!deptStored || loading}
        >
          <SelectTrigger
            className={cn(ctrl, 'h-8 w-full px-2 text-xs font-medium')}
            title="Responsable assignat"
          >
            <SelectValue placeholder={loading ? '...' : 'Responsable'} />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-200 shadow-lg">
            {assigneeSelectItems.map((x) => (
              <SelectItem key={x.value} value={x.value}>
                {x.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export default function IncidentOperationsPanel({
  incident,
  onIncidentLocalPatch,
  initialActions,
  onIncidentActionsLocalPatch,
  meetingSessionId,
  meetingSessionStatus,
  initialMeetingComment = '',
  onMeetingCommentSaved,
}: Props) {
  const { data: session } = useSession()
  const sessionUser = session?.user as { name?: string; email?: string; id?: string } | undefined
  const { ready: permsReady, canEditPath } = useUiPermissions()
  const [actions, setActions] = useState<IncidentActionRow[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const [error, setError] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newDue, setNewDue] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [editingDue, setEditingDue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null)
  const [meetingComment, setMeetingComment] = useState(initialMeetingComment)
  const [meetingCommentSaveState, setMeetingCommentSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const meetingCommentRef = useRef(initialMeetingComment)
  const savedMeetingCommentRef = useRef(initialMeetingComment)
  const meetingCommentSaveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const { caps: newFormCaps, loading: newFormCapsLoading } = useCapsForDepartment(
    newDept.trim() || undefined
  )

  const newAssigneeItems = useMemo(() => {
    const items: { value: string; label: string }[] = [{ value: CAP_NONE, label: '-' }]
    const seen = new Set<string>([CAP_NONE])
    for (const c of newFormCaps) {
      if (!seen.has(c.name)) {
        items.push({ value: c.name, label: c.name })
        seen.add(c.name)
      }
    }
    return items
  }, [newFormCaps])

  const loadActions = useCallback(async () => {
    if (!incident?.id) return
    setLoadingActions(true)
    setError('')
    try {
      const res = await fetch(`/api/incidents/actions?incidentId=${encodeURIComponent(incident.id)}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error carregant accions'))
      const nextActions = Array.isArray(json.actions) ? json.actions : []
      setActions(nextActions)
      onIncidentActionsLocalPatch?.(incident.id, nextActions)
      onIncidentLocalPatch?.(incident.id, summarizeLocalActions(nextActions))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error carregant accions')
      setActions([])
    } finally {
      setLoadingActions(false)
    }
  }, [incident?.id, onIncidentActionsLocalPatch, onIncidentLocalPatch])

  useEffect(() => {
    setNewTitle('')
    setNewDescription('')
    setNewAssignee('')
    setNewDept((incident.department || '').trim() || INCIDENT_ORIGIN_DEPARTMENTS[0])
    setNewDue('')
    if (initialActions) {
      setActions(initialActions)
      setLoadingActions(false)
    } else {
      void loadActions()
    }
  }, [incident, initialActions, loadActions])

  const persistMeetingComment = useCallback(
    (value: string) => {
      if (!meetingSessionId || meetingSessionStatus !== 'draft') return Promise.resolve()
      const nextValue = value.slice(0, INCIDENT_MEETING_COMMENT_MAX_LENGTH)
      if (nextValue === savedMeetingCommentRef.current) return Promise.resolve()

      setMeetingCommentSaveState('saving')
      const operation = meetingCommentSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (nextValue === savedMeetingCommentRef.current) return
          const response = await fetch('/api/incidents/meeting-minutes/comments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: meetingSessionId,
              incidentId: incident.id,
              text: nextValue,
            }),
          })
          const json = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(String(json?.error || 'No s’ha pogut desar el comentari'))
          savedMeetingCommentRef.current = nextValue
          onMeetingCommentSaved?.(incident.id, json.comment || null)
        })
        .then(() => {
          setMeetingCommentSaveState(
            meetingCommentRef.current === savedMeetingCommentRef.current ? 'saved' : 'idle'
          )
        })
        .catch(() => setMeetingCommentSaveState('error'))

      meetingCommentSaveQueueRef.current = operation
      return operation
    },
    [incident.id, meetingSessionId, meetingSessionStatus, onMeetingCommentSaved]
  )

  useEffect(() => {
    if (!meetingSessionId || meetingSessionStatus !== 'draft') return
    if (meetingComment === savedMeetingCommentRef.current) return
    const timer = window.setTimeout(() => {
      void persistMeetingComment(meetingComment)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [meetingComment, meetingSessionId, meetingSessionStatus, persistMeetingComment])

  useEffect(() => {
    setNewAssignee('')
  }, [newDept])

  const createAction = async () => {
    if (!incident?.id || !newTitle.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/incidents/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: incident.id,
          title: newTitle.trim(),
          description: newDescription.trim(),
          assignedToId:
            newAssignee && newAssignee !== CAP_NONE
              ? newFormCaps.find((c) => c.name === newAssignee)?.id || ''
              : '',
          assignedToName: newAssignee && newAssignee !== CAP_NONE ? newAssignee : '',
          department: newDept.trim(),
          dueAt: newDue ? `${newDue}T12:00:00` : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant accio'))
      const createdAction = json?.action as IncidentActionRow | undefined
      setNewTitle('')
      setNewDescription('')
      setNewAssignee('')
      setNewDept((incident.department || '').trim() || INCIDENT_ORIGIN_DEPARTMENTS[0])
      setNewDue('')
      if (createdAction) {
        const nextActions = [...actions, createdAction].sort((a, b) =>
          (a.createdAt || '').localeCompare(b.createdAt || '')
        )
        setActions(nextActions)
        onIncidentActionsLocalPatch?.(incident.id, nextActions)
        onIncidentLocalPatch?.(incident.id, summarizeLocalActions(nextActions))
      } else {
        await loadActions()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant accio')
    } finally {
      setCreating(false)
    }
  }

  const patchAction = useCallback(async (actionId: string, body: Record<string, unknown>) => {
    setError('')
    const previousActions = actions
    const optimisticActions = previousActions
      .map((action) => (action.id === actionId ? applyActionPatchLocally(action, body) : action))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

    setActions(optimisticActions)
    onIncidentActionsLocalPatch?.(incident.id, optimisticActions)
    onIncidentLocalPatch?.(incident.id, summarizeLocalActions(optimisticActions))

    try {
      const res = await fetch(`/api/incidents/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant accio'))
      const updatedAction = json?.action as IncidentActionRow | undefined
      if (updatedAction) {
        const nextActions = actions
          .map((action) => (action.id === actionId ? updatedAction : action))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        setActions(nextActions)
        onIncidentActionsLocalPatch?.(incident.id, nextActions)
        onIncidentLocalPatch?.(incident.id, summarizeLocalActions(nextActions))
      } else {
        await loadActions()
      }
    } catch (e) {
      setActions(previousActions)
      onIncidentActionsLocalPatch?.(incident.id, previousActions)
      onIncidentLocalPatch?.(incident.id, summarizeLocalActions(previousActions))
      setError(e instanceof Error ? e.message : 'Error actualitzant accio')
    }
  }, [actions, incident.id, loadActions, onIncidentActionsLocalPatch, onIncidentLocalPatch])

  const beginEditAction = useCallback((action: IncidentActionRow) => {
    setEditingActionId(action.id)
    setEditingTitle(action.title || '')
    setEditingDescription(action.description || '')
    setEditingDue(toDateInputValue(action.dueAt))
  }, [])

  const cancelEditAction = useCallback(() => {
    setEditingActionId(null)
    setEditingTitle('')
    setEditingDescription('')
    setEditingDue('')
    setSavingEdit(false)
  }, [])

  const saveEditedAction = useCallback(async () => {
    if (!editingActionId || !editingTitle.trim()) return
    setSavingEdit(true)
    try {
      await patchAction(editingActionId, {
        title: editingTitle.trim(),
        description: editingDescription.trim(),
        dueAt: editingDue ? `${editingDue}T12:00:00` : null,
      })
      cancelEditAction()
    } catch {
      setSavingEdit(false)
    }
  }, [cancelEditAction, editingActionId, editingDescription, editingDue, editingTitle, patchAction])

  const deleteAction = useCallback(
    async (action: IncidentActionRow) => {
      if (!incident?.id) return
      const confirmed = window.confirm(
        `Vols eliminar l'accio "${action.title || 'sense titol'}"? Aquesta accio no es pot desfer.`
      )
      if (!confirmed) return

      const previousActions = actions
      const nextActions = previousActions.filter((row) => row.id !== action.id)
      setDeletingActionId(action.id)
      setError('')
      setActions(nextActions)
      onIncidentActionsLocalPatch?.(incident.id, nextActions)
      onIncidentLocalPatch?.(incident.id, summarizeLocalActions(nextActions))

      try {
        const res = await fetch(`/api/incidents/actions/${action.id}`, {
          method: 'DELETE',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || 'Error eliminant accio'))
        if (editingActionId === action.id) cancelEditAction()
      } catch (e) {
        setActions(previousActions)
        onIncidentActionsLocalPatch?.(incident.id, previousActions)
        onIncidentLocalPatch?.(incident.id, summarizeLocalActions(previousActions))
        setError(e instanceof Error ? e.message : 'Error eliminant accio')
      } finally {
        setDeletingActionId(null)
      }
    },
    [actions, cancelEditAction, editingActionId, incident?.id, onIncidentActionsLocalPatch, onIncidentLocalPatch]
  )

  const openActionsCount = useMemo(
    () => actions.filter((a) => a.status === 'open' || a.status === 'in_progress').length,
    [actions]
  )

  const canEditIncidentsModule = !permsReady || canEditPath(INCIDENTS_UI_PATH)

  const canChangeActionStatus = useCallback(
    (action: IncidentActionRow) => {
      if (canEditIncidentsModule) return true
      const assignedNorm = normalizeComparableText(action.assignedToName)
      if (!assignedNorm) return false
      const userCandidates = [
        normalizeComparableText(sessionUser?.name),
        normalizeComparableText(sessionUser?.email),
      ].filter(Boolean)
      return userCandidates.includes(assignedNorm)
    },
    [canEditIncidentsModule, sessionUser?.email, sessionUser?.name]
  )

  return (
    <div className={cn('space-y-2', typography('bodySm'))} onClick={(e) => e.stopPropagation()}>
      {error ? (
        <div
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {meetingSessionId ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MessageSquareText className="h-4 w-4 text-sky-700" aria-hidden />
                Comentari de la reunió
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Aquest text queda vinculat a l’acta; la descripció original no es modifica.
              </p>
            </div>
            <span className="flex min-h-5 items-center gap-1 text-xs text-slate-500" aria-live="polite">
              {meetingSessionStatus === 'finalized' ? 'Acta finalitzada' : null}
              {meetingSessionStatus === 'draft' && meetingCommentSaveState === 'saving' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Desant…</>
              ) : null}
              {meetingSessionStatus === 'draft' && meetingCommentSaveState === 'saved' ? (
                <><Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Desat</>
              ) : null}
              {meetingSessionStatus === 'draft' && meetingCommentSaveState === 'error' ? (
                <span className="text-red-700">Error en desar; torna-ho a provar</span>
              ) : null}
            </span>
          </div>
          <Textarea
            value={meetingComment}
            onChange={(event) => {
              const value = event.target.value
              meetingCommentRef.current = value
              setMeetingComment(value)
              setMeetingCommentSaveState('idle')
            }}
            onBlur={() => void persistMeetingComment(meetingCommentRef.current)}
            maxLength={INCIDENT_MEETING_COMMENT_MAX_LENGTH}
            rows={5}
            readOnly={meetingSessionStatus !== 'draft'}
            placeholder="Escriu aquí el que es comenta i s’acorda durant la reunió…"
            aria-label="Comentari de la reunió per a aquesta incidència"
            className="min-h-32 resize-y border-sky-200 bg-white text-sm leading-6 shadow-sm focus-visible:ring-sky-400/40 read-only:bg-slate-50"
          />
        </section>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <section className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Accions creades</h4>
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
              {actions.length} total
            </span>
          </div>

          {loadingActions ? <p className="text-xs text-slate-400">Carregant accions...</p> : null}

          {!loadingActions && actions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              Encara no hi ha cap accio creada.
            </div>
          ) : null}

          {!loadingActions && actions.length > 0 ? (
            <ul className="space-y-2">
              {actions.map((a) => (
                <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  {editingActionId === a.id ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_180px_130px_minmax(260px,340px)] xl:items-end">
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Titol</div>
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className={cn(ctrl, 'w-full bg-white px-2')}
                            aria-label="Editar titol accio"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Data limit</div>
                          <Input
                            type="date"
                            value={editingDue}
                            onChange={(e) => setEditingDue(e.target.value)}
                            className="bg-white text-slate-700"
                            aria-label="Editar data limit accio"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estat</div>
                          <ActionRowStatusSelect
                            value={a.status}
                            disabled={!canChangeActionStatus(a)}
                            onValueChange={(v) => void patchAction(a.id, { status: v })}
                          />
                        </div>
                        <div>
                          <ActionRowDeptAssignInline action={a} patchAction={patchAction} />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Descripcio</div>
                        <textarea
                          rows={4}
                          value={editingDescription}
                          onChange={(e) => setEditingDescription(e.target.value)}
                          className={cn(
                            'w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:border-amber-300/60'
                          )}
                          aria-label="Editar descripcio accio"
                        />
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={cancelEditAction}>
                          Cancel.lar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300"
                          disabled={savingEdit || !editingTitle.trim()}
                          onClick={() => void saveEditedAction()}
                        >
                          {savingEdit ? 'Guardant...' : 'Guardar canvis'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_150px_130px_minmax(260px,340px)_auto] xl:items-end">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                        {a.description ? (
                          <p className="mt-1 truncate text-xs leading-relaxed text-slate-500" title={a.description}>
                            {a.description}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">Sense descripcio</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Data limit</div>
                        {a.dueAt ? (
                          <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-600">
                            {formatDateString(a.dueAt) ?? a.dueAt.slice(0, 10)}
                          </span>
                        ) : (
                          <span className="inline-flex h-8 items-center text-xs text-slate-400">Sense data</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estat</div>
                        <ActionRowStatusSelect
                          value={a.status}
                          disabled={!canChangeActionStatus(a)}
                          onValueChange={(v) => void patchAction(a.id, { status: v })}
                        />
                      </div>
                      <div>
                        <ActionRowDeptAssignInline action={a} patchAction={patchAction} />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 xl:pb-0.5">
                        <IconActionButton
                          icon={Pencil}
                          label="Editar accio"
                          onClick={() => beginEditAction(a)}
                        />
                        <IconActionButton
                          icon={Trash2}
                          label={deletingActionId === a.id ? 'Eliminant accio' : 'Eliminar accio'}
                          tone="danger"
                          disabled={deletingActionId === a.id}
                          onClick={() => void deleteAction(a)}
                        />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-3 rounded-[24px] border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <div className="mb-4 border-b border-amber-100 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-base font-semibold text-amber-900">Nova accio</div>
              <div className="text-sm font-medium text-slate-500">
                {actions.length} {actions.length === 1 ? 'accio creada' : 'accions creades'}
                {openActionsCount > 0 ? ` · ${openActionsCount} pendent${openActionsCount === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_320px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_180px_180px_170px]">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Titol</div>
                  <Input
                    aria-label="Titol nova accio"
                    placeholder="Titol de l'accio *"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className={cn(ctrl, 'w-full bg-white px-2')}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Departament</div>
                  <Select value={newDept} onValueChange={setNewDept}>
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder="Dept" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-slate-200 shadow-lg">
                      {INCIDENT_ORIGIN_DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Assignat a</div>
                  <Select
                    value={newAssignee || CAP_NONE}
                    onValueChange={(v) => setNewAssignee(v === CAP_NONE ? '' : v)}
                    disabled={!newDept.trim() || newFormCapsLoading}
                  >
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder={newFormCapsLoading ? '...' : 'Responsable'} />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-slate-200 shadow-lg">
                      {newAssigneeItems.map((x) => (
                        <SelectItem key={x.value} value={x.value}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Data limit</div>
                  <Input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className="bg-white text-slate-700"
                    title="Termini"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Descripcio</div>
                <textarea
                  rows={5}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Descriu que s'ha de fer"
                  className={cn(
                    'min-h-[148px] w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:border-amber-300/60'
                  )}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[20px] bg-white/85 p-4">
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => void createAction()}
                  disabled={creating || !newTitle.trim()}
                  className="w-full bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300"
                >
                  {creating ? 'Creant...' : 'Afegir accio'}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
