'use client'

import { useState, type ReactNode } from 'react'
import { GraduationCap, Shirt } from 'lucide-react'
import { cn } from '@/lib/utils'
import GenerationScopeToggle from './GenerationScopeToggle'
import QuadrantEditorIconActions from './QuadrantEditorIconActions'
import type { AutoPreviewResponse, GenerationScope, QuadrantMode } from './quadrantModalTypes'
import type { ResponsableAvailabilityOption } from '../hooks/useQuadrantFormState'
import { mergeResponsibleCandidatePools } from '../lib/quadrantPayloadShared'
import { isResponsiblePerson } from '@/lib/personnelRoles'

type EditorActionsProps = {
  loading: boolean
  canAutoGen: boolean
  mode: QuadrantMode
  isQuadrantCoreDept: boolean
  autoPreview: AutoPreviewResponse | null
  autoPreviewLoading: boolean
  onDelete: () => void | Promise<void>
  onSave: (confirmAfterSave: boolean) => void
  deleting?: boolean
  hasPersistedDraft?: boolean
}

type Props = {
  mode: QuadrantMode
  manualResp: string
  setManualResp: (value: string) => void
  availableResponsables: ResponsableAvailabilityOption[]
  availableConductors?: Array<{ id: string; name: string }>
  isMultiDayEvent: boolean
  generationScope: GenerationScope
  setGenerationScope: (value: GenerationScope) => void
  vestimentModelChoice: string
  setVestimentModelChoice: (value: string) => void
  serveisVestimentModels: string[]
  surveySlot?: ReactNode
  editorActions?: EditorActionsProps
  embedded?: boolean
}

export default function QuadrantTopBarServeis({
  mode,
  manualResp,
  setManualResp,
  availableResponsables,
  availableConductors = [],
  isMultiDayEvent,
  generationScope,
  setGenerationScope,
  vestimentModelChoice,
  setVestimentModelChoice,
  serveisVestimentModels,
  surveySlot,
  editorActions,
  embedded = false,
}: Props) {
  const [vestimentOpen, setVestimentOpen] = useState(false)
  const [responsibleOpen, setResponsibleOpen] = useState(false)
  const vestimentActive = vestimentModelChoice !== '__none__' && Boolean(vestimentModelChoice)

  const topResponsibleOptions = availableResponsables.filter(
    (resp) => resp.status === 'available' && isResponsiblePerson(resp)
  )
  const responsibleCandidatePools = mergeResponsibleCandidatePools(
    topResponsibleOptions,
    availableConductors
  )
  const topResponsibleIds = new Set(responsibleCandidatePools.map((resp) => resp.id))
  const normalizeResponsible = (value?: string) =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  const manualRespKey = normalizeResponsible(manualResp)
  const matchedResponsible = responsibleCandidatePools.find(
    (resp) => resp.id === manualResp || normalizeResponsible(resp.name) === manualRespKey
  )
  const responsibleActive =
    mode === 'manual'
      ? Boolean(manualResp && matchedResponsible)
      : manualResp === '__auto__' || topResponsibleIds.has(manualResp)
  const selectedResponsibleName =
    matchedResponsible?.name ||
    (manualResp && manualResp !== '__auto__' && !topResponsibleIds.has(manualResp)
      ? String(manualResp).trim()
      : null) ||
    null
  const responsibleLabel =
    mode !== 'manual' && manualResp === '__auto__'
      ? 'Automàtic'
      : selectedResponsibleName || (mode === 'manual' ? 'Sense responsable' : 'Sense assignar')
  const vestimentLabel =
    vestimentActive && vestimentModelChoice !== '__none__' ? vestimentModelChoice : 'Sense vestiment'

  return (
    <div
      className={
        embedded
          ? 'border-b border-slate-200 bg-slate-50/60 px-2 py-1.5'
          : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isMultiDayEvent ? (
            <GenerationScopeToggle
              isMultiDayEvent={isMultiDayEvent}
              generationScope={generationScope}
              setGenerationScope={setGenerationScope}
            />
          ) : (
            <span className="inline-flex h-8 items-center rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white">
              1 dia
            </span>
          )}

          {surveySlot ? <div className="flex items-center">{surveySlot}</div> : null}

          <div className="relative">
            <button
              type="button"
              title={`Responsable: ${responsibleLabel}`}
              aria-label={`Responsable: ${responsibleLabel}`}
              onClick={() => {
                setResponsibleOpen((prev) => !prev)
                setVestimentOpen(false)
              }}
              className={cn(
                'relative inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-sm transition',
                responsibleActive
                  ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{responsibleLabel}</span>
            </button>

            {responsibleOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="sticky top-0 bg-white pb-1 text-[11px] font-medium text-slate-600">
                  Responsable (tot el quadrant)
                </div>
                <div className="space-y-0.5">
                  {mode !== 'manual' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setManualResp('__auto__')
                        setResponsibleOpen(false)
                      }}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                        manualResp === '__auto__' && 'bg-blue-50 font-medium text-blue-800'
                      )}
                    >
                      Automàtic
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setManualResp('')
                      setResponsibleOpen(false)
                    }}
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100',
                      !manualResp && 'bg-blue-50 font-medium text-blue-800'
                    )}
                  >
                    {mode === 'manual' ? 'Sense responsable' : 'Sense assignar'}
                  </button>
                  {topResponsibleOptions.map((resp) => (
                    <button
                      key={resp.id}
                      type="button"
                      onClick={() => {
                        setManualResp(resp.id)
                        setResponsibleOpen(false)
                      }}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                        (manualResp === resp.id ||
                          normalizeResponsible(manualResp) === normalizeResponsible(resp.name)) &&
                          'bg-blue-50 font-medium text-blue-800'
                      )}
                    >
                      {resp.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              title={`Vestiment: ${vestimentLabel}`}
              aria-label={`Vestiment: ${vestimentLabel}`}
              onClick={() => {
                setVestimentOpen((prev) => !prev)
                setResponsibleOpen(false)
              }}
              className={cn(
                'relative inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-sm transition',
                vestimentActive
                  ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Shirt className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{vestimentLabel}</span>
            </button>

            {vestimentOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Vestiment (tot el quadrant)
                </label>
                <select
                  value={vestimentModelChoice}
                  onChange={(e) => {
                    setVestimentModelChoice(e.target.value)
                    setVestimentOpen(false)
                  }}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  <option value="__none__">— Cap —</option>
                  {vestimentModelChoice !== '__none__' &&
                  !serveisVestimentModels.includes(vestimentModelChoice) ? (
                    <option value={vestimentModelChoice}>{vestimentModelChoice}</option>
                  ) : null}
                  {serveisVestimentModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        {editorActions ? <QuadrantEditorIconActions {...editorActions} /> : null}
      </div>
    </div>
  )
}
