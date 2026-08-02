'use client'

import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PhaseCardProps = {
  label: string
  description?: string
  selected: boolean
  visible: boolean
  compact?: boolean
  /** Amaga el títol a l'esquerra (es mostra al footer o quan la fase està tancada). */
  hideHeaderLabel?: boolean
  /** Un sol marcador d'estat en lloc de «Inclosa» + «Amaga». */
  unifiedMarker?: boolean
  onToggleSelection: () => void
  onToggleVisibility: () => void
  children: ReactNode
}

export function PhaseUnifiedMarker({
  selected,
  visible,
  compact,
  onToggleSelection,
  onToggleVisibility,
}: Pick<
  PhaseCardProps,
  'selected' | 'visible' | 'compact' | 'onToggleSelection' | 'onToggleVisibility'
>) {
  const handleClick = () => {
    if (!selected) {
      onToggleSelection()
      if (!visible) onToggleVisibility()
      return
    }
    if (visible) {
      onToggleVisibility()
      return
    }
    onToggleVisibility()
  }

  const title = !selected
    ? 'Fase no inclosa — clic per incloure'
    : visible
    ? 'Fase activa — clic per amagar'
    : 'Fase inclosa (oculta) — clic per mostrar'

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={cn(
        'shrink-0 rounded-full border-2 transition',
        compact ? 'h-5 w-5' : 'h-6 w-6',
        !selected && 'border-slate-300 bg-slate-100 hover:border-slate-400',
        selected && visible && 'border-indigo-600 bg-indigo-600 hover:bg-indigo-700',
        selected && !visible && 'border-indigo-600 bg-white hover:bg-indigo-50'
      )}
    />
  )
}

export default function PhaseCard({
  label,
  description,
  selected,
  visible,
  compact = false,
  hideHeaderLabel = false,
  unifiedMarker = false,
  onToggleSelection,
  onToggleVisibility,
  children,
}: PhaseCardProps) {
  const markerInFooter = hideHeaderLabel && unifiedMarker && visible && selected
  const showHeader = !markerInFooter

  return (
    <div
      className={cn(
        'rounded-lg border transition',
        compact ? 'p-2' : 'rounded-xl p-3',
        visible ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200 bg-white'
      )}
    >
      {showHeader ? (
        <div
          className={cn(
            'flex items-center gap-1.5',
            hideHeaderLabel || unifiedMarker ? 'justify-end' : 'justify-between'
          )}
        >
          {!hideHeaderLabel ? (
            <p className={cn('font-semibold text-slate-700', compact ? 'text-xs' : 'text-sm')}>
              {label}
            </p>
          ) : null}

          {hideHeaderLabel && unifiedMarker ? (
            <span
              className={cn(
                'font-semibold uppercase tracking-wide text-slate-600',
                compact ? 'text-[11px]' : 'text-xs'
              )}
            >
              {label}
            </span>
          ) : null}

          {unifiedMarker ? (
            <PhaseUnifiedMarker
              selected={selected}
              visible={visible}
              compact={compact}
              onToggleSelection={onToggleSelection}
              onToggleVisibility={onToggleVisibility}
            />
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                className={cn(
                  'rounded-full font-semibold',
                  compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
                  selected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={onToggleSelection}
              >
                {selected ? 'Inclosa' : 'No inclosa'}
              </Button>
              <Button
                type="button"
                className={cn(
                  'rounded-full font-semibold',
                  compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
                  visible
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                onClick={onToggleVisibility}
              >
                {visible ? 'Amaga' : 'Mostra'}
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      {visible && children ? (
        <div className={compact ? 'mt-2 space-y-2' : 'mt-4 space-y-3'}>{children}</div>
      ) : null}
    </div>
  )
}
