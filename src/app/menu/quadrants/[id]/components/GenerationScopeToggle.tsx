'use client'

import { Button } from '@/components/ui/button'

type Props = {
  isMultiDayEvent: boolean
  generationScope: 'day' | 'event'
  setGenerationScope: (scope: 'day' | 'event') => void
}

export default function GenerationScopeToggle({
  isMultiDayEvent,
  generationScope,
  setGenerationScope,
}: Props) {
  if (!isMultiDayEvent) return null

  return (
    <div className="flex items-center justify-end">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 shadow-sm">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={generationScope === 'day'}
          className={
            generationScope === 'day'
              ? 'h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-600'
              : 'h-7 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700'
          }
          onClick={() => setGenerationScope('day')}
        >
          1 dia
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={generationScope === 'event'}
          className={
            generationScope === 'event'
              ? 'h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-600'
              : 'h-7 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700'
          }
          onClick={() => setGenerationScope('event')}
        >
          Multi dia
        </Button>
      </div>
    </div>
  )
}
