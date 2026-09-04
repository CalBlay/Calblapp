'use client'

import { X } from 'lucide-react'
import type { CalendarCodeStatus, CalendarLN, CalendarStage } from './CalendarFilters'

const LN_LABELS: Record<string, string> = {
  empresa: 'Empresa',
  casaments: 'Casaments',
  'grups restaurants': 'Grups Restaurants',
  foodlovers: 'Foodlovers',
  agenda: 'Agenda',
  altres: 'Altres',
}

const STAGE_LABELS: Record<CalendarStage, string> = {
  all: 'Tots',
  confirmat: 'Confirmats',
  pressupost: 'Pressupost enviat',
  calentet: 'Prereserva / Calentet',
}

const CODE_LABELS: Record<CalendarCodeStatus, string> = {
  all: 'Tots',
  missing: 'Sense codi',
  review: 'A revisar',
  confirmed: 'Confirmats',
}

type Props = {
  ln: CalendarLN[]
  stage: string
  commercial: string[]
  location: string[]
  codeStatus: string
  showCodeStatus?: boolean
  onRemoveLn: (value: CalendarLN) => void
  onClearStage: () => void
  onRemoveCommercial: (value: string) => void
  onRemoveLocation: (value: string) => void
  onClearCodeStatus: () => void
  onClearAll: () => void
}

export default function CalendarActiveFilters({
  ln,
  stage,
  commercial,
  location,
  codeStatus,
  showCodeStatus,
  onRemoveLn,
  onClearStage,
  onRemoveCommercial,
  onRemoveLocation,
  onClearCodeStatus,
  onClearAll,
}: Props) {
  const hasLn = ln.length > 0
  const hasStage = stage !== 'all'
  const hasCommercial = commercial.length > 0
  const hasLocation = location.length > 0
  const hasCode = showCodeStatus && codeStatus !== 'all'

  if (!hasLn && !hasStage && !hasCommercial && !hasLocation && !hasCode) return null

  return (
    <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex">
      {ln.map((value) => (
        <FilterChip
          key={`ln-${value}`}
          label={LN_LABELS[value] || value}
          onRemove={() => onRemoveLn(value)}
        />
      ))}
      {hasStage && (
        <FilterChip
          label={STAGE_LABELS[stage as CalendarStage] || stage}
          onRemove={onClearStage}
        />
      )}
      {commercial.map((name) => (
        <FilterChip
          key={`com-${name}`}
          label={name}
          onRemove={() => onRemoveCommercial(name)}
        />
      ))}
      {location.map((name) => (
        <FilterChip
          key={`location-${name}`}
          label={name}
          onRemove={() => onRemoveLocation(name)}
        />
      ))}
      {hasCode && (
        <FilterChip
          label={CODE_LABELS[codeStatus as CalendarCodeStatus] || codeStatus}
          onRemove={onClearCodeStatus}
        />
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
      >
        Netejar
      </button>
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full p-0.5 hover:bg-blue-100"
        aria-label={`Treure filtre ${label}`}
      >
        <X size={12} />
      </button>
    </span>
  )
}
