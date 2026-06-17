// filename: src/app/menu/pissarra/components/PissarraCardCuina.tsx
'use client'

import type { PissarraItem } from '@/hooks/usePissarra'
import Link from 'next/link'
import {
  MapPin,
  Clock,
  Users,
  Coffee,
  Truck,
  UtensilsCrossed,
  ChefHat,
} from 'lucide-react'

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

export default function PissarraCardCuina({
  item,
  canOpenQuadrants = false,
  quadrantsHref,
}: Props) {
  const status = (item.status || '').toLowerCase()
  const statusDot =
    status === 'confirmed'
      ? 'bg-green-500'
      : status === 'draft'
      ? 'bg-blue-500'
      : 'bg-gray-300'

  const group1Drivers = Array.isArray(item.group1Drivers) ? item.group1Drivers : []
  const group1Workers = Array.isArray(item.group1Workers) ? item.group1Workers : []
  const group2Drivers = Array.isArray(item.group2Drivers) ? item.group2Drivers : []
  const group2Workers = Array.isArray(item.group2Workers) ? item.group2Workers : []

  const renderGroup = (
    label: string,
    startTime?: string,
    meetingPoint?: string,
    responsible?: string | null,
    drivers?: string[],
    workers?: string[]
  ) => {
    const people = new Map<string, Set<'responsable' | 'conductor' | 'treballador'>>()
    if (responsible) {
      people.set(responsible, new Set(['responsable']))
    }
    drivers?.forEach((name) => {
      if (!name) return
      const roles = people.get(name) || new Set()
      roles.add('conductor')
      people.set(name, roles)
    })
    workers?.forEach((name) => {
      if (!name) return
      const roles = people.get(name) || new Set()
      roles.add('treballador')
      people.set(name, roles)
    })

    const roleIcons = (roles: Set<'responsable' | 'conductor' | 'treballador'>) => (
      <span className="flex items-center gap-1">
        {roles.has('responsable') && <ChefHat className="w-3 h-3 text-gray-500" />}
        {roles.has('conductor') && <Truck className="w-3 h-3 text-gray-500" />}
        {roles.has('treballador') && <Users className="w-3 h-3 text-gray-500" />}
      </span>
    )

    return (
      <div className="border-t pt-2 mt-2">
        <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-1">
          <Coffee className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-semibold">{label}</span>
          <span className="text-gray-500">Hora inici:</span>
          <span>{startTime || '-'}</span>
        </div>

        <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-1">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate">{meetingPoint || '-'}</span>
        </div>

        <div className="flex flex-col gap-1 text-[12px] text-gray-700">
          {people.size === 0 && <span className="text-gray-400">Sense personal</span>}
          {[...people.entries()].map(([name, roles]) => (
            <div key={name} className="flex items-center gap-2">
              {roleIcons(roles)}
              <span className="font-medium truncate">{name}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-3 sm:p-4 text-xs mb-3">
      {/* Event + hora inici event */}
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
        <div className="flex items-center gap-2 text-gray-700">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span>{item.startTime || '-'}</span>
        </div>
      </div>

      {/* Servei */}
      <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-1">
        <UtensilsCrossed className="w-3.5 h-3.5 text-gray-400" />
        <span className="truncate">{item.servei || '-'}</span>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-2">
        <Users className="w-3.5 h-3.5 text-gray-400" />
        <span className="font-semibold">{item.pax ?? 0}</span>
      </div>

      {/* Ubicacio */}
      {item.location && (
        <div className="flex items-center gap-2 text-[12px] text-gray-700 mb-2">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate">{item.location}</span>
        </div>
      )}

      {renderGroup(
        'G1',
        item.group1StartTime,
        item.group1MeetingPoint,
        item.group1Responsible || null,
        group1Drivers,
        group1Workers
      )}
      {item.group2StartTime ||
      item.group2MeetingPoint ||
      item.group2Responsible ||
      group2Drivers.length > 0 ||
      group2Workers.length > 0
        ? renderGroup(
            'G2',
            item.group2StartTime,
            item.group2MeetingPoint,
            item.group2Responsible || null,
            group2Drivers,
            group2Workers
          )
        : null}
    </div>
  )
}
