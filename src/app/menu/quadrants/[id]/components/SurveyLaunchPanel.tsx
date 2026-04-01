'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'

type SurveyGroupOption = {
  id: string
  name: string
  workerIds: string[]
}

type SurveyPersonOption = {
  id: string
  name: string
}

type SurveySummary = {
  id: string
  serviceDate: string
  status: string
  createdByName?: string
  deadlineAt?: number
  targetGroupNames?: string[]
  targetWorkerNames?: string[]
  resolvedTargets?: Array<{ name: string }>
  counts?: {
    yes: number
    no: number
    maybe: number
    pending: number
  }
  responses?: Array<{
    workerName: string
    response: 'yes' | 'no' | 'maybe'
    respondedAt: number
  }>
  responseGroups?: {
    yes: Array<{ workerName: string; respondedAt: number }>
    maybe: Array<{ workerName: string; respondedAt: number }>
    no: Array<{ workerName: string; respondedAt: number }>
    pending: Array<{ workerName: string }>
  }
}

type Props = {
  canLaunchSurvey: boolean
  visibleDate: string
  latestAllowedDeadlineDate: string
  latestAllowedDeadlineTime: string
  surveys: SurveySummary[]
  surveyGroupsLoading: boolean
  surveyPeopleLoading: boolean
  surveyGroups: SurveyGroupOption[]
  surveyPeople: SurveyPersonOption[]
  selectedSurveyGroupIds: string[]
  setSelectedSurveyGroupIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedSurveyWorkerIds: string[]
  setSelectedSurveyWorkerIds: React.Dispatch<React.SetStateAction<string[]>>
  surveyDeadlineDate: string
  setSurveyDeadlineDate: (value: string) => void
  surveyDeadlineTime: string
  setSurveyDeadlineTime: (value: string) => void
  handleLaunchSurvey: () => void
  ensureSurveyPeopleLoaded: () => void
  surveySubmitting: boolean
}

