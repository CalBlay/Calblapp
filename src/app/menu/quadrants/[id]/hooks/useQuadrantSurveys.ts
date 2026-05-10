'use client'

import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import {
  getCachedSurveyGroups,
  getCachedSurveyPeople,
  loadDepartmentPremises,
  loadSurveyPeople,
} from '../components/quadrantModalApi'
import {
  extractDate,
} from '../components/quadrantModalUtils'
import type {
  SurveyGroupOption,
  SurveyPersonOption,
  SurveySummary,
} from '../components/quadrantModalTypes'

type UseQuadrantSurveysParams = {
  open: boolean
  event: QuadrantEvent
  eventName: string
  department: string
  userRole: string
  startTime: string
  endTime: string
  location: string
  totalWorkers: string | number
  numDrivers: string | number
}

type UseQuadrantSurveysResult = {
  canLaunchSurvey: boolean
  visibleDate: string
  latestAllowedSurveyDeadlineAt: Date | null
  latestAllowedSurveyDeadlineDate: string
  latestAllowedSurveyDeadlineTime: string
  surveys: SurveySummary[]
  surveyGroups: SurveyGroupOption[]
  surveyPeople: SurveyPersonOption[]
  surveyGroupsLoading: boolean
  surveyPeopleLoading: boolean
  surveySubmitting: boolean
  selectedSurveyGroupIds: string[]
  setSelectedSurveyGroupIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedSurveyWorkerIds: string[]
  setSelectedSurveyWorkerIds: React.Dispatch<React.SetStateAction<string[]>>
  surveyDeadlineDate: string
  setSurveyDeadlineDate: React.Dispatch<React.SetStateAction<string>>
  surveyDeadlineTime: string
  setSurveyDeadlineTime: React.Dispatch<React.SetStateAction<string>>
  ensureSurveyPeopleLoaded: () => Promise<void>
  handleLaunchSurvey: () => Promise<void>
}

