'use client'

import { useState } from 'react'
import { ChevronDown, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Props = {
  context: string
  strategy: string
}

export default function ProjectMissionStrip({ context, strategy }: Props) {
  const [expanded, setExpanded] = useState(false)
  const definition = context.trim()
  const objectives = strategy.trim()

  if (!definition && !objectives) return null

  const needsExpand =
    definition.length > 140 ||
    objectives.length > 140 ||
    definition.split('\n').length > 2 ||
    objectives.split('\n').length > 2

  return (
    <div className="border-t border-violet-200/70 bg-gradient-to-r from-violet-50/90 via-white to-fuchsia-50/50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
          <Target className="h-4 w-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                Definició del projecte
              </p>
              <p
                className={cn(
                  'mt-1.5 text-base leading-relaxed text-slate-800',
                  !expanded && needsExpand && 'line-clamp-2'
                )}
              >
                {definition || 'Sense definició del projecte.'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">
                Objectius estratègics
              </p>
              <p
                className={cn(
                  'mt-1.5 text-base leading-relaxed text-slate-800',
                  !expanded && needsExpand && 'line-clamp-2'
                )}
              >
                {objectives || 'Sense objectius estratègics.'}
              </p>
            </div>
          </div>

          {needsExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-8 gap-1 px-2 text-violet-700 hover:bg-violet-100 hover:text-violet-900"
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              />
              {expanded ? 'Mostrar menys' : 'Mostrar més'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
