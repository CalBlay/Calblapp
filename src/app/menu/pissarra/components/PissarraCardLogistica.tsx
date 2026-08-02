// filename: src/app/menu/pissarra/components/PissarraCardLogistica.tsx
'use client'

import type { PissarraItem } from '@/hooks/usePissarra'
import Link from 'next/link'
import { MapPin, Clock, Users, User, Truck, ChefHat } from 'lucide-react'

type Props = {
  item: PissarraItem
  canOpenQuadrants?: boolean
  quadrantsHref?: string
}

const formatEventTitle = (title?: string) => {
  if (!title) return '-'
  const [firstPart] = title.split('/')
  const trimmed = firstPart.trim()
  return trimmed || '-'
}

const phaseBadgeClass = (label?: string) => {
  const value = (label || '').toLowerCase()
  if (value.includes('entrega')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (value.includes('recollida') || value.includes('recogida')) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (value.includes('event')) {
    return 'bg-slate-100 text-slate-600 border-slate-200'
  }
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

export default function PissarraCardLogistica({
  item,
  canOpenQuadrants = false,
  quadrantsHref,
}: Props) {
  const vehicles = Array.isArray(item.vehicles) ? item.vehicles : []
  const workers = Array.isArray(item.workers) ? item.workers : []
  const status = (item.status || '').toLowerCase()
  const statusDot =
    status === 'confirmed'
      ? 'bg-green-500'
      : status === 'draft'
      ? 'bg-blue-500'
      : 'bg-gray-300'

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-3 sm:p-4 text-xs mb-3">

      {/* Event + hores */}
      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
          <div className="font-semibold text-gray-800 text-[13px] truncate min-w-0">
            {canOpenQuadrants && quadrantsHref ? (
              <Link
                href={quadrantsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer hover:underline"
                title="Obre el quadrant (nova pestanya)"
              >
                {formatEventTitle(item.eventName)}
              </Link>
            ) : (
              formatEventTitle(item.eventName)
            )}
          </div>
        </div>
        {item.phaseLabel && (
          <span
            className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${phaseBadgeClass(
              item.phaseLabel
            )}`}
          >
            {item.phaseLabel}
          </span>
        )}
        <div className="flex items-center gap-2 text-gray-700">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span>{item.startTime || '-'}</span>
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          <span>{item.arrivalTime || '-'}</span>
        </div>
      </div>

      {/* Ubicacio */}
      {item.location && (
        <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-2">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate">{item.location}</span>
        </div>
      )}

      {/* Vehicles */}
      <div className="flex items-start gap-2 text-[12px] text-gray-700 mb-2">
        <div className="space-y-1 flex-1">
          {vehicles.length === 0 && <span className="text-gray-400">Sense vehicles</span>}
          {vehicles.map((v, idx) => {
            const isCuina = v?.source?.toLowerCase().includes('cuina')
            const Icon = Truck
            const iconColor = 'text-gray-500'
            const ConductorIcon = isCuina ? ChefHat : User
            const conductorColor = isCuina ? 'text-orange-500' : 'text-gray-600'

            return (
              <div
                key={v?.plate ? `plate-${v.source || 'src'}-${v.plate}` : `vehicle-${idx}`}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2"
              >
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                <span className="font-semibold">{v.plate || '-'}</span>
                <span className="text-gray-600 flex items-center gap-1 text-[11px]">
                  <ConductorIcon className={`w-3 h-3 ${conductorColor}`} />
                  {v.conductor || '-'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Treballadors */}
      <div className="flex items-start gap-2 text-[12px] text-gray-700">
        <Users className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
        <div className="space-y-1 flex-1">
          {workers.length === 0 && <span className="text-gray-400">Sense treballadors</span>}
          {workers.map((w, idx) => (
            <span
              key={`${w || '-'}-${idx}`}
              className="inline-block bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 mr-1 mb-1"
            >
              {w || '-'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
