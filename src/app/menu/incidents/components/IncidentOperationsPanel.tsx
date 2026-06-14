'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Incident } from '@/hooks/useIncidents'
import { INCIDENT_ORIGIN_DEPARTMENTS } from '@/lib/incidentOriginDepartments'
import { INCIDENT_ACTION_STATUS, type IncidentActionStatus } from '@/lib/incidentPolicy'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

export type IncidentActionRow = {
  id: string
  title: string
  description: string
  status: IncidentActionStatus
  assignedToName: string
  department: string
  dueAt: string
  createdAt: string
  closedAt: string
  closedByName: string
}

const STATUS_LABELS: Record<string, string> = {
  obert: 'Obert',
  en_curs: 'En curs',
  resolt: 'Resolt',
  tancat: 'Tancat',
}

const ACTION_STATUS_LABELS: Record<IncidentActionStatus, string> = {
  open: 'Oberta',
  in_progress: 'En curs',
  done: 'Feta',
  cancelled: 'Cancel·lada',
}

const CAP_NONE = '__cap_none__'
const DEPT_NONE = '__dept_none__'

const ctrl =
  'h-8 rounded-md border border-slate-200 bg-white text-slate-800 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:border-amber-300/60 hover:border-slate-300 disabled:opacity-50'

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

function IncidentWorkflowStatusSelect({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id="incident-status"
        className={cn(ctrl, 'w-[8.5rem] px-2 font-medium')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-slate-200 shadow-lg">
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ActionRowStatusSelect({
  value,
  onValueChange,
}: {
  value: IncidentActionStatus
  onValueChange: (v: IncidentActionStatus) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as IncidentActionStatus)}>
      <SelectTrigger
        className={cn(ctrl, 'h-8 w-[6.5rem] px-2 text-xs font-medium shrink-0')}
        title="Estat acció"
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

interface Props {
  incident: Incident
  onIncidentPatch: (id: string, data: Partial<Incident>) => Promise<unknown>
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
    const items: { value: string; label: string }[] = [{ value: CAP_NONE, label: '—' }]
    const seen = new Set<string>([CAP_NONE])
    const currentName = (action.assignedToName || '').trim()
    if (currentName && !caps.some((c) => c.name === currentName)) {
      items.push({ value: currentName, label: `${currentName} (fora llistat)` })
      seen.add(currentName)
    }
    for (const c of caps) {
      if (!seen.has(c.name)) {
        items.push({ value: c.name, label: c.name })
        seen.add(c.name)
      }
    }
    return items
  }, [caps, action.assignedToName])

  const assigneeValue = (action.assignedToName || '').trim() || CAP_NONE

  return (
    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
          className={cn(ctrl, 'h-8 w-[7.25rem] px-2 text-xs font-medium')}
          title="Departament acció"
        >
          <SelectValue placeholder="Dept" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-slate-200 shadow-lg">
          <SelectItem value={DEPT_NONE}>—</SelectItem>
          {deptOpts.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={assigneeSelectItems.some((x) => x.value === assigneeValue) ? assigneeValue : CAP_NONE}
        onValueChange={(v) =>
          void patchAction(action.id, { assignedToName: v === CAP_NONE ? '' : v })
        }
        disabled={!deptStored || loading}
      >
        <SelectTrigger
          className={cn(ctrl, 'h-8 w-[9.5rem] px-2 text-xs font-medium')}
          title="Cap assignat"
        >
          <SelectValue placeholder={loading ? '…' : 'Cap'} />
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
  )
}

export default function IncidentOperationsPanel({ incident, onIncidentPatch }: Props) {
  const [actions, setActions] = useState<IncidentActionRow[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const [status, setStatus] = useState('obert')
  const [resolutionNote, setResolutionNote] = useState('')
  const [savingIncident, setSavingIncident] = useState(false)
  const [error, setError] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newDue, setNewDue] = useState('')
  const [creating, setCreating] = useState(false)

  const { caps: newFormCaps, loading: newFormCapsLoading } = useCapsForDepartment(
    newDept.trim() || undefined
  )

  const newAssigneeItems = useMemo(() => {
    const items: { value: string; label: string }[] = [{ value: CAP_NONE, label: '—' }]
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
      setActions(Array.isArray(json.actions) ? json.actions : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error carregant accions')
      setActions([])
    } finally {
      setLoadingActions(false)
    }
  }, [incident?.id])

  useEffect(() => {
    const raw = (incident.status || 'obert')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
    const allowed = ['obert', 'en_curs', 'resolt', 'tancat'] as const
    setStatus((allowed as readonly string[]).includes(raw) ? raw : 'obert')
    setResolutionNote(incident.resolutionNote || '')
    setNewTitle('')
    setNewDescription('')
    setNewAssignee('')
    setNewDept((incident.department || '').trim() || INCIDENT_ORIGIN_DEPARTMENTS[0])
    setNewDue('')
    void loadActions()
  }, [incident, loadActions])

  useEffect(() => {
    setNewAssignee('')
  }, [newDept])

  const saveIncidentFields = async () => {
    if (!incident?.id) return
    setSavingIncident(true)
    setError('')
    try {
      const result = await onIncidentPatch(incident.id, {
        status,
        resolutionNote,
      })
      if (result === null) setError('No s ha pogut desar')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desant')
    } finally {
      setSavingIncident(false)
    }
  }

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
          assignedToName: newAssignee && newAssignee !== CAP_NONE ? newAssignee : '',
          department: newDept.trim(),
          dueAt: newDue ? `${newDue}T12:00:00` : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant accio'))
      setNewTitle('')
      setNewDescription('')
      setNewAssignee('')
      setNewDept((incident.department || '').trim() || INCIDENT_ORIGIN_DEPARTMENTS[0])
      setNewDue('')
      await loadActions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant accio')
    } finally {
      setCreating(false)
    }
  }

  const patchAction = async (actionId: string, body: Record<string, unknown>) => {
    setError('')
    try {
      const res = await fetch(`/api/incidents/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant accio'))
      await loadActions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant accio')
    }
  }

  const openActionsCount = useMemo(
    () => actions.filter((a) => a.status === 'open' || a.status === 'in_progress').length,
    [actions]
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

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3">
        {/* Fila 1: estat + nota + desar */}
        <div className="flex flex-wrap items-center gap-2">
          <IncidentWorkflowStatusSelect value={status} onValueChange={setStatus} />
          <textarea
            id={`incident-nota-${incident.id}`}
            rows={1}
            className={cn(
              ctrl,
              'min-h-8 flex-1 resize-y px-2.5 py-1.5 leading-snug placeholder:text-slate-400 min-w-[10rem]'
            )}
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="Nota reunió, acords…"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
            disabled={savingIncident}
            onClick={() => void saveIncidentFields()}
          >
            {savingIncident ? '…' : 'Desar'}
          </Button>
          {actions.length > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800">
              {actions.length} {actions.length === 1 ? 'acció' : 'accions'}
              {openActionsCount > 0 ? ` · ${openActionsCount} pendent${openActionsCount === 1 ? '' : 's'}` : ''}
            </span>
          ) : null}
        </div>

        {/* Fila 2: nova acció */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            + Acció
          </span>
          <Input
            aria-label="Títol nova acció"
            placeholder="Títol *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className={cn(ctrl, 'min-w-[7rem] flex-1 max-w-[11rem] px-2')}
          />
          <Input
            placeholder="Descripció"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className={cn(ctrl, 'min-w-[6rem] flex-1 max-w-[14rem] px-2')}
          />
          <Select value={newDept} onValueChange={setNewDept}>
            <SelectTrigger className={cn(ctrl, 'w-[6.5rem] px-2 text-xs')} title="Departament">
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
          <Select
            value={newAssignee || CAP_NONE}
            onValueChange={(v) => setNewAssignee(v === CAP_NONE ? '' : v)}
            disabled={!newDept.trim() || newFormCapsLoading}
          >
            <SelectTrigger className={cn(ctrl, 'w-[8rem] px-2 text-xs')} title="Cap">
              <SelectValue placeholder={newFormCapsLoading ? '…' : 'Cap'} />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-slate-200 shadow-lg">
              {newAssigneeItems.map((x) => (
                <SelectItem key={x.value} value={x.value}>
                  {x.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className={cn(ctrl, 'w-[8.5rem] shrink-0 px-2')}
            title="Termini"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 border-amber-300 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
            disabled={creating || !newTitle.trim()}
            onClick={() => void createAction()}
          >
            {creating ? '…' : 'Afegir'}
          </Button>
        </div>

        {/* Accions existents: només si n'hi ha */}
        {loadingActions ? (
          <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">Carregant accions…</p>
        ) : null}

        {!loadingActions && actions.length > 0 ? (
          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1 basis-[8rem]">
                  <span className="block truncate text-xs font-semibold text-slate-900">{a.title}</span>
                  {a.description ? (
                    <span className="block truncate text-[11px] text-slate-500" title={a.description}>
                      {a.description}
                    </span>
                  ) : null}
                </div>
                <ActionRowStatusSelect
                  value={a.status}
                  onValueChange={(v) => void patchAction(a.id, { status: v })}
                />
                {a.dueAt ? (
                  <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
                    {a.dueAt.slice(0, 10)}
                  </span>
                ) : null}
                <ActionRowDeptAssignInline action={a} patchAction={patchAction} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
