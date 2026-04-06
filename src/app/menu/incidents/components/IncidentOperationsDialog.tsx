'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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

/** Superfície de control unificada (evita el contorn negre del select nadiu i alinea amb l’Input). */
const ctrl =
  'rounded-lg border border-slate-200/90 bg-white text-slate-800 shadow-sm transition-[box-shadow,border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:border-amber-300/60 hover:border-slate-300/90 disabled:opacity-50 disabled:pointer-events-none'

const panel =
  'rounded-2xl border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/40 shadow-[0_4px_32px_-12px_rgba(15,23,42,0.12)]'

const panelInner =
  'rounded-xl border border-slate-100/90 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]'

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
        className={cn(ctrl, 'h-9 w-[9.75rem] px-2.5 text-sm font-medium')}
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
        className={cn(ctrl, 'h-8 w-[6.85rem] px-2 text-xs font-medium shrink-0')}
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
  incident: Incident | null
  open: boolean
  onClose: () => void
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

export default function IncidentOperationsDialog({
  incident,
  open,
  onClose,
  onIncidentPatch,
}: Props) {
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
    if (!open || !incident) return
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
  }, [open, incident, loadActions])

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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto w-[95vw] max-w-[calc(100%-2rem)] sm:max-w-7xl gap-0 rounded-2xl border-slate-200/80 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_18%)] p-0 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.18)] sm:p-0">
        <DialogHeader className="relative space-y-0 border-b border-slate-200/60 bg-white/90 px-5 pb-4 pt-5 text-left sm:px-8 sm:pb-5 sm:pt-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-amber-400/90 via-amber-500 to-amber-600/85" aria-hidden />
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/15 text-amber-800 shadow-inner ring-1 ring-amber-500/10">
              <ClipboardList className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-1 pt-0.5">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                Seguiment incidència
              </DialogTitle>
              <DialogDescription className="line-clamp-2 text-sm leading-relaxed text-slate-500">
                {incident?.incidentNumber ? (
                  <span className="font-medium text-slate-700">{incident.incidentNumber}</span>
                ) : null}
                {incident?.incidentNumber && incident?.eventTitle ? (
                  <span className="text-slate-400"> · </span>
                ) : null}
                {incident?.eventTitle || ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {incident && (
          <div className={cn('space-y-4 px-5 py-4 sm:px-8 sm:py-5', typography('bodySm'))}>
            {error ? (
              <div
                className="flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2.5 text-sm text-red-800"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Estat + nota — alineació visual en una sola “banda” d’alçada */}
            <section className={cn(panel, 'p-3.5 sm:p-4')}>
              <p className={cn(typography('eyebrow'), 'mb-3 text-amber-900/70')}>
                Estat i nota de resolució
              </p>
              <div className="flex flex-wrap items-stretch gap-3">
                <div className="flex flex-col gap-1.5 shrink-0">
                  <label className={typography('label')} htmlFor="incident-status">
                    Estat
                  </label>
                  <IncidentWorkflowStatusSelect value={status} onValueChange={setStatus} />
                </div>
                <div className="flex min-h-[3.25rem] flex-1 flex-col gap-1.5 min-w-[min(100%,18rem)]">
                  <label className={typography('label')} htmlFor="incident-nota">
                    Nota (reunió, acords…)
                  </label>
                  <textarea
                    id="incident-nota"
                    rows={1}
                    className={cn(
                      ctrl,
                      'min-h-[2.25rem] flex-1 resize-y px-3 py-2 text-sm leading-snug placeholder:text-slate-400'
                    )}
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="Opcional — reunió, acords, següent pas…"
                  />
                </div>
                <div className="flex flex-col justify-end shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 min-w-[5.5rem] bg-amber-600 font-medium text-white shadow-sm hover:bg-amber-700"
                    disabled={savingIncident}
                    onClick={() => void saveIncidentFields()}
                  >
                    {savingIncident ? 'Desant…' : 'Desar'}
                  </Button>
                </div>
              </div>
            </section>

            <section className={cn(panel, 'p-3.5 sm:p-4')}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className={cn(typography('eyebrow'), 'text-slate-600')}>Accions derivades</p>
                {loadingActions ? (
                  <span className="text-xs font-medium text-slate-400">Carregant…</span>
                ) : null}
              </div>

              {!loadingActions && actions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 px-3 py-6 text-center text-sm text-slate-500">
                  Cap acció encara. Afegeix la primera a sota.
                </p>
              ) : null}

              {actions.length > 0 ? (
                <ul className={cn(panelInner, 'divide-y divide-slate-100/90 overflow-hidden')}>
                  {actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2.5 transition-colors hover:bg-amber-50/20"
                    >
                      <div className="min-w-0 flex-1 basis-[12rem] max-w-xl">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {a.title}
                        </span>
                        {a.description ? (
                          <span
                            className={cn(typography('bodyXs'), 'mt-0.5 block truncate text-slate-500')}
                            title={a.description}
                          >
                            {a.description}
                          </span>
                        ) : null}
                      </div>
                      <ActionRowStatusSelect
                        value={a.status}
                        onValueChange={(v) => void patchAction(a.id, { status: v })}
                      />
                      {a.dueAt ? (
                        <span
                          className="inline-flex shrink-0 items-center rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600"
                          title="Termini"
                        >
                          {a.dueAt.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="w-[5.75rem] shrink-0" aria-hidden />
                      )}
                      <ActionRowDeptAssignInline action={a} patchAction={patchAction} />
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 rounded-xl border border-dashed border-amber-200/60 bg-gradient-to-br from-amber-50/35 via-white to-slate-50/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900/80">
                    Nova acció
                  </span>
                  <span className="text-xs text-slate-400">Omple títol i, si vols, resta de camps</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    aria-label="Títol nova acció"
                    placeholder="Títol *"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className={cn(ctrl, 'h-9 flex-1 min-w-[10rem] max-w-[15rem] px-3 text-sm')}
                  />
                  <Input
                    placeholder="Descripció"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className={cn(ctrl, 'h-9 flex-1 min-w-[9rem] max-w-[20rem] px-3 text-sm')}
                  />
                  <Select value={newDept} onValueChange={setNewDept}>
                    <SelectTrigger
                      className={cn(ctrl, 'h-9 w-[7.75rem] px-2.5 text-xs font-medium')}
                      title="Departament"
                    >
                      <SelectValue placeholder="Dept" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 shadow-lg">
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
                    <SelectTrigger
                      className={cn(ctrl, 'h-9 w-[10rem] px-2.5 text-xs font-medium')}
                      title="Cap"
                    >
                      <SelectValue placeholder={newFormCapsLoading ? '…' : 'Cap'} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                      {newAssigneeItems.map((x) => (
                        <SelectItem key={x.value} value={x.value}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="nova-accio-termini"
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className={cn(ctrl, 'h-9 w-[10rem] shrink-0 px-2 text-sm')}
                    title="Termini de l’acció (opcional; no és la data de l’esdeveniment)"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0 border border-amber-300/60 bg-white font-medium text-amber-900 shadow-sm hover:bg-amber-50"
                    disabled={creating || !newTitle.trim()}
                    onClick={() => void createAction()}
                  >
                    {creating ? '…' : 'Afegir'}
                  </Button>
                </div>
              </div>
            </section>

            <div className="flex justify-end border-t border-slate-100/90 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={onClose}
              >
                Tancar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
