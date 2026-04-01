'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { RoleGuard } from '@/lib/withRoleGuard'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { ClipboardList } from 'lucide-react'
import { normalizeRole } from '@/lib/roles'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SurveyItem = {
  id: string
  department: string
  serviceDate: string
  deadlineAt: number
  status: string
  snapshot?: {
    eventName?: string
    location?: string
    service?: string | null
    startTime?: string
    endTime?: string
  }
  myResponse?: 'yes' | 'no' | 'maybe' | null
}

export default function SondeigsPage() {
  const { data: session, status } = useSession()
  const role = normalizeRole(String((session?.user as any)?.role || ''))
  const canRespondSurveys = Boolean((session?.user as any)?.canRespondSurveys)
  const canAccess = canRespondSurveys || ['admin', 'direccio', 'cap'].includes(role)
  const [justSubmittedSurveyId, setJustSubmittedSurveyId] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR(
    status === 'authenticated' && canAccess ? '/api/quadrants/surveys/mine' : null,
    fetcher
  )

  const surveys: SurveyItem[] = Array.isArray(data?.surveys) ? data.surveys : []
  const pendingSurveys = useMemo(
    () => surveys.filter((survey) => !survey.myResponse),
    [surveys]
  )
  const answeredSurveys = useMemo(
    () => surveys.filter((survey) => survey.myResponse),
    [surveys]
  )

  const respond = async (surveyId: string, response: 'yes' | 'no' | 'maybe') => {
    const res = await fetch(`/api/quadrants/surveys/${surveyId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error || 'No s ha pogut respondre el sondeig')
    }
    setJustSubmittedSurveyId(surveyId)
    await mutate()
  }

  const formatDeadline = (timestamp?: number) => {
    if (!timestamp) return 'Sense límit'
    try {
      return new Intl.DateTimeFormat('ca-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp))
    } catch {
      return 'Sense límit'
    }
  }

  const formatSurveyLine = (survey: SurveyItem) => {
    const parts = [
      survey.serviceDate || '',
      `${survey.snapshot?.startTime || '--:--'} - ${survey.snapshot?.endTime || '--:--'}`,
      survey.department || '',
      survey.snapshot?.location || '',
    ].filter(Boolean)
    return parts.join(' · ')
  }

  const responseLabel = (response?: SurveyItem['myResponse']) =>
    response === 'yes' ? 'Sí' : response === 'no' ? 'No' : response === 'maybe' ? 'Potser' : ''

  const renderSurveyCard = (survey: SurveyItem, readOnly = false) => (
    <section key={survey.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-lg font-semibold leading-tight text-slate-900">
              {survey.snapshot?.eventName || 'Servei'}
            </h2>
            {survey.myResponse ? (
              <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                Resposta enviada: {responseLabel(survey.myResponse)}
              </span>
            ) : (
              <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Pendent
              </span>
            )}
          </div>

          <div className="text-sm text-slate-600">
            {formatSurveyLine(survey)}
          </div>

          <div className="text-sm font-medium text-amber-700">
            Límit resposta: {formatDeadline(survey.deadlineAt)}
          </div>
        </div>

        {survey.myResponse ? (
          <div className="text-sm text-slate-500">
            Aquest sondeig ja està tancat per a tu.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {[
              ['yes', 'Sí'],
              ['no', 'No'],
              ['maybe', 'Potser'],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                className="h-11 rounded-xl text-sm font-medium"
                onClick={() => respond(survey.id, value as 'yes' | 'no' | 'maybe')}
                disabled={readOnly}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  )

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador', 'usuari', 'comercial', 'observer']}>
      <main className="min-h-screen space-y-4 bg-slate-50 px-3 pb-8 sm:px-4 sm:pb-10">
        <ModuleHeader
          icon={<ClipboardList className="h-6 w-6 text-violet-600" />}
          title="Sondeigs"
          subtitle="Disponibilitat"
        />

        {!canAccess ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            No tens permís per respondre sondeigs.
          </section>
        ) : isLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Carregant sondeigs...
          </section>
        ) : surveys.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            No tens cap sondeig pendent.
          </section>
        ) : (
          <div className="space-y-4">
            {justSubmittedSurveyId ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                Resposta enviada.
              </section>
            ) : null}

            {pendingSurveys.length > 0 ? (
              <div className="space-y-4">
                {pendingSurveys.map((survey) => renderSurveyCard(survey))}
              </div>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                No tens cap sondeig pendent per respondre.
              </section>
            )}

            {answeredSurveys.length > 0 ? (
              <div className="space-y-3">
                <div className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Sondeigs tancats
                </div>
                {answeredSurveys.map((survey) => renderSurveyCard(survey, true))}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </RoleGuard>
  )
}
