'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useQuadrantFormState } from '../hooks/useQuadrantFormState'
import { useQuadrantAutoPreview } from '../hooks/useQuadrantAutoPreview'
import { useQuadrantSurveys } from '../hooks/useQuadrantSurveys'
import { useCuinaState } from '../hooks/useCuinaState'
import { useQuadrantSubmit } from '../hooks/useQuadrantSubmit'
import { useServeisVestiment } from '../hooks/useServeisVestiment'
import LogisticsPhasePanel from './LogisticsPhasePanel'
import ServicePhasePanel from './ServicePhasePanel'
import { normalizeRole } from '@/lib/roles'
import SurveyLaunchPanel from './SurveyLaunchPanel'
import CuinaPhasePanel from './CuinaPhasePanel'
import AutoLearningBanner from './AutoLearningBanner'
import QuadrantModalHeader from './QuadrantModalHeader'
import { QUADRANT_AUTO_GENERATION_ENABLED } from '@/lib/quadrantFeatureFlags'
import QuadrantModeSelector from './QuadrantModeSelector'
import MultiDayDateSelector from './MultiDayDateSelector'
import QuadrantModalFooter from './QuadrantModalFooter'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import type {
  GenerationScope,
  QuadrantModalProps,
  QuadrantMode,
  SessionUserInfo,
} from './quadrantModalTypes'
import { extractDate, getDateRange, splitTitle } from './quadrantModalUtils'
import { deleteQuadrantDraft } from './quadrantModalApi'
import { cn } from '@/lib/utils'

export type QuadrantEditorProps = {
  event: QuadrantEvent
  active?: boolean
  layout?: 'modal' | 'inline'
  hideHeader?: boolean
  existingDraft?: EditorDraftInput | null
  onSaved?: () => void | Promise<void>
  onCancel?: () => void
}

