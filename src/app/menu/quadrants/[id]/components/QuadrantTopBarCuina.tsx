'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import GenerationScopeToggle from './GenerationScopeToggle'
import type { GenerationScope } from './quadrantModalTypes'

type ResponsableOption = { id: string; name: string }

type Props = {
  startTime: string
  setStartTime: (value: string) => void
  endTime: string
  setEndTime: (value: string) => void
  manualResp: string
  setManualResp: (value: string) => void
  availableResponsables: ResponsableOption[]
  cuinaTotals: { workers: number; drivers: number; responsables: number }
  isMultiDayEvent: boolean
  generationScope: GenerationScope
  setGenerationScope: (value: GenerationScope) => void
}

export default function QuadrantTopBarCuina({
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  manualResp,
  setManualResp,
  availableResponsables,
  cuinaTotals,
  isMultiDayEvent,
  generationScope,
  setGenerationScope,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(0,260px)_1fr_auto] xl:items-end">
        <div className="min-w-0">
          <Label>Hora Inici</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="min-w-0">
          <Label>Hora Fi</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <Label>Responsable principal (esdeveniment)</Label>
          <Select value={manualResp} onValueChange={setManualResp}>
            <SelectTrigger className="h-10 w-full max-w-full xl:max-w-[260px]">
              <SelectValue placeholder="Selecciona un responsable…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">— Automàtic —</SelectItem>
              {availableResponsables.map((resp) => (
                <SelectItem key={resp.id} value={resp.id}>
                  {resp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <div className="text-left leading-tight sm:text-right xl:mr-1">
            <div className="text-xs font-semibold text-slate-700">Fase cuina</div>
            <div className="text-[11px] text-slate-500">
              Treballadors {cuinaTotals.workers} · Conductors {cuinaTotals.drivers} · Grups{' '}
              {cuinaTotals.responsables}
            </div>
          </div>
        </div>
        <div className="flex items-end justify-end sm:col-span-2 xl:col-span-1">
          <GenerationScopeToggle
            isMultiDayEvent={isMultiDayEvent}
            generationScope={generationScope}
            setGenerationScope={setGenerationScope}
          />
        </div>
      </div>
    </div>
  )
}