export function useQuadrantSurveys({
  open,
  event,
  eventName,
  department,
  userRole,
  startTime,
  endTime,
  location,
  totalWorkers,
  numDrivers,
}: UseQuadrantSurveysParams): UseQuadrantSurveysResult {
  const visibleDate = extractDate(event.start)
  const canLaunchSurvey = userRole === 'admin' || userRole === 'direccio' || userRole === 'cap'

  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [surveyGroups, setSurveyGroups] = useState<SurveyGroupOption[]>([])
  const [surveyPeople, setSurveyPeople] = useState<SurveyPersonOption[]>([])
  const [surveyGroupsLoading, setSurveyGroupsLoading] = useState(false)
  const [surveyPeopleLoading, setSurveyPeopleLoading] = useState(false)
  const [surveySubmitting, setSurveySubmitting] = useState(false)
  const [, setSurveyLoading] = useState(false)
  const [selectedSurveyGroupIds, setSelectedSurveyGroupIds] = useState<string[]>([])
  const [selectedSurveyWorkerIds, setSelectedSurveyWorkerIds] = useState<string[]>([])
  const [surveyDeadlineDate, setSurveyDeadlineDate] = useState('')
  const [surveyDeadlineTime, setSurveyDeadlineTime] = useState('18:00')

  const surveyEventStartAt = useMemo(() => {
    const baseDate = visibleDate || extractDate(event.originalStart || event.start)
    const baseTime = startTime || event.startTime || '00:00'
    const parsed = new Date(`${baseDate}T${baseTime}:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }, [event.originalStart, event.start, event.startTime, startTime, visibleDate])

  const latestAllowedSurveyDeadlineAt = useMemo(() => {
    if (!surveyEventStartAt) return null
    return new Date(surveyEventStartAt.getTime() - 48 * 60 * 60 * 1000)
  }, [surveyEventStartAt])

  const latestAllowedSurveyDeadlineDate = latestAllowedSurveyDeadlineAt
    ? format(latestAllowedSurveyDeadlineAt, 'yyyy-MM-dd')
    : ''
  const latestAllowedSurveyDeadlineTime = latestAllowedSurveyDeadlineAt
    ? format(latestAllowedSurveyDeadlineAt, 'HH:mm')
    : ''

  // Reset deadline defaults each time the modal opens or the event window changes.
  useEffect(() => {
    if (!open) return
    setSurveyDeadlineDate(latestAllowedSurveyDeadlineDate || visibleDate)
    setSurveyDeadlineTime(latestAllowedSurveyDeadlineTime || '18:00')
  }, [
    open,
    event.id,
    visibleDate,
    latestAllowedSurveyDeadlineDate,
    latestAllowedSurveyDeadlineTime,
  ])

  // Carrega sondejos existents + grups (i opcionalment cache de persones).
  useEffect(() => {
    if (!open || !canLaunchSurvey) return
    let cancelled = false

    const run = async () => {
      try {
        setSurveyLoading(true)
        const cachedGroups = getCachedSurveyGroups(department)
        const cachedPeople = getCachedSurveyPeople(department)
        const surveysPromise = fetch(
          `/api/quadrants/surveys?eventId=${encodeURIComponent(event.id)}&department=${encodeURIComponent(
            department
          )}&serviceDate=${encodeURIComponent(visibleDate)}`,
          { cache: 'no-store' }
        ).then((res) => res.json().catch(() => ({})))

        if (cachedGroups) {
          setSurveyGroups(cachedGroups)
        } else {
          setSurveyGroupsLoading(true)
          loadDepartmentPremises(department)
            .then(({ groups }) => {
              if (cancelled) return
              setSurveyGroups(groups)
            })
            .finally(() => {
              if (!cancelled) setSurveyGroupsLoading(false)
            })
        }

        if (cachedPeople) {
          setSurveyPeople(cachedPeople)
        }

        const surveysJson = await surveysPromise
        if (cancelled) return
        setSurveys(Array.isArray(surveysJson?.surveys) ? surveysJson.surveys : [])
      } finally {
        if (!cancelled) setSurveyLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [open, canLaunchSurvey, department, event.id, visibleDate])

  const ensureSurveyPeopleLoaded = useCallback(async () => {
    try {
      setSurveyPeopleLoading(true)
      const people = await loadSurveyPeople(department)
      setSurveyPeople(people)
    } finally {
      setSurveyPeopleLoading(false)
    }
  }, [department])

  const surveySelectedIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...selectedSurveyWorkerIds,
          ...surveyGroups
            .filter((group) => selectedSurveyGroupIds.includes(group.id))
            .flatMap((group) => group.workerIds),
        ])
      ),
    [selectedSurveyGroupIds, selectedSurveyWorkerIds, surveyGroups]
  )

  const handleLaunchSurvey = useCallback(async () => {
    if (!canLaunchSurvey) return
    if (!visibleDate) {
      toast.error('Falta la data del servei')
      return
    }
    if (surveySelectedIds.length === 0) {
      toast.error('Selecciona almenys una persona o grup')
      return
    }

    const deadlineBaseDate = surveyDeadlineDate || visibleDate
    const deadlineAt = new Date(`${deadlineBaseDate}T${surveyDeadlineTime || '18:00'}:00`).getTime()
    if (Number.isNaN(deadlineAt)) {
      toast.error('Data o hora límit no vàlida')
      return
    }
    if (
      latestAllowedSurveyDeadlineAt &&
      deadlineAt > latestAllowedSurveyDeadlineAt.getTime()
    ) {
      toast.error('La data límit ha de ser com a màxim 48h abans de l’esdeveniment')
      return
    }

    try {
      setSurveySubmitting(true)
      const res = await fetch('/api/quadrants/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          department,
          serviceDate: visibleDate,
          deadlineAt,
          targetGroupIds: selectedSurveyGroupIds,
          targetWorkerIds: selectedSurveyWorkerIds,
          snapshot: {
            eventName,
            location,
            service: event.service || null,
            startTime: startTime || event.startTime || '',
            endTime: endTime || event.endTime || '',
            totalWorkers: Number(totalWorkers) || 0,
            totalDrivers: Number(numDrivers) || 0,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'No s ha pogut crear el sondeig')
      }

      setSurveys((prev) => [json.survey, ...prev])
      toast.success('Sondeig enviat a Ops')
    } catch (surveyError) {
      const message = surveyError instanceof Error ? surveyError.message : 'Error enviant el sondeig'
      toast.error(message)
    } finally {
      setSurveySubmitting(false)
    }
  }, [
    canLaunchSurvey,
    department,
    endTime,
    event.id,
    event.service,
    event.startTime,
    event.endTime,
    eventName,
    latestAllowedSurveyDeadlineAt,
    location,
    numDrivers,
    selectedSurveyGroupIds,
    selectedSurveyWorkerIds,
    startTime,
    surveyDeadlineDate,
    surveyDeadlineTime,
    surveySelectedIds.length,
    totalWorkers,
    visibleDate,
  ])

  return {
    canLaunchSurvey,
    visibleDate,
    latestAllowedSurveyDeadlineAt,
    latestAllowedSurveyDeadlineDate,
    latestAllowedSurveyDeadlineTime,
    surveys,
    surveyGroups,
    surveyPeople,
    surveyGroupsLoading,
    surveyPeopleLoading,
    surveySubmitting,
    selectedSurveyGroupIds,
    setSelectedSurveyGroupIds,
    selectedSurveyWorkerIds,
    setSelectedSurveyWorkerIds,
    surveyDeadlineDate,
    setSurveyDeadlineDate,
    surveyDeadlineTime,
    setSurveyDeadlineTime,
    ensureSurveyPeopleLoaded,
    handleLaunchSurvey,
  }
}
