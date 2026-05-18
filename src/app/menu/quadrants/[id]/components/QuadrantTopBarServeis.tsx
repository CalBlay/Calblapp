'use client'

import { Button } from '@/components/ui/button'
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
import type { GenerationScope, QuadrantMode } from './quadrantModalTypes'
import type { ServiceJamoneroAssignment } from '../phaseConfig'
import type { ResponsableAvailabilityOption } from '../hooks/useQuadrantFormState'

type IdName = { id: string; name: string }

type ServiceTotals = {
  workers: number
  drivers: number
  responsables: number
  jamoneros: number
}

type Props = {
  mode: QuadrantMode
  startTime: string
  setStartTime: (value: string) => void
  endTime: string
  setEndTime: (value: string) => void
  manualResp: string
  setManualResp: (value: string) => void
  availableResponsables: ResponsableAvailabilityOption[]
  availableJamoneros: IdName[]
  serviceJamoneroAssignments: ServiceJamoneroAssignment[]
  setServiceJamoneroCount: (count: number) => void
  updateServiceJamoneroAssignment: (
    id: string,
    patch: Partial<ServiceJamoneroAssignment>
  ) => void
  showJamoneroDetails: boolean
  setShowJamoneroDetails: React.Dispatch<React.SetStateAction<boolean>>
  vestimentModelChoice: string
  setVestimentModelChoice: (value: string) => void
  serveisVestimentModels: string[]
  serviceTotals: ServiceTotals
  isMultiDayEvent: boolean
  generationScope: GenerationScope
  setGenerationScope: (value: GenerationScope) => void
}

export default function QuadrantTopBarServeis({
  mode,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  manualResp,
  setManualResp,
  availableResponsables,
  availableJamoneros,
  serviceJamoneroAssignments,
  setServiceJamoneroCount,
  updateServiceJamoneroAssignment,
  showJamoneroDetails,
  setShowJamoneroDetails,
  vestimentModelChoice,
  setVestimentModelChoice,
  serveisVestimentModels,
  serviceTotals,
  isMultiDayEvent,
  generationScope,
  setGenerationScope,
}: Props) {
  const topResponsibleOptions = availableResponsables.filter((resp) => resp.status === 'available')
  const topResponsibleIds = new Set(topResponsibleOptions.map((resp) => resp.id))
  const topResponsibleValue =
    mode === 'manual'
      ? topResponsibleIds.has(manualResp)
        ? manualResp
        : ''
      : topResponsibleIds.has(manualResp)
        ? manualResp
        : '__auto__'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,148px)_minmax(0,120px)_minmax(0,120px)_minmax(0,170px)_minmax(0,1fr)_auto] md:items-end md:justify-items-stretch md:gap-x-3 md:gap-y-0">
        <div className="min-w-0">
          <Label>Responsable</Label>
          <Select value={topResponsibleValue} onValueChange={setManualResp}>
            <SelectTrigger className="h-10 w-full max-w-full">
              <SelectValue
                placeholder={mode === 'manual' ? 'Selecciona un responsable...' : 'Automatic'}
                className="min-w-0 truncate text-left [&>span]:truncate"
              />
            </SelectTrigger>
            <SelectContent>
              {mode !== 'manual' && <SelectItem value="__auto__">Automatic</SelectItem>}
              {topResponsibleOptions.map((resp) => (
                <SelectItem key={resp.id} value={resp.id}>
                  {resp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label>Hora Inici</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="min-w-0">
          <Label>Hora Fi</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="min-w-0">
          <Label>Jamoneros</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              className="w-[88px] text-center tabular-nums"
              value={serviceJamoneroAssignments.length}
              onChange={(e) =>
                setServiceJamoneroCount(
                  Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value))
                )
              }
            />
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-3"
              disabled={
                serviceJamoneroAssignments.length === 0 ||
                (mode !== 'semi' && mode !== 'manual')
              }
              onClick={() => setShowJamoneroDetails((prev) => !prev)}
            >
              {showJamoneroDetails ? 'Amaga' : 'Detall'}
            </Button>
          </div>
        </div>
        <div className="min-w-0">
          <Label htmlFor="vestiment-model-serveis">Model de vestimenta</Label>
          <div className="mt-1 flex flex-col gap-1.5 md:mt-0 md:flex-row md:items-end md:gap-2">
            <Select value={vestimentModelChoice} onValueChange={setVestimentModelChoice}>
              <SelectTrigger
                id="vestiment-model-serveis"
                className="h-10 w-full shrink-0 md:w-[168px]"
              >
                <SelectValue
                  placeholder="Selecciona..."
                  className="min-w-0 flex-1 truncate text-left [&>span]:truncate"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-- Cap --</SelectItem>
                {vestimentModelChoice !== '__none__' &&
                !serveisVestimentModels.includes(vestimentModelChoice) ? (
                  <SelectItem value={vestimentModelChoice}>{vestimentModelChoice}</SelectItem>
                ) : null}
                {serveisVestimentModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-600 md:pb-px">
              <span className="font-semibold text-slate-700">Fase serveis</span>{' '}
              <span className="text-slate-500">
                · Treballadors {serviceTotals.workers} · Conductors {serviceTotals.drivers} · Fases{' '}
                {serviceTotals.responsables}
                {serviceTotals.jamoneros > 0 ? ` · Jamoneros ${serviceTotals.jamoneros}` : ''}
              </span>
            </p>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 items-end justify-end md:justify-self-end">
          <GenerationScopeToggle
            isMultiDayEvent={isMultiDayEvent}
            generationScope={generationScope}
            setGenerationScope={setGenerationScope}
          />
        </div>
      </div>
      {showJamoneroDetails &&
        (mode === 'semi' || mode === 'manual') &&
        serviceJamoneroAssignments.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {serviceJamoneroAssignments.map((assignment, index) => (
                <div key={assignment.id}>
                  <Label>Jamonero {index + 1}</Label>
                  <Select
                    value={
                      assignment.mode === 'manual' && assignment.personnelId
                        ? assignment.personnelId
                        : '__auto__'
                    }
                    onValueChange={(value) =>
                      updateServiceJamoneroAssignment(assignment.id, {
                        mode: value === '__auto__' ? 'auto' : 'manual',
                        personnelId: value === '__auto__' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Automatic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Automatic</SelectItem>
                      {availableJamoneros.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      {serveisVestimentModels.length === 0 && (
        <p className="text-xs text-amber-700">
          No hi ha models definits. Defineix-los a Premisses (Serveis).
        </p>
      )}
    </div>
  )
}
