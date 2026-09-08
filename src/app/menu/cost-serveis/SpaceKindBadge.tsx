'use client'

import { cn } from '@/lib/utils'
import {
  SPACE_KIND_LABELS,
  type SpaceKind,
} from '@/lib/costServeis/spaceOwnership'

export function SpaceKindBadge({
  kind,
  compact,
}: {
  kind: SpaceKind | null | undefined
  compact?: boolean
}) {
  if (!kind) {
    return <span className="text-slate-400">{compact ? '—' : 'Sense classificar'}</span>
  }
  const isPropi = kind === 'Propi'
  return (
    <span
      title={SPACE_KIND_LABELS[kind]}
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        isPropi
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-100 text-slate-700'
      )}
    >
      {compact ? (isPropi ? 'Pròpia' : 'Extern') : SPACE_KIND_LABELS[kind]}
    </span>
  )
}
