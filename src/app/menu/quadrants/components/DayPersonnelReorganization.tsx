'use client'

import { useMemo, useState } from 'react'
import { ArrowRightLeft, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'
import { cn } from '@/lib/utils'

type ApiQuadrant = {
  docId: string
  eventId: string
  label: string
  status: string
  workers: Array<{ id: string; name: string; availability: DestinationAvailability }>
}

type DestinationAvailability = Record<
  string,
  { available: boolean; reason?: string }
>

type ApiPerson = {
  id: string
  name: string
  availability: DestinationAvailability
}

type ApiResponse = {
  ok?: boolean
  error?: string
  quadrants?: ApiQuadrant[]
  personnel?: ApiPerson[]
}

type AssignmentRow = {
  operationId: string
  sourceDocId: string | null
  destinationDocId: string | null
  personId: string
  personName: string
  availability: DestinationAvailability
  isNew?: boolean
}

type Props = {
  day: string
  department: string
  onApplied?: () => void | Promise<unknown>
}

const newOperationId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function DayPersonnelReorganization({ day, department, onApplied }: Props) {
  const { ready, hasAction } = useUiPermissions()
  const canSave = ready && hasAction(PERM.action('/menu/quadrants', 'draft:save'))
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quadrants, setQuadrants] = useState<ApiQuadrant[]>([])
  const [personnel, setPersonnel] = useState<ApiPerson[]>([])
  const [rows, setRows] = useState<AssignmentRow[]>([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ day, department })
      const response = await fetch(`/api/quadrants/reassign-day?${params.toString()}`, {
        cache: 'no-store',
      })
      const body = (await response.json().catch(() => ({}))) as ApiResponse
      if (!response.ok || body.ok === false) {
        throw new Error(body.error || 'No s’ha pogut carregar la reorganització')
      }
      const nextQuadrants = Array.isArray(body.quadrants) ? body.quadrants : []
      setQuadrants(nextQuadrants)
      setPersonnel(
        Array.isArray(body.personnel)
          ? body.personnel.map((person) => ({
              ...person,
              availability: person.availability || {},
            }))
          : []
      )
      setRows(
        nextQuadrants.flatMap((quadrant) =>
          quadrant.workers.map((worker) => ({
            operationId: `${quadrant.docId}:${worker.id || worker.name}`,
            sourceDocId: quadrant.docId,
            destinationDocId: quadrant.docId,
            personId: worker.id,
            personName: worker.name,
            availability: worker.availability || {},
          }))
        )
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error carregant personal')
    } finally {
      setLoading(false)
    }
  }

  const openDialog = () => {
    setOpen(true)
    void load()
  }

  const changedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.personName.trim() &&
          row.destinationDocId !== row.sourceDocId
      ),
    [rows]
  )

  const availablePersonnel = useMemo(
    () =>
      personnel.filter((person) =>
        Object.values(person.availability).some((entry) => entry.available)
      ),
    [personnel]
  )

  const updateRow = (operationId: string, patch: Partial<AssignmentRow>) => {
    setRows((current) =>
      current.map((row) => (row.operationId === operationId ? { ...row, ...patch } : row))
    )
  }

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        operationId: newOperationId(),
        sourceDocId: null,
        destinationDocId: null,
        personId: '',
        personName: '',
        availability: {},
        isNew: true,
      },
    ])
  }

  const save = async () => {
    if (changedRows.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/quadrants/reassign-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, department, operations: changedRows }),
      })
      const body = (await response.json().catch(() => ({}))) as ApiResponse
      if (!response.ok || body.ok === false) {
        throw new Error(body.error || 'No s’han pogut aplicar els canvis')
      }
      window.dispatchEvent(
        new CustomEvent('quadrant:updated', { detail: { status: 'draft', day } })
      )
      await onApplied?.()
      setOpen(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error aplicant els canvis')
    } finally {
      setSaving(false)
    }
  }

  if (!canSave) return null

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
        Reorganitzar personal
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`reorganize-title-${day}`}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id={`reorganize-title-${day}`} className="text-lg font-semibold text-slate-900">
                  Reorganitzar personal · {day.split('-').reverse().join('/')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Prepara tots els moviments i aplica’ls junts. La disponibilitat es valida abans de desar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Tancar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregant personal…
                </div>
              ) : (
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div
                      key={row.operationId}
                      className={cn(
                        'grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(180px,1fr)_32px_minmax(220px,1.2fr)_36px] md:items-center',
                        row.destinationDocId !== row.sourceDocId
                          ? 'border-indigo-200 bg-indigo-50/50'
                          : 'border-slate-200'
                      )}
                    >
                      {row.isNew ? (
                        <select
                          aria-label="Treballador per afegir"
                          value={row.personId}
                          onChange={(event) => {
                            const person = availablePersonnel.find(
                              (item) => item.id === event.target.value
                            )
                            const firstAvailableDestination = quadrants.find(
                              (quadrant) =>
                                person?.availability[quadrant.docId]?.available === true
                            )
                            updateRow(row.operationId, {
                              personId: person?.id || '',
                              personName: person?.name || '',
                              availability: person?.availability || {},
                              destinationDocId: firstAvailableDestination?.docId || null,
                            })
                          }}
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        >
                          <option value="">Selecciona treballador…</option>
                          {availablePersonnel.map((person) => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-900">{row.personName}</div>
                          <div className="text-xs text-slate-500">
                            {quadrants.find((item) => item.docId === row.sourceDocId)?.label || 'Origen'}
                          </div>
                        </div>
                      )}

                      <ArrowRightLeft className="hidden h-4 w-4 text-slate-400 md:block" aria-hidden />

                      <select
                        aria-label={`Destinació de ${row.personName || 'treballador nou'}`}
                        value={row.destinationDocId || ''}
                        onChange={(event) =>
                          updateRow(row.operationId, {
                            destinationDocId: event.target.value || null,
                          })
                        }
                        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      >
                        <option value="">Sense assignar</option>
                        {quadrants.map((quadrant) => (
                          <option
                            key={quadrant.docId}
                            value={quadrant.docId}
                            disabled={
                              quadrant.docId !== row.sourceDocId &&
                              row.availability[quadrant.docId]?.available !== true
                            }
                          >
                            {quadrant.label}{quadrant.status === 'confirmed' ? ' · Confirmat' : ''}
                            {quadrant.docId !== row.sourceDocId &&
                            row.availability[quadrant.docId]?.available !== true
                              ? ' · No disponible'
                              : ''}
                          </option>
                        ))}
                      </select>

                      {row.isNew ? (
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.filter((item) => item.operationId !== row.operationId))}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar fila"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}

                  {quadrants.length > 0 ? (
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <Plus className="h-4 w-4" /> Afegir treballador
                    </button>
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No hi ha quadrants desats en aquest dia.
                    </p>
                  )}
                </div>
              )}

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-xs text-slate-500">
                {changedRows.length} {changedRows.length === 1 ? 'canvi preparat' : 'canvis preparats'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || loading || changedRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Validar i aplicar
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  )
}

