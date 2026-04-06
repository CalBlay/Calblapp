'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Incident } from '@/hooks/useIncidents'
import { INCIDENT_ACTION_STATUS, type IncidentActionStatus } from '@/lib/incidentPolicy'

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

interface Props {
  incident: Incident | null
  open: boolean
  onClose: () => void
  onIncidentPatch: (id: string, data: Partial<Incident>) => Promise<unknown>
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
    void loadActions()
  }, [open, incident, loadActions])

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
          assignedToName: newAssignee.trim(),
          department: newDept.trim(),
          dueAt: newDue ? `${newDue}T12:00:00` : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant accio'))
      setNewTitle('')
      setNewDescription('')
      setNewAssignee('')
      setNewDept('')
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
      <DialogContent className="max-h-[90vh] overflow-y-auto w-[95vw] max-w-lg rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Seguiment incidència</DialogTitle>
          <DialogDescription className="truncate">
            {incident?.incidentNumber ? `${incident.incidentNumber} · ` : ''}
            {incident?.eventTitle || ''}
          </DialogDescription>
        </DialogHeader>

        {incident && (
          <div className="space-y-6 text-sm">
            {error ? <p className="text-red-600 text-sm">{error}</p> : null}

            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <div className="font-medium text-gray-800">Estat i nota de resolució</div>
              <p className="text-xs text-gray-500">
                Es pot tancar o marcar com a resolta sense cap acció derivada.
              </p>
              <label className="block text-xs text-gray-600">Estat</label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-gray-600 mt-2">Nota (reunió, acords…)</label>
              <textarea
                className="w-full min-h-[72px] rounded-lg border border-gray-300 px-2 py-2"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Opcional"
              />
              <Button
                type="button"
                size="sm"
                className="mt-1"
                disabled={savingIncident}
                onClick={() => void saveIncidentFields()}
              >
                {savingIncident ? 'Desant…' : 'Desar estat i nota'}
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <div className="font-medium text-gray-800">Accions derivades</div>
              {loadingActions ? (
                <p className="text-gray-500">Carregant…</p>
              ) : actions.length === 0 ? (
                <p className="text-gray-500">Cap acció encara.</p>
              ) : (
                <ul className="space-y-3">
                  {actions.map((a) => (
                    <li key={a.id} className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="font-medium">{a.title}</div>
                      {a.description ? <div className="text-xs text-gray-600 mt-1">{a.description}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <select
                          className="rounded border px-2 py-1 text-xs"
                          value={a.status}
                          onChange={(e) =>
                            void patchAction(a.id, { status: e.target.value as IncidentActionStatus })
                          }
                        >
                          {INCIDENT_ACTION_STATUS.map((s) => (
                            <option key={s} value={s}>
                              {ACTION_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        {a.assignedToName ? (
                          <span className="text-xs text-gray-600">→ {a.assignedToName}</span>
                        ) : null}
                        {a.dueAt ? (
                          <span className="text-xs text-gray-500">
                            Termini: {a.dueAt.slice(0, 10)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="pt-2 space-y-2 border-t border-gray-100 mt-2">
                <div className="text-xs font-medium text-gray-700">Nova acció</div>
                <Input
                  placeholder="Títol *"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <Input
                  placeholder="Descripció (opcional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Assignat a (nom)"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  />
                  <Input
                    placeholder="Departament"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                  />
                </div>
                <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={creating || !newTitle.trim()}
                  onClick={() => void createAction()}
                >
                  {creating ? 'Creant…' : 'Afegir acció'}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Tancar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
