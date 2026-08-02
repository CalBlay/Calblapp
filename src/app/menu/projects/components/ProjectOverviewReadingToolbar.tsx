'use client'

import { useState } from 'react'
import { Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  PROJECT_OVERVIEW_READING_FONT_OPTIONS,
  PROJECT_OVERVIEW_READING_SCALE_OPTIONS,
  type ProjectOverviewReadingFont,
  type ProjectOverviewReadingScale,
} from './project-overview-reading'

type Props = {
  scale: ProjectOverviewReadingScale
  font: ProjectOverviewReadingFont
  onScaleChange: (scale: ProjectOverviewReadingScale) => void
  onFontChange: (font: ProjectOverviewReadingFont) => void
}

export default function ProjectOverviewReadingToolbar({
  scale,
  font,
  onScaleChange,
  onFontChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const activeScale =
    PROJECT_OVERVIEW_READING_SCALE_OPTIONS.find((option) => option.id === scale)?.label || 'L'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative h-9 w-9 shrink-0 border-violet-100 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
          title="Mida i tipus de lletra"
          aria-label="Mida i tipus de lletra de la fitxa"
        >
          <Type className="h-4 w-4" />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-violet-600 px-1 text-[9px] font-bold leading-none text-white">
            {activeScale}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(100vw-2rem,280px)] space-y-4 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600/80">
            Mida del text
          </p>
          <div
            className="mt-2 inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            role="group"
            aria-label="Mida del text"
          >
            {PROJECT_OVERVIEW_READING_SCALE_OPTIONS.map((option) => {
              const active = scale === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.description}
                  aria-pressed={active}
                  onClick={() => onScaleChange(option.id)}
                  className={cn(
                    'min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition',
                    active
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-violet-800'
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-violet-600/80">
            Tipus de lletra
          </label>
          <select
            value={font}
            onChange={(event) => onFontChange(event.target.value as ProjectOverviewReadingFont)}
            className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-400"
            aria-label="Tipus de lletra"
          >
            {PROJECT_OVERVIEW_READING_FONT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
