// file: src/components/events/EventClosingModal.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

  const departments = useMemo(() => {
    const set = new Set<string>()
    data?.responsables?.forEach((p) => p.department && set.add(norm(p.department)))
    data?.conductors?.forEach((p) => p.department && set.add(norm(p.department)))
    data?.treballadors?.forEach((p) => p.department && set.add(norm(p.department)))
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
      arr.forEach((p) => {
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

  const applyHourToAll = (value: string) => {
    setRows((prev) => prev.map((r) => ({ ...r, endTimeReal: value })))
  }

  const handleSave = async () => {
    if (!canEdit || !selectedDept) return
    setSaving(true)
    try {
      const updates = rows.map((r) => ({
        name: r.name || '',
        role: r.role,
        endTimeReal: r.endTimeReal || '',
        notes: r.notes || '',
        noShow: !!r.noShow,
        leftEarly: !!r.leftEarly,
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
      alert(err instanceof Error ? err.message : 'No s’ha pogut desar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Tancament — {eventName || eventId}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-gray-500">Carregant personal…</p>}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}

        {!loading && !error && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border bg-white px-3 py-3 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">Departament</span>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-white shadow"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d || '—'}
                      </option>
                    ))}
                  </select>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 sm:ml-auto bg-slate-50 border rounded-md px-2 py-1 shadow-inner">
                    <span className="text-sm text-gray-700">Hora per a tots</span>
                    <Input
                      type="time"
                      className="w-28 h-9"
                      onChange={(e) => applyHourToAll(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border shadow-sm divide-y bg-white">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-50">
                <div className="col-span-3">Persona</div>
                <div className="col-span-2">Previst</div>
                <div className="col-span-2">Sortida real</div>
                <div className="col-span-2">Estat</div>
                <div className="col-span-3">Notes</div>
              </div>

              {rows.length === 0 && (
                <p className="p-4 text-sm text-gray-500">Cap persona per aquest departament.</p>
              )}

              {rows.map((row, idx) => (
                <div
                  key={`${row.name}-${idx}`}
                  className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-slate-50 transition"
                >
                  <div className="col-span-3">
                    <p className="font-semibold text-sm text-slate-800">{row.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{row.role || row.department}</p>
                  </div>

                  <div className="col-span-2">
                    <p className="text-xs text-gray-600">
                      {row.time ? `Inici previst: ${row.time}` : '—'}
                    </p>
                    {row.endTime && (
                      <p className="text-[11px] text-gray-400">Fi previst: {row.endTime}</p>
                    )}
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="time"
                      className="w-full h-10"
                      disabled={!canEdit}
                      value={row.endTimeReal || ''}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, endTimeReal: e.target.value } : r))
                        )
                      }
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1 text-xs text-gray-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        className="w-4 h-4"
                        checked={!!row.noShow}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, noShow: e.target.checked } : r))
                          )
                        }
                      />
                      No ha vingut
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        className="w-4 h-4"
                        checked={!!row.leftEarly}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, leftEarly: e.target.checked } : r
                            )
                          )
                        }
                      />
                      Ha marxat abans
                    </label>
                  </div>

                  <div className="col-span-3">
                    <Textarea
                      placeholder="Notes"
                      disabled={!canEdit}
                      value={row.notes || ''}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r))
                        )
                      }
                      className="text-sm min-h-[64px]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="px-4">
                Cancel·la
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canEdit || saving}
                className="px-4 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:bg-blue-400"
              >
                {saving ? 'Desant…' : 'Desa'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
