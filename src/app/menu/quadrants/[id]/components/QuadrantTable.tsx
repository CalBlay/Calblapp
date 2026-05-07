//file: src/app/menu/quadrants/%5Bid%5D/components/QuadrantTable.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Trash2,
  Plus,
  Truck,
  User,
  GraduationCap,
  Save,
  CheckCircle,
  Trash,
  Edit
} from 'lucide-react'

/* ──────────────────────────────
   Icones segons rol
────────────────────────────── */
const roleIcon = {
  responsable: (
    <GraduationCap className="text-blue-700" size={20}>
      <title>Responsable</title>
    </GraduationCap>
  ),
  conductor: (
    <Truck className="text-orange-500" size={18}>
      <title>Conductor</title>
    </Truck>
  ),
  treballador: (
    <User className="text-green-600" size={18}>
      <title>Treballador</title>
    </User>
  ),
}

/* ──────────────────────────────
   Formats
────────────────────────────── */
const formatDate = (d: string) => {
  if (!d) return '--/--'
  const [, mm, dd] = d.split('-')
  return `${dd}/${mm}`
}
const formatTime = (t: string) => (t ? t.substring(0, 5) : '--:--')

/* ──────────────────────────────
   Component principal
────────────────────────────── */
export default function QuadrantTable({
  eventId,
  initialData,
}: {
  eventId?: string
  initialData?: unknown
}) {
  void eventId
  const draft = (initialData || {}) as {
    code?: string
    eventName?: string
    location?: string
    responsableId?: string
    responsable?: { id?: string; name?: string; meetingPoint?: string }
    startDate?: string
    startTime?: string
    endDate?: string
    endTime?: string
    meetingPoint?: string
    conductors?: Array<{ id: string; name: string; meetingPoint?: string }>
    treballadors?: Array<{ id: string; name: string; meetingPoint?: string }>
  }

  /* ---------- Tipus ---------- */
  interface WorkerRow {
    role: 'responsable' | 'conductor' | 'treballador'
    id: string
    name: string
    startDate: string
    startTime: string
    endDate: string
    endTime: string
    meetingPoint: string
  }

  /* ---------- Estat inicial ---------- */
  const [rows, setRows] = useState<WorkerRow[]>(() => {
    const initialRows: WorkerRow[] = []

    if (draft.responsableId) {
      initialRows.push({
        role: 'responsable',
        id: draft.responsable?.id ?? '',
        name: draft.responsable?.name ?? '',
        startDate: draft.startDate ?? '',
        startTime: draft.startTime ?? '',
        endDate: draft.endDate ?? '',
        endTime: draft.endTime ?? '',
        meetingPoint: draft.responsable?.meetingPoint || draft.meetingPoint || '',
      })
    }

    if (Array.isArray(draft.conductors)) {
      initialRows.push(
        ...draft.conductors.map((c): WorkerRow => ({
          role: 'conductor',
          id: c.id,
          name: c.name,
          startDate: draft.startDate ?? '',
          startTime: draft.startTime ?? '',
          endDate: draft.endDate ?? '',
          endTime: draft.endTime ?? '',
          meetingPoint: c.meetingPoint || draft.meetingPoint || '',
        }))
      )
    }

    if (Array.isArray(draft.treballadors)) {
      initialRows.push(
        ...draft.treballadors.map((t): WorkerRow => ({
          role: 'treballador',
          id: t.id,
          name: t.name,
          startDate: draft.startDate ?? '',
          startTime: draft.startTime ?? '',
          endDate: draft.endDate ?? '',
          endTime: draft.endTime ?? '',
          meetingPoint: t.meetingPoint || draft.meetingPoint || '',
        }))
      )
    }

    return initialRows
  })

  /* ---------- Estats i accions ---------- */
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<WorkerRow | null>(null)

  const handleConfirm = () => {}
  const handleSave = () => {}
  const handleDelete = () => {}

  const handleEdit = (i: number) => {
    setEditIdx(i)
    setEditRow({ ...rows[i] })
  }

  const handleEditChange = (k: keyof WorkerRow, v: string) => {
    setEditRow((r) => (r ? { ...r, [k]: v } : null))
  }

  const handleEditSave = (i: number) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? (editRow ?? r) : r)))
    setEditIdx(null)
    setEditRow(null)
  }

  const handleDeleteLine = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i))
    setEditIdx(null)
    setEditRow(null)
  }

  const handleAddLine = (role: WorkerRow['role']) => {
    setRows((rs) => [
      ...rs,
      {
        role,
        id: '',
        name: '',
        startDate: draft.startDate ?? '',
        startTime: draft.startTime ?? '',
        endDate: draft.endDate ?? '',
        endTime: draft.endTime ?? '',
        meetingPoint: draft.meetingPoint || '',
      },
    ])
  }

  /* ──────────────────────────────
     Render
  ─────────────────────────────── */
  return (
    <div className="w-full bg-white rounded-2xl shadow border px-4 py-4">
      {/* Header */}
      <div className="mb-2 flex justify-between items-center">
        <div>
          <div className="font-bold text-lg">
            {draft.code} – {draft.eventName}
          </div>
          {draft.location && (
            <div className="text-xs text-blue-700 font-medium truncate">
              {draft.location}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="icon"
            className="bg-green-600 text-white"
            onClick={handleConfirm}
            title="Confirma"
          >
            <CheckCircle size={18} />
          </Button>
          <Button
            size="icon"
            className="bg-blue-600 text-white"
            onClick={handleSave}
            title="Desa"
          >
            <Save size={18} />
          </Button>
          <Button
            size="icon"
            className="bg-red-600 text-white"
            onClick={handleDelete}
            title="Elimina"
          >
            <Trash size={18} />
          </Button>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-0.5">
        {rows.map((r, i) => (
          <div
            key={i}
            className="group relative flex items-center border-b py-2"
          >
            <div className="w-7 flex justify-center items-center">
              {roleIcon[r.role]}
            </div>
            <div className="flex-1 min-w-[90px] truncate text-base">
              {r.name || <span className="text-slate-400 italic">Sense nom</span>}
            </div>
            <div className="w-14 text-center font-mono text-sm">
              {formatDate(r.startDate)}
            </div>
            <div className="w-12 text-center font-mono text-sm">
              {formatTime(r.startTime)}
            </div>
            <div className="min-w-[80px] max-w-[110px] truncate text-xs text-slate-700">
              {r.meetingPoint || '-'}
            </div>

            <div className="flex gap-1 ml-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleEdit(i)}
                disabled={editIdx !== null && editIdx !== i}
                title="Editar"
              >
                <Edit size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDeleteLine(i)}
                disabled={editIdx !== null && editIdx !== i}
                title="Eliminar"
              >
                <Trash2 size={16} />
              </Button>
            </div>

            {/* Panell editable */}
            {editIdx === i && editRow && (
              <div className="absolute left-0 top-full w-full mt-1 bg-slate-50 border rounded-xl px-3 py-3 flex flex-col gap-2 z-10 shadow">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium">Nom</label>
                    <Input
                      value={editRow?.name ?? ''}
                      onChange={(e) => handleEditChange('name', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium">
                      Lloc convocatòria
                    </label>
                    <Input
                      value={editRow?.meetingPoint ?? ''}
                      onChange={(e) =>
                        handleEditChange('meetingPoint', e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-medium">Data inici</label>
                    <Input
                      type="date"
                      value={editRow?.startDate ?? ''}
                      onChange={(e) =>
                        handleEditChange('startDate', e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Hora inici</label>
                    <Input
                      type="time"
                      value={editRow?.startTime ?? ''}
                      onChange={(e) =>
                        handleEditChange('startTime', e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Data fi</label>
                    <Input
                      type="date"
                      value={editRow?.endDate ?? ''}
                      onChange={(e) =>
                        handleEditChange('endDate', e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Hora fi</label>
                    <Input
                      type="time"
                      value={editRow?.endTime ?? ''}
                      onChange={(e) =>
                        handleEditChange('endTime', e.target.value)
                      }
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end mt-1">
                  <Button
                    size="sm"
                    className="bg-green-600 text-white"
                    onClick={() => handleEditSave(i)}
                  >
                    <Save size={16} className="mr-1" />
                    Desa
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditIdx(null)
                      setEditRow(null)
                    }}
                  >
                    Cancel·la
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))} {/* ✅ tanca el map correctament */}
      </div>

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2 justify-center mt-4">
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => handleAddLine('treballador')}
        >
          <Plus className="text-green-600" size={16} /> Treballador
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => handleAddLine('conductor')}
        >
          <Plus className="text-orange-500" size={16} /> Conductor
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => handleAddLine('responsable')}
        >
          <Plus className="text-blue-600" size={16} /> Responsable
        </Button>
      </div>
    </div>
  )
}
