'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import GenerationScopeToggle from './GenerationScopeToggle'
import type { GenerationScope } from './quadrantModalTypes'

type Props = {
  startTime: string
  setStartTime: (value: string) => void
  endTime: string
  setEndTime: (value: string) => void
  isMultiDayEvent: boolean
  generationScope: GenerationScope
  setGenerationScope: (value: GenerationScope) => void
}

export default function QuadrantTopBarLogistica({
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  isMultiDayEvent,
  generationScope,
  setGenerationScope,
}: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-[180px_180px_auto] items-end">
      <div>
        <Label>Hora Inici</Label>
        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div>
        <Label>Hora Fi</Label>
        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <GenerationScopeToggle
        isMultiDayEvent={isMultiDayEvent}
        generationScope={generationScope}
        setGenerationScope={setGenerationScope}
      />
    </div>
  )
}