export default function SurveyLaunchPanel({
  canLaunchSurvey,
  visibleDate,
  latestAllowedDeadlineDate,
  latestAllowedDeadlineTime,
  surveys,
  surveyGroupsLoading,
  surveyPeopleLoading,
  surveyGroups,
  surveyPeople,
  selectedSurveyGroupIds,
  setSelectedSurveyGroupIds,
  selectedSurveyWorkerIds,
  setSelectedSurveyWorkerIds,
  surveyDeadlineDate,
  setSurveyDeadlineDate,
  surveyDeadlineTime,
  setSurveyDeadlineTime,
  handleLaunchSurvey,
  ensureSurveyPeopleLoaded,
  surveySubmitting,
}: Props) {
  if (!canLaunchSurvey) return null

  const [manualPeopleOpen, setManualPeopleOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [responsesOpen, setResponsesOpen] = useState(false)
  const [responseTab, setResponseTab] = useState<'yes' | 'maybe' | 'no' | 'pending'>('yes')
  const selectedManualPeople = useMemo(
    () => surveyPeople.filter((person) => selectedSurveyWorkerIds.includes(person.id)),
    [surveyPeople, selectedSurveyWorkerIds]
  )
  const latestSurvey = surveys[0]

  const formatDeadline = (timestamp?: number) => {
    if (!timestamp) return null
    try {
      return new Intl.DateTimeFormat('ca-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp))
    } catch {
      return null
    }
  }

  const formatServiceDate = (value?: string) => {
    if (!value) return null
    try {
      return new Intl.DateTimeFormat('ca-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  const latestSurveySummary = useMemo(() => {
    if (!latestSurvey) return null
    const groupNames = Array.isArray(latestSurvey.targetGroupNames) ? latestSurvey.targetGroupNames.filter(Boolean) : []
    const manualNames = Array.isArray(latestSurvey.targetWorkerNames) ? latestSurvey.targetWorkerNames.filter(Boolean) : []
    const totalTargets = Array.isArray(latestSurvey.resolvedTargets) ? latestSurvey.resolvedTargets.length : 0
    return { groupNames, manualNames, totalTargets }
  }, [latestSurvey])

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setPanelOpen((prev) => !prev)}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">Sondeig de disponibilitat</p>
            {latestSurvey ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sondeig llançat {formatServiceDate(latestSurvey.serviceDate) || visibleDate}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">Per al dia {visibleDate || '-'}</p>
          {latestSurveySummary ? (
            <div className="mt-1 space-y-1 text-[11px] text-slate-600">
              {latestSurveySummary.groupNames.length > 0 ? (
                <div>Grups: {latestSurveySummary.groupNames.join(', ')}</div>
              ) : null}
              {latestSurveySummary.manualNames.length > 0 ? (
                <div>Persones: {latestSurveySummary.manualNames.join(', ')}</div>
              ) : null}
              <div>
                Destinataris: {latestSurveySummary.totalTargets}
                {latestSurvey?.createdByName ? ` · Llançat per ${latestSurvey.createdByName}` : ''}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-start gap-3">
          {latestSurvey?.counts ? (
            <div className="space-y-1 text-right text-xs text-slate-600">
              <div>
                Sí {latestSurvey.counts.yes} · Potser {latestSurvey.counts.maybe} · No {latestSurvey.counts.no} · Pendents {latestSurvey.counts.pending}
              </div>
              {latestSurvey.deadlineAt ? (
                <div className="text-[11px] text-slate-500">
                  Límit: {formatDeadline(latestSurvey.deadlineAt)}
                </div>
              ) : null}
            </div>
          ) : null}
          <span className="pt-0.5 text-slate-400">
            {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </button>

      {panelOpen ? (
        <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px_auto] items-start">
        <div className="space-y-2">
          <Label>Grups</Label>
          <div className="max-h-28 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 space-y-2">
            {surveyGroupsLoading ? (
              <div className="text-xs text-slate-500">Carregant...</div>
            ) : surveyGroups.length === 0 ? (
              <div className="text-xs text-slate-500">Sense grups a premisses</div>
            ) : (
              surveyGroups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedSurveyGroupIds.includes(group.id)}
                    onChange={(e) =>
                      setSelectedSurveyGroupIds((prev) =>
                        e.target.checked ? [...prev, group.id] : prev.filter((id) => id !== group.id)
                      )
                    }
                  />
                  <span>{group.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Persones manuals</Label>
          <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-xs text-slate-700"
              onClick={() =>
                setManualPeopleOpen((prev) => {
                  const next = !prev
                  if (next) ensureSurveyPeopleLoaded()
                  return next
                })
              }
            >
              <span className="truncate">
                {selectedManualPeople.length > 0
                  ? selectedManualPeople.map((person) => person.name).join(', ')
                  : 'Sense persones manuals seleccionades'}
              </span>
              <span className="ml-2 shrink-0 text-slate-400">
                {manualPeopleOpen ? 'Amaga' : 'Mostra'}
              </span>
            </button>
            {manualPeopleOpen ? (
              <div className="max-h-28 overflow-y-auto space-y-2 pt-1">
                {surveyPeopleLoading ? (
                  <div className="text-xs text-slate-500">Carregant...</div>
                ) : surveyPeople.length === 0 ? (
                  <div className="text-xs text-slate-500">Sense personal disponible</div>
                ) : (
                  surveyPeople.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedSurveyWorkerIds.includes(person.id)}
                        onChange={(e) =>
                          setSelectedSurveyWorkerIds((prev) =>
                            e.target.checked ? [...prev, person.id] : prev.filter((id) => id !== person.id)
                          )
                        }
                      />
                      <span>{person.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <Label>Dia límit</Label>
          <Input
            type="date"
            value={surveyDeadlineDate}
            max={latestAllowedDeadlineDate || undefined}
            onChange={(e) => setSurveyDeadlineDate(e.target.value)}
          />
        </div>

        <div>
          <Label>Hora límit</Label>
          <Input
            type="time"
            value={surveyDeadlineTime}
            max={surveyDeadlineDate === latestAllowedDeadlineDate ? latestAllowedDeadlineTime || undefined : undefined}
            onChange={(e) => setSurveyDeadlineTime(e.target.value)}
          />
        </div>

        <div className="pt-6">
          <Button type="button" variant="outline" onClick={handleLaunchSurvey} disabled={surveySubmitting || surveyGroupsLoading}>
            {surveySubmitting ? 'Enviant...' : 'Llançar sondeig'}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        El límit de resposta ha de ser com a màxim 48h abans de l&apos;inici de l&apos;esdeveniment.
      </p>
      {latestSurvey?.responseGroups ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            className="h-auto px-0 text-[11px] text-slate-500 hover:text-slate-700"
            onClick={() => setResponsesOpen(true)}
          >
            Veure respostes
          </Button>
        </div>
      ) : null}
        </>
      ) : null}

      <Dialog open={responsesOpen} onOpenChange={setResponsesOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Respostes del sondeig</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                ['yes', `Sí (${latestSurvey?.responseGroups?.yes.length || 0})`],
                ['maybe', `Potser (${latestSurvey?.responseGroups?.maybe.length || 0})`],
                ['no', `No (${latestSurvey?.responseGroups?.no.length || 0})`],
                ['pending', `Pendents (${latestSurvey?.responseGroups?.pending.length || 0})`],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={responseTab === value ? 'default' : 'outline'}
                  className={responseTab === value ? 'bg-violet-600 hover:bg-violet-700' : ''}
                  onClick={() => setResponseTab(value as 'yes' | 'maybe' | 'no' | 'pending')}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
              {(() => {
                const groups = latestSurvey?.responseGroups
                if (!groups) {
                  return <div className="text-sm text-slate-500">Encara no hi ha respostes.</div>
                }
                const items =
                  responseTab === 'yes'
                    ? groups.yes
                    : responseTab === 'maybe'
                    ? groups.maybe
                    : responseTab === 'no'
                    ? groups.no
                    : groups.pending

                if (!items.length) {
                  return <div className="text-sm text-slate-500">Sense persones en aquest estat.</div>
                }

                return (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div
                        key={`${item.workerName}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-slate-800">{item.workerName}</span>
                        {'respondedAt' in item && item.respondedAt ? (
                          <span className="text-xs text-slate-500">
                            {new Intl.DateTimeFormat('ca-ES', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(item.respondedAt))}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
