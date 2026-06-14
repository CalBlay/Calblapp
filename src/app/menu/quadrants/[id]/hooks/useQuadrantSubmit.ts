'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type { EttEntry, LogisticPhasePayload, ServiceGroupPayload } from './useQuadrantFormState'
import type {
  ServiceJamoneroAssignment,
  ServicePhaseEtt,
  ServicePhaseKey,
} from '../phaseConfig'
import type {
  CuinaEttState,
  CuinaGroup,
  GenerationScope,
  QuadrantMode,
} from '../components/quadrantModalTypes'
import {
  buildPreferredAssignments,
  clonePayloadForDate,
  normalizePayloadToSingleDate,
} from '../components/quadrantModalUtils'
import {
  confirmSavedQuadrants,
  submitQuadrantPayload,
} from '../components/quadrantModalApi'
import {
  toastAutoAssignDoubleBookingWarnings,
  toastLearningStatus,
} from '../components/quadrantModalToasts'
import {
  buildBasePayload,
  resolveManualResponsible,
  type IdName,
} from '../lib/quadrantPayloadShared'
import { buildCuinaPayload } from '../lib/buildCuinaPayload'
import type { CuinaStaffTotals } from '../lib/cuinaGroupRoleLines'
import { buildServeisPayload } from '../lib/buildServeisPayload'
import { buildLogisticaPayload } from '../lib/buildLogisticaPayload'

type CuinaVehicle = {
  id: string
  plate: string
  vehicleType: string
  conductorId: string | null
  arrivalTime: string
}

export type UseQuadrantSubmitParams = {
  event: QuadrantEvent
  department: string
  isCuina: boolean
  isServeis: boolean
  isQuadrantCoreDept: boolean
  isMultiDayEvent: boolean
  multiDayDates: string[]
  selectedMultiDates: string[]
  generationScope: GenerationScope
  mode: QuadrantMode

  // Camps comuns del formulari
  canAutoGen: boolean
  location: string
  meetingPoint: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  arrivalTime: string
  totalWorkers: string | number
  numDrivers: string | number
  manualResp: string

  // Selectors
  availableResponsables: IdName[]
  availableConductors: IdName[]
  availableJamoneros: IdName[]

  // Cuina
  cuinaGroups: CuinaGroup[]
  cuinaTotals: CuinaStaffTotals
  cuinaVehiclesPayload: CuinaVehicle[]
  isManualResponsibleConductor: boolean
  cuinaEtt: CuinaEttState

  // Serveis
  buildServiceGroupsPayload: (
    manualResponsibleId: string | null,
    manualResponsibleName?: string | null
  ) => ServiceGroupPayload[]
  serviceTotals: { workers: number; drivers: number; responsables: number; jamoneros: number }
  serviceJamoneroAssignments: ServiceJamoneroAssignment[]
  servicePhaseEtt: Record<ServicePhaseKey, ServicePhaseEtt>
  vestimentModelChoice: string

  // Logística
  buildLogisticaPhases: () => LogisticPhasePayload[]
  ettEntry: EttEntry | null

  // Callbacks
  onSaved?: () => Promise<void>
  onOpenChange: (open: boolean) => void
  /** Inline editor: stay open after save instead of closing like the modal. */
  keepOpenAfterSave?: boolean
}

type UseQuadrantSubmitResult = {
  loading: boolean
  error: string | null
  success: boolean
  save: (confirmAfterSave?: boolean) => Promise<void>
}

type SubmissionContext = {
  payloads: Array<Record<string, unknown>>
  expectConfirmInline: boolean
  confirmAfterSave: boolean
}

