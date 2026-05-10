'use client'

import { useMemo, useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useSession } from 'next-auth/react'
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
import CuinaSection from './CuinaSection'
import AutoLearningBanner from './AutoLearningBanner'
import QuadrantModalHeader from './QuadrantModalHeader'
import QuadrantModeSelector from './QuadrantModeSelector'
import QuadrantTopBarCuina from './QuadrantTopBarCuina'
import QuadrantTopBarServeis from './QuadrantTopBarServeis'
import QuadrantTopBarLogistica from './QuadrantTopBarLogistica'
import QuadrantModalFooter from './QuadrantModalFooter'
import type {
  GenerationScope,
  QuadrantModalProps,
  QuadrantMode,
  SessionUserInfo,
} from './quadrantModalTypes'
import { extractDate, getDateRange, splitTitle } from './quadrantModalUtils'

export default function QuadrantModal({ open, onOpenChange, event, onSaved }: QuadrantModalProps) {
  const { data: session } = useSession()
  const sessionUser = session?.user as SessionUserInfo | undefined
  const userRole = normalizeRole(String(sessionUser?.role || ''))
  const department = (
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
  const [mode, setMode] = useState<QuadrantMode>('semi')

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
    phaseResponsibles,
    updatePhaseResponsible,
    phaseVehicleAssignments,
    updatePhaseVehicleAssignment,
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
    ettEntry,
    availableResponsables,
    availableConductors,
    availableJamoneros,
    availableTreballadors,
  } = useQuadrantFormState({ event, department, modalOpen: open, mode })

  const rawTitle = event.summary || event.title || ''
  const { name: eventName, code: parsedCode } = splitTitle(rawTitle)
  const _eventCode = parsedCode || (rawTitle.match(/[A-Z]\d{6,}/)?.[0] ?? '').toUpperCase()

  const [generationScope, setGenerationScope] = useState<GenerationScope>('day')
  const [showJamoneroDetails, setShowJamoneroDetails] = useState(true)

  const { autoPreview, autoPreviewLoading, autoPreviewError } = useQuadrantAutoPreview({
    open,
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
  })

  const { serveisVestimentModels, vestimentModelChoice, setVestimentModelChoice } =
    useServeisVestiment({ open, isServeis, event })

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
    setCuinaEtt,
    cuinaTotals,
    isManualResponsibleConductor,
    cuinaVehiclesPayload,
    addCuinaGroup,
    updateCuinaGroup,
    removeCuinaGroup,
  } = useCuinaState({
    open,
    isCuina,
    mode,
    event,
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
    if (!open) return
    setGenerationScope('day')
  }, [open, event.id])

  useEffect(() => {
    if (mode !== 'manual') return
    if (manualResp === '__auto__') {
      setManualResp('')
    }
  }, [manualResp, mode, setManualResp])

  const canAutoGen = Boolean(startDate && endDate && startTime && endTime)

  const { loading, error, success, save: handleAutoGenAndSave } = useQuadrantSubmit({
    event,
    department,
    isCuina,
    isServeis,
    isQuadrantCoreDept,
    isMultiDayEvent,
    multiDayDates,
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
  })


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[97vw] !max-w-[1700px] max-h-[92vh] overflow-hidden rounded-2xl p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[92vh] flex-col">
          <QuadrantModalHeader
            eventName={eventName}
            service={event.service}
            pax={event.numPax}
            eventStartTime={event.startTime}
            startTime={startTime}
            location={location}
          />

          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            <div className="space-y-3">
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

          <SurveyLaunchPanel
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

          {!isLogistica && !isServeis && isCuina && (
            <QuadrantTopBarCuina
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
              manualResp={manualResp}
              setManualResp={setManualResp}
              availableResponsables={availableResponsables}
              cuinaTotals={cuinaTotals}
              isMultiDayEvent={isMultiDayEvent}
              generationScope={generationScope}
              setGenerationScope={setGenerationScope}
            />
          )}

          {isServeis && (
            <QuadrantTopBarServeis
              mode={mode}
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
              manualResp={manualResp}
              setManualResp={setManualResp}
              availableResponsables={availableResponsables}
              availableJamoneros={availableJamoneros}
              serviceJamoneroAssignments={serviceJamoneroAssignments}
              setServiceJamoneroCount={setServiceJamoneroCount}
              updateServiceJamoneroAssignment={updateServiceJamoneroAssignment}
              showJamoneroDetails={showJamoneroDetails}
              setShowJamoneroDetails={setShowJamoneroDetails}
              vestimentModelChoice={vestimentModelChoice}
              setVestimentModelChoice={setVestimentModelChoice}
              serveisVestimentModels={serveisVestimentModels}
              serviceTotals={serviceTotals}
              isMultiDayEvent={isMultiDayEvent}
              generationScope={generationScope}
              setGenerationScope={setGenerationScope}
            />
          )}

          {isLogistica && (
            <QuadrantTopBarLogistica
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
              isMultiDayEvent={isMultiDayEvent}
              generationScope={generationScope}
              setGenerationScope={setGenerationScope}
            />
          )}

          {isServeis && (
            <ServicePhasePanel
              groups={servicePhaseGroups}
              totals={serviceTotals}
              meetingPoint={meetingPoint}
              eventStartDate={startDate}
              mode={mode}
              settings={servicePhaseSettings}
              visibility={servicePhaseVisibility}
              ettState={servicePhaseEtt}
              manualResponsibleId={manualResp}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              availableJamoneros={availableJamoneros}
              availableTreballadors={availableTreballadors}
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
              phaseForms={phaseForms}
              phaseSettings={phaseSettings}
              phaseVisibility={phaseVisibility}
              phaseResponsibles={phaseResponsibles}
              phaseVehicleAssignments={phaseVehicleAssignments}
              availableVehicles={availableVehicles}
              availableConductors={availableConductors}
              availableResponsables={availableResponsables}
              mode={mode}
              availableTreballadors={availableTreballadors}
              togglePhaseVisibility={togglePhaseVisibility}
              updatePhaseForm={updatePhaseForm}
              updatePhaseSetting={updatePhaseSetting}
              updatePhaseResponsible={updatePhaseResponsible}
              updatePhaseVehicleAssignment={updatePhaseVehicleAssignment}
              ettOpen={ettOpen}
              ettData={ettData}
              toggleEtt={() => setEttOpen(!ettOpen)}
              updateEtt={(patch) => setEttData({ ...ettData, ...patch })}
            />
          )}

          {isCuina && (
            <CuinaSection
              mode={mode}
              cuinaGroups={cuinaGroups}
              removeCuinaGroup={removeCuinaGroup}
              updateCuinaGroup={updateCuinaGroup}
              manualResp={manualResp}
              serviceDate={startDate}
              availableTreballadors={availableTreballadors}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              addCuinaGroup={addCuinaGroup}
              cuinaEtt={cuinaEtt}
              setCuinaEtt={setCuinaEtt}
            />
          )}

            </div>
          </div>

          <QuadrantModalFooter
            loading={loading}
            error={error}
            success={success}
            canAutoGen={canAutoGen}
            mode={mode}
            isQuadrantCoreDept={isQuadrantCoreDept}
            autoPreview={autoPreview}
            autoPreviewLoading={autoPreviewLoading}
            onCancel={() => onOpenChange(false)}
            onSave={handleAutoGenAndSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
