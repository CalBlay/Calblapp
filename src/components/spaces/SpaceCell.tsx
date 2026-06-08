// file: src/components/spaces/SpaceCell.tsx
'use client'

import { colorByStage } from '@/lib/colors'
import type { Stage } from '@/services/spaces/spaces'
import { AlertTriangle } from 'lucide-react'

export interface SpaceCellEvent {
  eventName?: string
  NomEvent?: string
  commercial?: string
  Comercial?: string
  numPax?: number
  NumPax?: number
  stage?: Stage
  Stage?: Stage
  discarded?: boolean
  reason?: string
  warning?: boolean
}

interface SpaceCellProps {
  event: SpaceCellEvent
}

/**
 * 🔹 SpaceCell
 * Targeta d’esdeveniment dins la graella setmanal d’Espais.
 *
 * Disseny:
 * - Colors suaus, zero fatiga visual
 * - Text fosc (mai blanc)
 * - Mobile-first, lectura ràpida
 * - Totalment alineat amb Calendar (StageDot)
 */
export default function SpaceCell({ event }: SpaceCellProps) {
  /* ──────────────────────────────
     Normalització de dades
     ────────────────────────────── */
  const eventName = event.eventName || event.NomEvent || ''
  const commercial = event.commercial || event.Comercial || ''
  const numPax = event.numPax ?? event.NumPax ?? 0
  const stage = event.stage || event.Stage || 'verd'

  const isDiscarded = event.discarded ?? false
  const hasWarning = event.warning ?? false
  const reason = event.reason ?? ''

  /* ──────────────────────────────
     Colors i estats visuals
     ────────────────────────────── */
  const baseColor = isDiscarded
    ? 'bg-red-50 text-red-800 border border-red-200'
    : `${colorByStage(stage)} text-gray-800 border border-black/5`

  /* ──────────────────────────────
     Textos i tooltip
     ────────────────────────────── */
  const shortEventMobile =
    eventName.length > 26 ? `${eventName.slice(0, 26).trim()}…` : eventName
  const shortEventDesktop =
    eventName.length > 48 ? `${eventName.slice(0, 48).trim()}…` : eventName

  const tooltip = [
    eventName,
    commercial,
    numPax ? `${numPax} pax` : '',
    hasWarning && reason ? `⚠️ ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  /* ──────────────────────────────
     Render
     ────────────────────────────── */
  return (
    <div
      className={`
        rounded-md
        px-2 py-1 lg:px-2.5 lg:py-1.5
        min-h-[38px] lg:min-h-[44px]
        flex flex-col justify-center
        text-[11px] lg:text-xs
        ${baseColor}
        cursor-pointer
        shadow-sm
        hover:shadow
        transition
      `}
      title={tooltip || 'Esdeveniment'}
    >
      {/* Nom de l’esdeveniment */}
      {eventName && (
        <div className="flex items-center justify-center sm:justify-start gap-1 leading-tight">
          <span
            className={`font-semibold lg:hidden truncate ${
              isDiscarded ? 'text-red-800' : 'text-inherit'
            }`}
          >
            {shortEventMobile}
          </span>
          <span
            className={`font-semibold hidden lg:block line-clamp-2 ${
              isDiscarded ? 'text-red-800' : 'text-inherit'
            }`}
          >
            {shortEventDesktop}
          </span>

          {hasWarning && (
           <AlertTriangle
  className="w-3 h-3 text-red-600 shrink-0"
  {...({ title: reason || 'Possible conflicte' } as React.SVGProps<SVGSVGElement>)}
/>

          )}
        </div>
      )}

      {/* Comercial */}
      {commercial && (
        <span
          className={`text-[10px] lg:text-[11px] truncate opacity-70 ${
            isDiscarded ? 'text-red-700' : ''
          }`}
        >
          {commercial}
        </span>
      )}

      {/* PAX */}
      {numPax > 0 && (
        <span
          className={`text-[10px] lg:text-[11px] font-medium opacity-80 ${
            isDiscarded ? 'text-red-700' : ''
          }`}
        >
          {numPax} pax
        </span>
      )}
    </div>
  )
}
