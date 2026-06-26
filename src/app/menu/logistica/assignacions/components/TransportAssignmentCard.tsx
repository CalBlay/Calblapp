'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Truck } from 'lucide-react'
import VehiclesTable from './VehiclesTable'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'

type VehicleRow = {
  id: string
  department?: string
  startDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
  plate?: string
  vehicleType?: string
  name?: string
}

const displayEventName = (raw?: string) => {
  const value = String(raw || '').trim()
  if (!value) return '—'
  // Some sources append date/pax separated by " / ".
  return value.split('/')[0]?.trim() || value
}

export default function TransportAssignmentCard({
  item,
  onChanged,
}: {
  item: {
    eventCode: string
    day: string
    eventStartTime: string
    eventEndTime?: string
    eventName: string
    location: string
    service?: string
    pax: number
    status: 'draft' | 'confirmed'
    source?: 'quadrant' | 'commercialReservation'
    requesterName?: string
    readOnly?: boolean
    rows?: VehicleRow[]
  }
  onChanged: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [editingRowKeys, setEditingRowKeys] = useState<Record<string, boolean>>({})

  const rows = Array.isArray(item.rows) ? item.rows : []

  const isRowComplete = (r: VehicleRow) =>
    Boolean(
      r.department &&
      r.startDate &&
      r.startTime &&
      r.arrivalTime &&
      r.endTime &&
      r.vehicleType &&
      r.plate &&
      r.name
    )

  const totalVehicles = rows.length
  const completedVehicles = rows.filter(
    (r) => isRowComplete(r) && !editingRowKeys[String(r.id)]
  ).length

  const statusColor = useMemo(
    () => (item.status === 'confirmed' ? 'bg-green-500' : 'bg-blue-500'),
    [item.status]
  )

  const hasPendingEdits = Object.keys(editingRowKeys).length > 0

  const toggleOpen = () => {
    if (open && hasPendingEdits) {
      const ok = window.confirm(
        'Tens canvis pendents de guardar. Vols tancar igualment?'
      )
      if (!ok) return
    }
    setOpen((v) => !v)
  }

  const handleEditingChange = useCallback((rowKey: string, isEditing: boolean) => {
    setEditingRowKeys((prev) => {
      if (isEditing) {
        if (prev[rowKey]) return prev
        return { ...prev, [rowKey]: true }
      }
      if (!prev[rowKey]) return prev
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-200 hover:shadow-md">
      <div
        className="flex cursor-pointer flex-col gap-3 px-3.5 py-3.5 transition hover:bg-emerald-50/40"
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggleOpen()
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xl font-semibold text-gray-900">
              {item.eventStartTime || '--:--'}
            </div>
            <div className="text-xs font-mono text-gray-500">
              #{item.eventCode}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <span
              className={`inline-block h-3 w-3 rounded-full ${statusColor}`}
              title={item.status === 'confirmed' ? 'Quadrant confirmat' : 'Quadrant en esborrany'}
            />
            <span>{item.status === 'confirmed' ? 'Confirmat' : 'Esborrany'}</span>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <div className="line-clamp-2 font-semibold leading-snug text-gray-900">
            {displayEventName(item.eventName)}
          </div>
          <div className="line-clamp-2 text-sm text-gray-600">
            {item.location}
          </div>
          <div className="text-xs text-gray-500">
            {item.service || 'Sense servei'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            <Truck className="h-4 w-4" />
            <span>
              {completedVehicles}/{totalVehicles}
            </span>
          </div>

          <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {item.pax} pax
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-700">
          {rows.length > 0 ? (
            rows.map((v) => (
              <span
                key={v.id}
                className="rounded-md border bg-slate-50 px-2 py-1 font-medium"
              >
                {(v.plate && v.vehicleType)
                  ? `${v.plate} - ${TRANSPORT_TYPE_LABELS[v.vehicleType] || v.vehicleType}`
                  : v.plate || TRANSPORT_TYPE_LABELS[v.vehicleType || ''] || v.vehicleType || 'Vehicle sense dades'}
              </span>
            ))
          ) : (
            <span className="text-gray-400">Sense vehicles assignats</span>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-auto border-t bg-gray-50">
          {item.readOnly ? (
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Sol·licitant
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {item.requesterName || 'Sense dades'}
                  </div>
                </div>
                <div className="rounded-xl border bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Franja
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {item.eventStartTime || '--:--'} {item.eventEndTime ? `- ${item.eventEndTime}` : ''}
                  </div>
                </div>
                <div className="rounded-xl border bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Vehicle
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {rows[0]?.plate || 'Pendent d’assignar'}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-dashed bg-white px-3 py-2 text-sm text-slate-600">
                Aquesta reserva es gestiona des de `Reserva comercials`.
              </div>
            </div>
          ) : (
            <VehiclesTable
              item={item}
              onChanged={onChanged}
              onEditingChange={handleEditingChange}
            />
          )}
        </div>
      )}
    </div>
  )
}