export function QuadrantEditor({
  event,
  active = true,
  layout = 'inline',
  hideHeader,
  existingDraft,
  onSaved,
  onCancel,
}: QuadrantEditorProps) {
  const { data: session } = useSession()
  const sessionUser = session?.user as SessionUserInfo | undefined
  const userRole = normalizeRole(String(sessionUser?.role || ''))
  const department = (
    event.department ||
    sessionUser?.department ||
    sessionUser?.dept ||
    'serveis'
  )
    .toString()
    .toLowerCase()
  const isCuina = department === 'cuina'
  const isServeis = department === 'serveis'
  const isLogistica = department === 'logistica'
  /** Serveis, Cuina, Logística: mateix comportament de modes, training i guardar+confirmar. */
  const isQuadrantCoreDept = isServeis || isCuina || isLogistica
  const [mode, setMode] = useState<QuadrantMode>('manual')

  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    arrivalTime,
    setArrivalTime,
    location,
    setLocation: _setLocation,
    meetingPoint,
    setMeetingPoint,
    manualResp,
    setManualResp,
    totalWorkers,
    setTotalWorkers,
    numDrivers,
    setNumDrivers,
    phaseForms,
    updatePhaseForm,
    phaseVisibility,
    togglePhaseVisibility,
    phaseSettings,
    updatePhaseSetting,
    phaseResponsibles: _phaseResponsibles,
    updatePhaseResponsible: _updatePhaseResponsible,
    phaseVehicleAssignments,
    updatePhaseVehicleAssignment,
    replacePhaseVehicleAssignments,
    availableVehicles,
    servicePhaseGroups,
    servicePhaseSettings,
    toggleServicePhaseSelection,
    updateServicePhaseSetting,
    servicePhaseVisibility,
    toggleServicePhaseVisibility,
    addServiceGroup,
    updateServiceGroup,
    removeServiceGroup,
    servicePhaseEtt,
    toggleServicePhaseEtt,
    updateServicePhaseEtt,
    ettOpen,
    setEttOpen,
    ettData,
    setEttData,
    serviceTotals,
    serviceJamoneroAssignments,
    setServiceJamoneroCount,
    updateServiceJamoneroAssignment,
    buildServiceGroupsPayload,
    vehiclesPayload: _vehiclesPayload,
    buildLogisticaPhases,
    validateLocalPersonAssignments,
    ettEntry,
    availableResponsables,
    availableConductors,
    availableJamoneros,
    availableTreballadors,
  } = useQuadrantFormState({ event, department, modalOpen: active, mode, existingDraft })

  const rawTitle = event.summary || event.title || ''
  const { name: eventName, code: parsedCode } = splitTitle(rawTitle)
  const _eventCode = parsedCode || (rawTitle.match(/[A-Z]\d{6,}/)?.[0] ?? '').toUpperCase()

  const [generationScope, setGenerationScope] = useState<GenerationScope>('day')
  const [selectedMultiDates, setSelectedMultiDates] = useState<string[]>([])

  const { autoPreview, autoPreviewLoading, autoPreviewError } = useQuadrantAutoPreview({
    open: active,
    mode,
    isQuadrantCoreDept,
    event,
    department,
    startDate,
    startTime,
    location,
    setManualResp,
    setTotalWorkers,
    setNumDrivers,
  })

  const {
    canLaunchSurvey,
    visibleDate,
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
  } = useQuadrantSurveys({
    open: active,
    event,
    eventName,
    department,
    userRole,
    startTime,
    endTime,
    location,
    totalWorkers,
    numDrivers,
  })

  const { serveisVestimentModels, vestimentModelChoice, setVestimentModelChoice, driverCrews } =
    useServeisVestiment({ open: active, isServeis, event })

  const _eventRangeStart = extractDate(event.originalStart || event.start)
  const _eventRangeEnd = extractDate(event.originalEnd || event.end || event.start)
  const multiDayDates = useMemo(
    () => getDateRange(event.originalStart || event.start, event.originalEnd || event.end || event.start),
    [event.end, event.originalEnd, event.originalStart, event.start]
  )
  const isMultiDayEvent = multiDayDates.length > 1

  const {
    cuinaGroups,
    cuinaEtt,
    cuinaTotals,
    isManualResponsibleConductor,
    cuinaVehiclesPayload,
    availableVehicles: cuinaAvailableVehicles,
    availableVehicleCount: cuinaAvailableVehicleCount,
    isVehicleIdAssigned: isCuinaVehicleIdAssigned,
    toggleCuinaEtt,
    updateCuinaEtt,
    addCuinaGroup,
    updateCuinaGroup,
    removeCuinaGroup,
  } = useCuinaState({
    open: active,
    isCuina,
    department,
    mode,
    event,
    existingDraft,
    startDate,
    endDate,
    totalWorkers,
    numDrivers,
    meetingPoint,
    setMeetingPoint,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    arrivalTime,
    setArrivalTime,
    manualResp,
    availableConductors,
  })

  useEffect(() => {
    if (!active) return
    setGenerationScope('day')
    setSelectedMultiDates(multiDayDates)
  }, [active, event.id, multiDayDates])

  useEffect(() => {
    if (!isMultiDayEvent) {
      setSelectedMultiDates([])
      return
    }
    setSelectedMultiDates((prev) => {
      if (prev.length === 0) return multiDayDates
      const valid = prev.filter((date) => multiDayDates.includes(date))
      return valid.length > 0 ? valid : multiDayDates
    })
  }, [isMultiDayEvent, multiDayDates])

  useEffect(() => {
    if (mode !== 'manual') return
    if (manualResp === '__auto__') {
      setManualResp('')
    }
  }, [manualResp, mode, setManualResp])

  const canAutoGen = useMemo(() => {
    const firstCuinaGroup = isCuina ? cuinaGroups[0] : null
    const sd =
      startDate ||
      firstCuinaGroup?.serviceDate ||
      extractDate(event.start)
    const ed =
      endDate ||
      firstCuinaGroup?.serviceDate ||
      extractDate(event.end || event.originalEnd || event.start)
    const st =
      startTime ||
      firstCuinaGroup?.startTime ||
      event.startTime ||
      ''
    const et =
      endTime ||
      firstCuinaGroup?.endTime ||
      event.endTime ||
      ''
    return Boolean(sd && ed && st && et)
  }, [
    isCuina,
    cuinaGroups,
    startDate,
    endDate,
    startTime,
    endTime,
    event.start,
    event.end,
    event.originalEnd,
    event.startTime,
    event.endTime,
  ])

  const handleClose = useCallback(() => onCancel?.(), [onCancel])

  const [deleting, setDeleting] = useState(false)

  const hasPersistedDraft = Boolean(
    String((existingDraft as { id?: string } | null)?.id || '').trim() ||
      event.state === 'draft'
  )

  const handleDelete = useCallback(async () => {
    if (hasPersistedDraft) {
      if (!confirm('Segur que vols eliminar aquest borrador?')) return
      setDeleting(true)
      try {
        const eventId = String(event.id || existingDraft?.id || '')
          .trim()
          .split('__')[0]
        const isLogistica = department.toLowerCase() === 'logistica'
        await deleteQuadrantDraft({
          department,
          eventId,
          ...(isLogistica
            ? {
                phaseKey: String(
                  event.phaseKey || event.phaseType || existingDraft?.phaseType || 'event'
                ),
              }
            : {}),
        })
        toast.success('Borrador eliminat')
        window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'deleted' } }))
        await onSaved?.()
        handleClose()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error eliminant el borrador'
        toast.error(message)
      } finally {
        setDeleting(false)
      }
      return
    }

    if (!confirm('Vols tancar l\'editor sense desar?')) return
    await onSaved?.()
    handleClose()
  }, [
    department,
    event.id,
    event.phaseKey,
    event.phaseType,
    existingDraft?.id,
    existingDraft?.phaseType,
    handleClose,
    hasPersistedDraft,
    onSaved,
  ])

  const { loading, error, success, save: handleAutoGenAndSave } = useQuadrantSubmit({
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
    validateLocalPersonAssignments,
    ettEntry,
    onSaved,
    keepOpenAfterSave: false,
    onOpenChange: (open) => {
      if (!open) handleClose()
    },
  })

  const editorActions = {
    loading,
    deleting,
    hasPersistedDraft,
    canAutoGen,
    mode,
    isQuadrantCoreDept,
    autoPreview,
    autoPreviewLoading,
    onDelete: handleDelete,
    onSave: handleAutoGenAndSave,
  }

  if (!active) return null

  const shouldHideHeader = hideHeader ?? layout === 'inline'
  const surveyInServeisToolbar = isServeis && layout === 'inline'

  const surveyPanel = (
    <SurveyLaunchPanel
      compactTrigger
      canLaunchSurvey={canLaunchSurvey}
      visibleDate={visibleDate}
      latestAllowedDeadlineDate={latestAllowedSurveyDeadlineDate}
      latestAllowedDeadlineTime={latestAllowedSurveyDeadlineTime}
      surveys={surveys}
      surveyGroupsLoading={surveyGroupsLoading}
      surveyPeopleLoading={surveyPeopleLoading}
      surveyGroups={surveyGroups}
      surveyPeople={surveyPeople}
      selectedSurveyGroupIds={selectedSurveyGroupIds}
      setSelectedSurveyGroupIds={setSelectedSurveyGroupIds}
      selectedSurveyWorkerIds={selectedSurveyWorkerIds}
      setSelectedSurveyWorkerIds={setSelectedSurveyWorkerIds}
      surveyDeadlineDate={surveyDeadlineDate}
      setSurveyDeadlineDate={setSurveyDeadlineDate}
      surveyDeadlineTime={surveyDeadlineTime}
      setSurveyDeadlineTime={setSurveyDeadlineTime}
      handleLaunchSurvey={handleLaunchSurvey}
      ensureSurveyPeopleLoaded={ensureSurveyPeopleLoaded}
      surveySubmitting={surveySubmitting}
    />
  )

  return (
    <div
      className={cn(
        'flex flex-col',
        layout === 'modal' ? 'max-h-[92vh]' : 'min-w-0'
      )}
    >
      {!shouldHideHeader ? (
        <QuadrantModalHeader
          layout={layout}
          eventName={eventName}
          service={event.service}
          pax={event.numPax}
          eventStartTime={event.startTime}
          startTime={startTime}
          location={location}
        />
      ) : null}

      <div
        className={cn(
          'overflow-y-auto',
          layout === 'modal'
            ? 'flex-1 px-3 py-3 sm:px-4'
            : 'max-h-[min(70vh,760px)] px-1 py-1'
        )}
      >
            <div className={layout === 'inline' ? 'space-y-2' : 'space-y-3'}>
              {QUADRANT_AUTO_GENERATION_ENABLED ? (
                <>
                  <QuadrantModeSelector mode={mode} onModeChange={setMode} />

                  {mode === 'auto' && isQuadrantCoreDept && (
                    <AutoLearningBanner
                      loading={autoPreviewLoading}
                      error={autoPreviewError}
                      preview={autoPreview}
                      onSwitchToSemi={() => setMode('semi')}
                      onSwitchToManual={() => setMode('manual')}
                    />
                  )}
                </>
              ) : null}

          {!surveyInServeisToolbar ? surveyPanel : null}

          {!isLogistica && !isCuina && (
            <div className={`grid gap-4 ${isServeis ? 'lg:grid-cols-3' : 'grid-cols-2'}`}>
              {!isServeis && (
                <>
                  <div>
                    <Label>Data Inici</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Data Final</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </>
              )}
              {!isCuina && !isServeis && (
                <div>
                  <Label>Hora Inici</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
              )}
              {!isCuina && !isServeis && (
                <div>
                  <Label>Hora Fi</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {isCuina && (
            <CuinaPhasePanel
              cuinaTopBar={{
                mode,
                manualResp,
                setManualResp,
                availableResponsables,
                availableConductors,
                startTime,
                setStartTime,
                endTime,
                setEndTime,
                isMultiDayEvent,
                generationScope,
                setGenerationScope,
                cuinaTotals,
                editorActions,
              }}
              groups={cuinaGroups}
              eventStartDate={startDate}
              mode={mode}
              compact={layout === 'inline'}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              availableTreballadors={availableTreballadors}
              availableVehicles={cuinaAvailableVehicles}
              availableVehicleCount={cuinaAvailableVehicleCount}
              isVehicleIdAssigned={isCuinaVehicleIdAssigned}
              addGroup={addCuinaGroup}
              removeGroup={removeCuinaGroup}
              updateGroup={updateCuinaGroup}
              cuinaEtt={cuinaEtt}
              toggleEtt={toggleCuinaEtt}
              updateEtt={updateCuinaEtt}
            />
          )}

          {isServeis && (
            <ServicePhasePanel
              serveisTopBar={{
                mode,
                manualResp,
                setManualResp,
                availableResponsables,
                availableConductors,
                isMultiDayEvent,
                generationScope,
                setGenerationScope,
                vestimentModelChoice,
                setVestimentModelChoice,
                serveisVestimentModels,
                surveySlot: surveyInServeisToolbar ? surveyPanel : undefined,
                editorActions,
              }}
              groups={servicePhaseGroups}
              totals={serviceTotals}
              meetingPoint={meetingPoint}
              eventStartDate={startDate}
              mode={mode}
              compact={layout === 'inline'}
              settings={servicePhaseSettings}
              visibility={servicePhaseVisibility}
              ettState={servicePhaseEtt}
              manualResponsibleId={manualResp}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              availableJamoneros={availableJamoneros}
              availableTreballadors={availableTreballadors}
              driverCrews={driverCrews}
              jamoneroAssignments={serviceJamoneroAssignments}
              setJamoneroCount={setServiceJamoneroCount}
              updateJamoneroAssignment={updateServiceJamoneroAssignment}
              setManualResponsible={setManualResp}
              toggleSelection={toggleServicePhaseSelection}
              updateSetting={updateServicePhaseSetting}
              toggleVisibility={toggleServicePhaseVisibility}
              addGroup={addServiceGroup}
              removeGroup={removeServiceGroup}
              updateGroup={updateServiceGroup}
              toggleEtt={toggleServicePhaseEtt}
              updateEtt={updateServicePhaseEtt}
            />
          )}

          {isLogistica && (
            <LogisticsPhasePanel
              logisticaTopBar={{
                mode,
                manualResp,
                setManualResp,
                availableResponsables,
                availableConductors,
                startTime,
                setStartTime,
                endTime,
                setEndTime,
                isMultiDayEvent,
                generationScope,
                setGenerationScope,
                editorActions,
              }}
              phaseForms={phaseForms}
              phaseSettings={phaseSettings}
              phaseVisibility={phaseVisibility}
              phaseVehicleAssignments={phaseVehicleAssignments}
              availableVehicles={availableVehicles}
              availableConductors={availableConductors}
              availableResponsables={availableResponsables}
              mode={mode}
              compact={layout === 'inline'}
              availableTreballadors={availableTreballadors}
              department={department}
              excludeEventId={
                String(existingDraft?.id || '').trim() ||
                String(event.id || '').trim().split('__')[0] ||
                undefined
              }
              togglePhaseVisibility={togglePhaseVisibility}
              updatePhaseForm={updatePhaseForm}
              updatePhaseSetting={updatePhaseSetting}
              updatePhaseVehicleAssignment={updatePhaseVehicleAssignment}
              replacePhaseVehicleAssignments={replacePhaseVehicleAssignments}
              ettOpen={ettOpen}
              ettData={ettData}
              toggleEtt={() => setEttOpen(!ettOpen)}
              updateEtt={(patch) => setEttData({ ...ettData, ...patch })}
            />
          )}

          <MultiDayDateSelector
            visible={isMultiDayEvent && generationScope === 'event'}
            dates={multiDayDates}
            selectedDates={selectedMultiDates}
            setSelectedDates={setSelectedMultiDates}
          />

            </div>
          </div>

      {layout === 'inline' ? (
        <>
          {error ? (
            <div className="border-t border-slate-200 px-3 py-2 text-sm text-red-600">{error}</div>
          ) : null}
          {success ? (
            <div className="border-t border-slate-200 px-3 py-2 text-sm text-green-600">
              Borrador creat!
            </div>
          ) : null}
        </>
      ) : (
        <QuadrantModalFooter
          loading={loading}
          error={error}
          success={success}
          canAutoGen={canAutoGen}
          mode={mode}
          isQuadrantCoreDept={isQuadrantCoreDept}
          autoPreview={autoPreview}
          autoPreviewLoading={autoPreviewLoading}
          onCancel={handleClose}
          onSave={handleAutoGenAndSave}
        />
      )}
    </div>
  )
}

export default function QuadrantModal({ open, onOpenChange, event, onSaved }: QuadrantModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[97vw] !max-w-[1700px] max-h-[92vh] overflow-hidden rounded-2xl p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <QuadrantEditor
          event={event}
          active={open}
          layout="modal"
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
