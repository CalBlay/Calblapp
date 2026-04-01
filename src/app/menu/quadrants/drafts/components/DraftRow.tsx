// file: src/app/menu/quadrants/drafts/components/DraftRow.tsx
'use client'

import React from 'react'
import RowActions from './RowActions'
import { GraduationCap, Truck, User, Car } from 'lucide-react'
import type { Row } from './types'
import { normalizeTransportType } from '@/lib/transportTypes'
import { getExternalWorkerBaseLabel } from '@/lib/quadrantExternalWorkers'

const roleIcon: Record<'responsable'|'conductor'|'treballador', React.ReactNode> = {
  responsable: <GraduationCap className="text-blue-700" size={20} />,
  conductor: <Truck className="text-orange-500" size={18} />,
  treballador: <User className="text-green-600" size={18} />,
}

function VehicleIcon({ type }: { type?: string }) {
  if (!type) return null
  switch (normalizeTransportType(type)) {
    case 'camioGran':
    case 'camioGranFred':
      return <Truck className="w-5 h-5 text-blue-800" />
    case 'camioPPlataforma':
    case 'camioPPlataformaFred':
    case 'transport':
      return <Truck className="w-4 h-4 text-green-700" />
    case 'comercial':
    case 'furgonetaPetita':
    case 'furgonetaManteniment':
    case 'furgonetaMitjana':
    case 'furgonetaGran':
      return <Car className="w-5 h-5 text-orange-600" />
    default:
      return <Truck className="w-5 h-5 text-gray-500" />
  }
}

export default function DraftRow({
  row,
  isLocked,
  isActive = false,
  onEdit,
  onDelete,
}: {
  row: Row
  isLocked: boolean
  isActive?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const formatDate = (d: string) => (d ? d.split('-').slice(1).reverse().join('/') : '--/--')
  const formatTime = (t?: string) => (t ? t.substring(0, 5) : '--:--')
  const displayName = row.isExternal
    ? row.name || getExternalWorkerBaseLabel(row.externalType)
    : row.name
  const leadingIcon =
    row.role === 'responsable' && row.isDriver ? (
      <div className="flex items-center gap-1">
        {roleIcon.responsable}
        {roleIcon.conductor}
      </div>
    ) : (
      roleIcon[row.role]
    )
  const jamoneroBadge = row.isJamonero ? (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Jamonero
    </span>
  ) : null

  return (
    <div
      className="
      border-b border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50
      grid gap-2
      grid-cols-1
      sm:grid-cols-[40px_minmax(11rem,1fr)_5rem_4.5rem_4.5rem_4.5rem_minmax(8rem,0.9fr)_4.5rem_3.5rem]
      items-center
    "
      style={
        isActive
          ? {
              backgroundColor: '#eff6ff',
              boxShadow: 'inset 3px 0 0 #2563eb',
            }
          : undefined
      }
    >
      {/* MOBILE LAYOUT */}
      <div className="flex items-start gap-2 sm:hidden">
        <div>{leadingIcon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium text-slate-800">{displayName}</div>
            {jamoneroBadge}
          </div>

          <div className="text-[11px] text-slate-600 mt-0.5">
            {formatDate(row.startDate)} - {formatTime(row.startTime)} - {formatTime(row.endTime)} - {formatTime(row.arrivalTime)}
          </div>

          {row.meetingPoint && <div className="text-[11px] text-slate-600 truncate">Punt: {row.meetingPoint}</div>}

          {row.role === 'conductor' && (
            <div className="text-[11px] flex items-center gap-1 text-slate-600">
              {row.plate || '-'} <VehicleIcon type={row.vehicleType} />
            </div>
          )}
        </div>

        {/* Accions mobil */}
        <RowActions onEdit={onEdit} onDelete={onDelete} disabled={isLocked} />
      </div>

      {/* DESKTOP LAYOUT */}
      <div className="hidden sm:flex items-center justify-center">{leadingIcon}</div>

      <div className="hidden sm:flex items-center gap-2 truncate text-[14px] font-medium text-slate-800">
        <span className="truncate">{displayName || <span className="italic text-gray-400">Sense nom</span>}</span>
        {jamoneroBadge}
      </div>

      <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">{formatDate(row.startDate)}</div>

      <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">{formatTime(row.startTime)}</div>

      <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">{formatTime(row.endTime)}</div>

      <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">{formatTime(row.arrivalTime)}</div>

      <div className="hidden sm:block truncate text-[14px] text-slate-700">
        {row.meetingPoint || <span className="text-gray-400">-</span>}
      </div>

      <div className="hidden sm:flex items-center gap-2 text-[14px] font-medium text-slate-700">
        {row.role === 'conductor' ? (
          <>
            <span>{row.plate || '-'}</span>
            <VehicleIcon type={row.vehicleType} />
          </>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>

      <div className="hidden sm:block">
        <RowActions onEdit={onEdit} onDelete={onDelete} disabled={isLocked} />
      </div>
    </div>
  )
}