export function useQuadrantSubmit(params: UseQuadrantSubmitParams): UseQuadrantSubmitResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const save = useCallback(
    async (confirmAfterSave = false) => {
      const {
        event,
        department,
        isCuina,
        isServeis,
        isQuadrantCoreDept,
        isMultiDayEvent,
        multiDayDates,
        selectedMultiDates,
        generationScope,
        mode,
        canAutoGen,
        location,
        meetingPoint,
        startDate,
        endDate,
        startTime,
        endTime,
        arrivalTime,
        totalWorkers,
        numDrivers,
        manualResp,
        availableResponsables,
        availableConductors,
        availableJamoneros,
        cuinaGroups,
        cuinaTotals,
        cuinaVehiclesPayload,
        isManualResponsibleConductor,
        cuinaEtt,
        buildServiceGroupsPayload,
        serviceTotals,
        serviceJamoneroAssignments,
        servicePhaseEtt,
        vestimentModelChoice,
        buildLogisticaPhases,
        ettEntry,
        onSaved,
        onOpenChange,
        keepOpenAfterSave = false,
      } = params

      if (!canAutoGen) return
      setLoading(true)
      setError(null)
      setSuccess(false)
      let shouldClose = false

      const { id: manualResponsibleId, name: manualResponsibleName } = resolveManualResponsible(
        manualResp,
        availableResponsables,
        availableConductors
      )

      // Bucle de submit + confirm reusable per qualsevol branca.
      const dispatchSubmissions = async ({
        payloads,
        expectConfirmInline,
        confirmAfterSave: confirm,
      }: SubmissionContext) => {
        let preferredAssignments: ReturnType<typeof buildPreferredAssignments> = null
        const createdDocIds: string[] = []
        let allResponsesConfirmInlineOk = expectConfirmInline
        let learningStatusEmitted = false
        for (const payloadToSend of payloads) {
          const response = await submitQuadrantPayload({
            ...payloadToSend,
            ...(preferredAssignments || {}),
          })
          toastAutoAssignDoubleBookingWarnings(response)
          if (!learningStatusEmitted) {
            toastLearningStatus(response?.learningStatus, mode)
            learningStatusEmitted = true
          }
          preferredAssignments = buildPreferredAssignments(response?.proposal)
          if (Array.isArray(response?.docIds)) createdDocIds.push(...response.docIds)
          if (expectConfirmInline && !response.confirmInlineApplied) {
            allResponsesConfirmInlineOk = false
          }
        }

        if (confirm && createdDocIds.length > 0) {
          if (expectConfirmInline && allResponsesConfirmInlineOk) {
            toast.success(
              isMultiDayEvent && generationScope === 'event'
                ? 'Quadrants confirmats per tots els dies!'
                : 'Quadrant confirmat correctament!'
            )
            window.dispatchEvent(
              new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } })
            )
          } else {
            const confirmResult = await confirmSavedQuadrants({
              department,
              eventId: event.id,
              docIds: Array.from(new Set(createdDocIds)),
            })
            if (confirmResult.ok) {
              toast.success(
                isMultiDayEvent && generationScope === 'event'
                  ? 'Quadrants confirmats per tots els dies!'
                  : 'Quadrant confirmat correctament!'
              )
              window.dispatchEvent(
                new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } })
              )
            } else {
              toast.warning(
                `S’ha desat el borrador; no s’ha pogut confirmar: ${
                  confirmResult.error || 'error desconegut'
                }`
              )
              window.dispatchEvent(
                new CustomEvent('quadrant:created', { detail: { status: 'draft' } })
              )
            }
          }
        } else {
          toast.success(
            isMultiDayEvent && generationScope === 'event'
              ? 'Borradors creats per tots els dies de l’esdeveniment!'
              : 'Borrador creat correctament!'
          )
          window.dispatchEvent(
            new CustomEvent('quadrant:created', { detail: { status: 'draft' } })
          )
        }

        try {
          void onSaved?.().catch(() => {
            /* la llista s’actualitza en segon pla */
          })
        } catch {
          /* ignorar */
        }
      }

      try {
        const basePayload = buildBasePayload({
          event,
          department,
          location,
          meetingPoint,
          startDate,
          startTime,
          endDate,
          endTime,
          arrivalTime,
          manualResponsibleId,
          manualResponsibleName,
          mode,
        })

        // Selecciona el builder adequat segons el departament.
        let payload: Record<string, unknown>
        let timetables: ReturnType<typeof buildCuinaPayload>['timetables']
        let isLogisticaBranch = false

        if (isCuina) {
          ;({ payload, timetables } = buildCuinaPayload({
            basePayload,
            mode,
            cuinaGroups,
            cuinaTotals,
            cuinaVehiclesPayload,
            cuinaEtt,
            isManualResponsibleConductor,
            manualResponsibleId,
            manualResponsibleName,
            meetingPoint,
            startDate,
            endDate,
            startTime,
            endTime,
            availableResponsables,
            availableConductors,
          }))
        } else if (isServeis) {
          ;({ payload, timetables } = buildServeisPayload({
            basePayload,
            buildServiceGroupsPayload,
            serviceTotals,
            serviceJamoneroAssignments,
            servicePhaseEtt,
            vestimentModelChoice,
            manualResponsibleId,
            manualResponsibleName,
            meetingPoint,
            startDate,
            endDate,
            startTime,
            endTime,
            availableConductors,
            availableJamoneros,
          }))
        } else {
          isLogisticaBranch = true
          ;({ payload, timetables } = buildLogisticaPayload({
            basePayload,
            totalWorkers,
            numDrivers,
            buildLogisticaPhases,
            ettEntry,
          }))
        }

        // Cuina i Serveis adjunten l'array de `timetables` derivades; Logística no ho fa
        // perquè cada fase ja porta les seves pròpies (manté el comportament històric).
        if (!isLogisticaBranch && timetables.length) {
          payload.timetables = timetables
        }

        if (confirmAfterSave && mode === 'manual' && isQuadrantCoreDept) {
          payload.confirmImmediately = true
        }

        const normalizedPayload =
          isMultiDayEvent && generationScope === 'day'
            ? normalizePayloadToSingleDate(payload, department, startDate)
            : payload

        const targetDates =
          selectedMultiDates.length > 0 ? selectedMultiDates : multiDayDates

        if (isMultiDayEvent && generationScope === 'event' && targetDates.length === 0) {
          throw new Error('Selecciona almenys un dia per generar el quadrant multi dia.')
        }

        const payloads =
          isMultiDayEvent && generationScope === 'event'
            ? targetDates.map((date) => clonePayloadForDate(normalizedPayload, department, date))
            : [normalizedPayload]

        await dispatchSubmissions({
          payloads,
          expectConfirmInline: Boolean(
            confirmAfterSave && mode === 'manual' && isQuadrantCoreDept
          ),
          confirmAfterSave,
        })
        shouldClose = true
        setSuccess(true)
        setLoading(false)
        if (!keepOpenAfterSave) {
          onOpenChange(false)
        }
      } catch (err: unknown) {
        const e = err as Error
        setError(e.message)
        toast.error(e.message)
      } finally {
        if (!shouldClose) setLoading(false)
      }
    },
    [params]
  )

  return { loading, error, success, save }
}
