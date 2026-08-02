'use client'

import { useEffect, useMemo, useState } from 'react'
import { TriangleAlert, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEventPersonnel, type Person } from '@/hooks/useEventPersonnel'

type Props = {
  open: boolean
  onClose: () => void
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

const norm = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export default function EventClosingModal({ open, onClose, eventId, eventName, user }: Props) {
  const { data, loading, error } = useEventPersonnel(eventId)
  const [selectedDept, setSelectedDept] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [bulkHour, setBulkHour] = useState('')

  const departments = useMemo(() => {
    const set = new Set<string>()
    data?.responsables?.forEach(p => p.department && set.add(norm(p.department)))
    data?.conductors?.forEach(p => p.department && set.add(norm(p.department)))
    data?.treballadors?.forEach(p => p.department && set.add(norm(p.department)))
    return Array.from(set)
  }, [data])

  useEffect(() => {
    if (!departments.length) return
    const userDept = norm(user?.department)
    if (userDept && departments.includes(userDept)) {
      setSelectedDept(userDept)
    } else if (!selectedDept) {
      setSelectedDept(departments[0])
    }
  }, [departments, selectedDept, user?.department])

  useEffect(() => {
    if (!selectedDept) return
    const list: Row[] = []
    const pushRows = (arr?: Person[], role?: string) => {
      if (!Array.isArray(arr)) return
      arr.forEach(p => {
        if (norm(p.department) !== selectedDept) return
        list.push({ ...p, role: p.role || role })
      })
    }
    pushRows(data?.responsables, 'responsable')
    pushRows(data?.conductors, 'conductor')
    pushRows(data?.treballadors, 'treballador')
    setRows(list)
  }, [data, selectedDept])

  const roleN = norm(user?.role)
  const isAdmin = roleN === 'admin'
  const isDireccio = roleN === 'direccio' || roleN === 'direccion'
  const isCap = roleN.includes('cap')
  const canEdit = isAdmin || isDireccio || isCap || norm(user?.department) === selectedDept
  const canSwitchDepartment = isAdmin || isDireccio || isCap

  const handleApplyHourToAll = () => {
    if (!bulkHour) return
    setRows(prev =>
      prev.map(row => (row.noShow ? row : { ...row, endTimeReal: bulkHour }))
    )
  }

  const patchRow = (index: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const handleSave = async () => {
    if (!canEdit || !selectedDept) return
    setSaving(true)
    try {
      const updates = rows.map(row => ({
        name: row.name || '',
        role: row.role,
        endTimeReal: row.endTimeReal || '',
        notes: row.notes || '',
        noShow: !!row.noShow,
        leftEarly: !!row.leftEarly,
      }))

      const res = await fetch('/api/quadrants/closing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          department: selectedDept,
          updates,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Error desant tancament')
      }

      alert('Hores reals desades correctament')
      onClose()
    } catch (err: unknown) {
      console.error('[EventClosingModal] save error', err)
      alert(err instanceof Error ? err.message : 'No s ha pogut desar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="h-[92dvh] w-[100vw] max-w-none translate-x-[-50%] translate-y-[-50%] rounded-none border-0 p-0 sm:h-auto sm:max-h-[92vh] sm:w-[96vw] sm:max-w-5xl sm:rounded-2xl">
        <DialogHeader className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-left text-base font-semibold text-slate-900 sm:text-lg">
                {eventName || 'Tancament'}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {loading && <p className="px-4 py-6 text-sm text-gray-500">Carregant personal...</p>}
        {error && <p className="px-4 py-6 text-sm text-red-600">Error: {error}</p>}

        {!loading && !error && (
          <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-col gap-2.5">
                {canSwitchDepartment ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {departments.map(dept => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setSelectedDept(dept)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                          selectedDept === dept
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700',
                        ].join(' ')}
                      >
                        {dept || '-'}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-[140px_auto]">
                  <div className="min-w-0">
                    <Input
                      type="time"
                      className="h-11 rounded-xl border-slate-200 bg-white text-base font-semibold text-slate-900"
                      disabled={!canEdit}
                      value={bulkHour}
                      onChange={e => setBulkHour(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canEdit || !bulkHour}
                    onClick={handleApplyHourToAll}
                    className="h-11 rounded-xl px-4"
                  >
                    Aplicar a tots
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  Cap persona per aquest departament.
                </div>
              ) : (
                <div className="grid gap-3">
                  {rows.map((row, idx) => {
                    const showNote = row.noShow || row.leftEarly
                    return (
                      <article
                        key={`${row.name}-${idx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_148px_92px] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900">
                              {row.name || 'Sense nom'}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                              {row.endTime ? <span>Previst {row.endTime}</span> : null}
                              {row.time ? <span>Inici {row.time}</span> : null}
                              {!canEdit ? <span>Lectura</span> : null}
                              {!row.time && !row.endTime ? (
                                <span className="capitalize">{row.role || row.department || '-'}</span>
                              ) : null}
                            </div>
                          </div>

                          <div>
                            <Input
                              type="time"
                              className="h-12 rounded-xl border-slate-200 bg-white text-center text-base font-semibold text-slate-900"
                              disabled={!canEdit || row.noShow}
                              value={row.endTimeReal || ''}
                              onChange={e => patchRow(idx, { endTimeReal: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 sm:justify-self-end">
                            <button
                              type="button"
                              aria-label="No ha vingut"
                              title="No ha vingut"
                              disabled={!canEdit}
                              onClick={() =>
                                patchRow(idx, {
                                  noShow: !row.noShow,
                                  endTimeReal: !row.noShow ? '' : row.endTimeReal,
                                  notes: !row.noShow ? row.notes : '',
                                })
                              }
                              className={[
                                'flex h-12 w-full items-center justify-center rounded-xl border transition sm:w-10',
                                row.noShow
                                  ? 'border-red-300 bg-red-50 text-red-700'
                                  : 'border-slate-200 bg-white text-slate-600',
                              ].join(' ')}
                            >
                              <XCircle className="h-4.5 w-4.5" />
                            </button>

                            <button
                              type="button"
                              aria-label="Ha marxat abans"
                              title="Ha marxat abans"
                              disabled={!canEdit}
                              onClick={() =>
                                patchRow(idx, {
                                  leftEarly: !row.leftEarly,
                                  notes: !row.leftEarly ? row.notes : '',
                                })
                              }
                              className={[
                                'flex h-12 w-full items-center justify-center rounded-xl border transition sm:w-10',
                                row.leftEarly
                                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                                  : 'border-slate-200 bg-white text-slate-600',
                              ].join(' ')}
                            >
                              <TriangleAlert className="h-4.5 w-4.5" />
                            </button>
                          </div>
                        </div>

                        {showNote ? (
                          <div className="mt-2">
                            <Input
                              placeholder="Nota"
                              disabled={!canEdit}
                              value={row.notes || ''}
                              onChange={e => patchRow(idx, { notes: e.target.value })}
                              className="h-11 rounded-xl border-slate-200 text-sm"
                            />
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
                  Cancel.la
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!canEdit || saving}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:bg-blue-400 sm:w-auto"
                >
                  {saving ? 'Desant...' : 'Desa tancament'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
