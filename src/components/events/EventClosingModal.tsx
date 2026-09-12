'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, TriangleAlert, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEventPersonnel, type Person } from '@/hooks/useEventPersonnel'
import { normalizeDept } from '@/lib/accessControl'
import { canCloseEventDepartment } from '@/lib/eventClosingPermissions'

type Props = {
  onBack: () => void
  onClose: () => void
  onSaved?: () => void
  eventId: string
  eventName?: string
  user?: { role?: string; department?: string; id?: string }
}

type Row = Person & {
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

const norm = (value?: string | null) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const normDepartment = (value?: string | null) => normalizeDept(value)

export default function EventClosingHoursPanel({ onBack, onClose, onSaved, eventId, eventName, user }: Props) {
  const { data, loading, error } = useEventPersonnel(eventId)
  const [selectedDept, setSelectedDept] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [bulkHour, setBulkHour] = useState('')

  const departments = useMemo(() => {
    const values = new Set<string>()
    data?.responsables?.forEach((person) => person.department && values.add(normDepartment(person.department)))
    data?.conductors?.forEach((person) => person.department && values.add(normDepartment(person.department)))
    data?.treballadors?.forEach((person) => person.department && values.add(normDepartment(person.department)))
    return Array.from(values)
  }, [data])

  useEffect(() => {
    if (!departments.length) return
    const userDept = normDepartment(user?.department)
    if (userDept && departments.includes(userDept)) {
      setSelectedDept(userDept)
    } else if (!selectedDept) {
      setSelectedDept(departments[0])
    }
  }, [departments, selectedDept, user?.department])

  useEffect(() => {
    if (!selectedDept) return
    const list: Row[] = []
    const appendRows = (people?: Person[], fallbackRole?: string) => {
      if (!Array.isArray(people)) return
      people.forEach((person) => {
        if (normDepartment(person.department) !== selectedDept) return
        list.push({ ...person, role: person.role || fallbackRole })
      })
    }
    appendRows(data?.responsables, 'responsable')
    appendRows(data?.conductors, 'conductor')
    appendRows(data?.treballadors, 'treballador')
    setRows(list)
  }, [data, selectedDept])

  const normalizedRole = norm(user?.role)
  const canSwitchDepartment =
    normalizedRole === 'admin' ||
    normalizedRole === 'direccio' ||
    normalizedRole === 'direccion' ||
    normalizedRole.includes('cap')
  const canEdit = canCloseEventDepartment({
    role: user?.role,
    userDepartment: user?.department,
    targetDepartment: selectedDept,
    hasClosingPermission: true,
  })

  const applyHourToAll = (hour: string) => {
    setBulkHour(hour)
    if (!hour) return
    setRows((current) =>
      current.map((row) => (row.noShow ? row : { ...row, endTimeReal: hour }))
    )
  }

  const patchRow = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, currentIndex) => (currentIndex === index ? { ...row, ...patch } : row))
    )
  }

  const handleSave = async () => {
    if (!canEdit || !selectedDept || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const updates = rows.map((row) => ({
        name: row.name || '',
        role: row.role,
        endTimeReal: row.endTimeReal || '',
        notes: row.notes || '',
        noShow: Boolean(row.noShow),
        leftEarly: Boolean(row.leftEarly),
      }))

      const response = await fetch('/api/quadrants/closing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, department: selectedDept, updates }),
      })

      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        throw new Error(json?.error || 'No s’han pogut desar les hores reals')
      }

      onSaved?.()
    } catch (caught: unknown) {
      console.error('[EventClosingHoursPanel] save error', caught)
      setSaveError(caught instanceof Error ? caught.message : 'No s’han pogut desar les hores reals')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
            aria-label="Tornar al tancament operatiu"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 id="audit-execution-title" className="text-lg font-semibold leading-tight text-slate-950">Hores reals</h2>
            <p className="truncate text-sm text-slate-500">{eventName || 'Tancament operatiu'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
            aria-label="Tancar el tancament operatiu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
          <p className="text-sm text-slate-500">Carregant el personal…</p>
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No s’ha pogut carregar el personal: {error}
          </p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
            <section className="sticky top-0 z-10 space-y-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
              {canSwitchDepartment && departments.length > 1 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Departament</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {departments.map((department) => (
                      <button
                        key={department}
                        type="button"
                        onClick={() => setSelectedDept(department)}
                        className={[
                          'min-h-11 shrink-0 touch-manipulation rounded-full border px-4 py-2 text-sm font-semibold capitalize transition active:scale-[0.98]',
                          selectedDept === department
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700',
                        ].join(' ')}
                      >
                        {department || 'Sense departament'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="closing-bulk-hour" className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Hora de finalització comuna
                </label>
                <Input
                  id="closing-bulk-hour"
                  type="time"
                  className="h-12 w-full rounded-xl border-slate-300 bg-white px-3 text-center text-lg font-semibold text-slate-950"
                  disabled={!canEdit}
                  value={bulkHour}
                  onChange={(event) => applyHourToAll(event.target.value)}
                />
                <p className="mt-1.5 text-xs leading-4 text-slate-500">
                  En seleccionar-la, s’aplica automàticament a totes les persones presents.
                </p>
              </div>
            </section>

            <section className="space-y-3 px-3 py-3 pb-6">
              {!canEdit && selectedDept ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Aquest departament és només de consulta.
                </p>
              ) : null}

              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  No hi ha personal en aquest departament.
                </div>
              ) : (
                rows.map((row, index) => {
                  const showNote = Boolean(row.noShow || row.leftEarly)
                  const inputId = `closing-hour-${index}`
                  return (
                    <article key={`${row.id || row.name}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold text-slate-950">{row.name || 'Sense nom'}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          {row.time ? <span>Inici: {row.time}</span> : null}
                          {row.endTime ? <span>Final previst: {row.endTime}</span> : null}
                          <span className="capitalize">{row.role || row.department || 'Personal'}</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
                          Hora real de finalització
                        </label>
                        <Input
                          id={inputId}
                          type="time"
                          className="h-12 w-full rounded-xl border-slate-300 bg-white text-center text-lg font-semibold text-slate-950"
                          disabled={!canEdit || row.noShow}
                          value={row.endTimeReal || ''}
                          onChange={(event) => patchRow(index, { endTimeReal: event.target.value })}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={Boolean(row.noShow)}
                          disabled={!canEdit}
                          onClick={() =>
                            patchRow(index, {
                              noShow: !row.noShow,
                              endTimeReal: !row.noShow ? '' : row.endTimeReal,
                              notes: !row.noShow ? row.notes : '',
                            })
                          }
                          className={[
                            'flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50',
                            row.noShow
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-slate-200 bg-white text-slate-700',
                          ].join(' ')}
                        >
                          <XCircle className="h-5 w-5 shrink-0" />
                          No ha vingut
                        </button>
                        <button
                          type="button"
                          aria-pressed={Boolean(row.leftEarly)}
                          disabled={!canEdit}
                          onClick={() =>
                            patchRow(index, {
                              leftEarly: !row.leftEarly,
                              notes: !row.leftEarly ? row.notes : '',
                            })
                          }
                          className={[
                            'flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50',
                            row.leftEarly
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-white text-slate-700',
                          ].join(' ')}
                        >
                          <TriangleAlert className="h-5 w-5 shrink-0" />
                          Ha marxat abans
                        </button>
                      </div>

                      {showNote ? (
                        <div className="mt-3">
                          <label htmlFor={`closing-note-${index}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                            Observacions
                          </label>
                          <Input
                            id={`closing-note-${index}`}
                            placeholder="Explica breument què ha passat"
                            disabled={!canEdit}
                            value={row.notes || ''}
                            onChange={(event) => patchRow(index, { notes: event.target.value })}
                            className="h-12 rounded-xl border-slate-300 text-base"
                          />
                        </div>
                      ) : null}
                    </article>
                  )
                })
              )}

              {saveError ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </p>
              ) : null}
            </section>
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canEdit || saving || rows.length === 0}
              className="h-12 w-full touch-manipulation rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-60"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {saving ? 'Desant les hores…' : 'Desar hores reals'}
            </Button>
          </footer>
        </>
      )}
    </div>
  )
}
