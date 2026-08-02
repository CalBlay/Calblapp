//filename: src/app/menu/pissarra/components/PissarrCard.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { formatDateString } from '@/lib/formatDate'
import { colorByLN } from '@/lib/colors'
import type { PissarraItem } from '@/hooks/usePissarra'
import {
  MapPin,
  User,
  Users,
  Coffee,
  Briefcase,
  Clock,
  Calendar,
} from 'lucide-react'

interface Props {
  item: PissarraItem
  canEdit: boolean
  onUpdate: (id: string, payload: Partial<PissarraItem>) => Promise<void>
  canOpenQuadrants?: boolean
  quadrantsHref?: string
}

const formatEventTitle = (title?: string) => {
  if (!title) return '—'
  const [firstPart] = title.split('/')
  const trimmed = firstPart.trim()
  return trimmed || '—'
}

/**
 * 🪶 PissarraCard v2
 * - Hora inici en una línia pròpia
 * - Icones Lucide
 * - Compacta i clara per mòbil-first
 */
export default function PissarraCard({
  item,
  canEdit,
  onUpdate,
  canOpenQuadrants = false,
  quadrantsHref,
}: Props) {
  const [local, setLocal] = useState(item)
  const [editing, setEditing] = useState<string | null>(null)

  const handleBlur = async (field: keyof PissarraItem) => {
    setEditing(null)
    if (local[field] !== item[field]) {
      await onUpdate(item.id, { [field]: local[field] })
    }
  }

  const handleChange = (field: keyof PissarraItem, value: string) => {
    setLocal((p) => ({ ...p, [field]: value }))
  }

  const normalizedPhase = local.phaseLabel?.trim().toLowerCase()
  const isMuntatge = normalizedPhase
    ? ['muntatge', 'montatge', 'montaje'].some((word) => normalizedPhase.includes(word))
    : false
  const showPhase = isMuntatge
  const formattedPhaseDate = local.phaseDate
    ? formatDateString(local.phaseDate) ?? undefined
    : undefined

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm p-3 text-xs mb-2">
      {/* 🔹 Línia de negoci */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div
          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full ${colorByLN(
            local.LN
          )}`}
        >
          {local.LN || 'Altres'}
        </div>
        {/* Muntatge badge removed; keep only the line at the bottom */}
      </div>

      {/* 🔸 Nom Event + Hora Inici */}
      <div className="flex flex-col mb-2">
        <div className="font-semibold text-gray-800 text-[13px] truncate">
          {canEdit && editing === 'eventName' ? (
            <Input
              autoFocus
              value={local.eventName || ''}
              onChange={(e) => handleChange('eventName', e.target.value)}
              onBlur={() => handleBlur('eventName')}
              className="h-6 text-[12px]"
            />
          ) : (
            <>
              {canOpenQuadrants && quadrantsHref ? (
                <Link
                  href={quadrantsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer hover:underline"
                  title="Obre el quadrant (nova pestanya)"
                >
                  {formatEventTitle(local.eventName)}
                </Link>
              ) : (
                <span
                  onClick={() => canEdit && setEditing('eventName')}
                  className={canEdit ? 'cursor-text hover:underline' : ''}
                >
                  {formatEventTitle(local.eventName)}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 text-gray-600 mt-0.5">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          {canEdit && editing === 'startTime' ? (
            <Input
              type="time"
              autoFocus
              value={local.startTime || ''}
              onChange={(e) => handleChange('startTime', e.target.value)}
              onBlur={() => handleBlur('startTime')}
              className="h-6 text-[12px]"
            />
          ) : (
            <span
              onClick={() => canEdit && setEditing('startTime')}
              className={canEdit ? 'cursor-text hover:underline' : ''}
            >
              {local.startTime || '—'}
            </span>
          )}
        </div>
      </div>

      {/* 🔹 Dades addicionals amb icones */}
        <div className="flex flex-col gap-1.5 text-[12px]">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-gray-400" />
        
            <span className="text-gray-700 font-medium truncate">{local.responsableName || '—'}</span>
          </div>

        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-gray-400" />
          
          <span className="text-gray-700 font-medium truncate">{local.location || '—'}</span>
        </div>

        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-500">Pax:</span>
          <span className="text-gray-800 font-semibold">{local.pax || 0}</span>
        </div>

        <div className="flex items-center gap-2">
          <Coffee className="w-3.5 h-3.5 text-gray-400" />
          
          <span className="text-gray-700 font-medium truncate">{local.servei || '—'}</span>
        </div>

        <div className="flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-gray-400" />
         
          <span className="text-gray-700 font-medium truncate">{local.comercial || '—'}</span>
        </div>
        {showPhase && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-700 font-semibold">Muntatge</span>
            {formattedPhaseDate && (
              <span className="text-gray-500">{formattedPhaseDate}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
