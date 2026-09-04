'use client'

import { useEffect, useMemo } from 'react'
import Image from 'next/image'
import { matchesMaintenanceTicketLocation } from '@/lib/maintenanceTicketCreators'
import {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  formatTicketAttachmentLimitMb,
} from '@/lib/media/ticketAttachments'
import type { PendingTicketAttachment } from '../useMaintenanceTicketComposer'
import type { MachineItem, TicketPriority, TicketType } from '../types'
import type { CenterRow } from '@/app/menu/manteniment/dades/types'

const normalizeSiteValue = (value?: string | null) => String(value || '').trim().toLowerCase()

export type TicketAttachmentPreview = Pick<PendingTicketAttachment, 'preview' | 'kind'>

type Props = {
  centers: CenterRow[]
  machines: MachineItem[]
  createPriority: TicketPriority
  setCreatePriority: (value: TicketPriority) => void
  centerQuery: string
  setCenterQuery: (value: string) => void
  createCenter: string
  setCreateCenter: (value: string) => void
  locationQuery: string
  setLocationQuery: (value: string) => void
  createLocation: string
  setCreateLocation: (value: string) => void
  zoneQuery: string
  setZoneQuery: (value: string) => void
  createZone: string
  setCreateZone: (value: string) => void
  createWorkerName?: string
  setCreateWorkerName?: (value: string) => void
  showCenterList: boolean
  setShowCenterList: (value: boolean) => void
  showLocationList: boolean
  setShowLocationList: (value: boolean) => void
  showZoneList: boolean
  setShowZoneList: (value: boolean) => void
  machineQuery: string
  setMachineQuery: (value: string) => void
  createMachine: string
  setCreateMachine: (value: string) => void
  createDescription: string
  setCreateDescription: (value: string) => void
  needsWorkerName?: boolean
  showMachineList: boolean
  setShowMachineList: (value: boolean) => void
  priorityLabels: Record<TicketPriority, string>
  createTicketType?: TicketType
  setCreateTicketType?: (value: TicketType) => void
  allowTicketTypeSelection?: boolean
  onClose: () => void
  onCreate: () => void
  createBusy: boolean
  canCreate: boolean
  onAttachmentChange?: (files: FileList | null) => void | Promise<void>
  attachmentPreviews?: TicketAttachmentPreview[]
  attachmentCount?: number
  maxAttachments?: number
  onRemoveAttachment?: (index: number) => void
  attachmentError?: string | null
  attachmentCompressing?: boolean
  formError: string | null
  onImageChange?: (files: FileList | null) => void | Promise<void>
  imagePreviews?: string[]
  imageCount?: number
  maxImages?: number
  onRemoveImage?: (index: number) => void
  imageError?: string | null
}

export default function CreateTicketModal({
  centers,
  machines,
  createPriority,
  setCreatePriority,
  centerQuery,
  setCenterQuery,
  createCenter: _createCenter,
  setCreateCenter,
  locationQuery,
  setLocationQuery,
  createLocation: _createLocation,
  setCreateLocation,
  zoneQuery,
  setZoneQuery,
  createZone: _createZone,
  setCreateZone,
  createWorkerName = '',
  setCreateWorkerName,
  showCenterList,
  setShowCenterList,
  showLocationList,
  setShowLocationList,
  showZoneList,
  setShowZoneList,
  machineQuery,
  setMachineQuery,
  createMachine: _createMachine,
  setCreateMachine,
  createDescription,
  setCreateDescription,
  needsWorkerName: _needsWorkerName = false,
  showMachineList,
  setShowMachineList,
  priorityLabels,
  createTicketType = 'maquinaria',
  setCreateTicketType,
  allowTicketTypeSelection = false,
  onClose,
  onCreate,
  createBusy,
  canCreate,
  onAttachmentChange,
  attachmentPreviews,
  attachmentCount,
  maxAttachments,
  onRemoveAttachment,
  attachmentError,
  attachmentCompressing = false,
  formError,
  onImageChange,
  imagePreviews,
  imageCount,
  maxImages,
  onRemoveImage,
  imageError,
}: Props) {
  const handleFileChange = onAttachmentChange || onImageChange || (async () => {})
  const previews: TicketAttachmentPreview[] =
    attachmentPreviews && attachmentPreviews.length > 0
      ? attachmentPreviews
      : (imagePreviews || []).map((preview) => ({ preview, kind: 'image' as const }))
  const count = attachmentCount || imageCount || 0
  const maxFiles = maxAttachments || maxImages || 3
  const removeAt = onRemoveAttachment || onRemoveImage || (() => {})
  const fileError = attachmentError ?? imageError ?? null
  const videoLimitLabel = formatTicketAttachmentLimitMb(DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
  const effectiveCenter = (_createCenter || centerQuery).trim()
  const effectiveLocation = (_createLocation || locationQuery).trim()
  const effectiveZone = (_createZone || zoneQuery).trim()
  const machineQueryNorm = machineQuery.trim().toLowerCase()

  const filteredCenters = useMemo(
    () =>
      centers.filter((center) =>
        center.name.toLowerCase().includes(centerQuery.toLowerCase())
      ),
    [centers, centerQuery]
  )

  const selectedCenter = useMemo(
    () =>
      centers.find((center) => center.name.trim().toLowerCase() === effectiveCenter.toLowerCase()) ||
      null,
    [centers, effectiveCenter]
  )

  const centerLocations = useMemo(
    () =>
      (selectedCenter?.locationNodes?.map((item) => item.name) || selectedCenter?.internalLocations || []).filter(
        Boolean
      ),
    [selectedCenter]
  )
  const canSkipLocation = Boolean(effectiveCenter) && centerLocations.length === 0

  useEffect(() => {
    if (!canSkipLocation) return
    if (effectiveLocation) return
    setCreateLocation(effectiveCenter)
    setLocationQuery(effectiveCenter)
  }, [canSkipLocation, effectiveCenter, effectiveLocation, setCreateLocation, setLocationQuery])

  const filteredLocations = useMemo(
    () =>
      centerLocations.filter((location) =>
        location.toLowerCase().includes(locationQuery.toLowerCase())
      ),
    [centerLocations, locationQuery]
  )

  const selectedLocationNode = useMemo(
    () =>
      selectedCenter?.locationNodes?.find(
        (location) => normalizeSiteValue(location.name) === normalizeSiteValue(effectiveLocation)
      ) || null,
    [effectiveLocation, selectedCenter]
  )

  const machineCandidates = useMemo(
    () =>
      machines.filter((machine) => {
        if (effectiveCenter && normalizeSiteValue(machine.center) !== normalizeSiteValue(effectiveCenter)) {
          return false
        }
        if (effectiveLocation && normalizeSiteValue(machine.location) !== normalizeSiteValue(effectiveLocation)) {
          return false
        }
        if (effectiveZone && normalizeSiteValue(machine.zone) !== normalizeSiteValue(effectiveZone)) {
          return false
        }
        return true
      }),
    [effectiveCenter, effectiveLocation, effectiveZone, machines]
  )

  const zoneOptions = useMemo(() => {
    const baseZones = Array.isArray(selectedLocationNode?.zones) ? selectedLocationNode.zones : []
    const machineZones = machineCandidates.map((machine) => String(machine.zone || '').trim()).filter(Boolean)
    const machineZonesByQuery = machines
      .filter((machine) => {
        if (effectiveCenter && normalizeSiteValue(machine.center) !== normalizeSiteValue(effectiveCenter)) {
          return false
        }
        if (effectiveLocation && normalizeSiteValue(machine.location) !== normalizeSiteValue(effectiveLocation)) {
          return false
        }
        if (!machineQueryNorm) return true
        return machine.label.toLowerCase().includes(machineQueryNorm)
      })
      .map((machine) => String(machine.zone || '').trim())
      .filter(Boolean)

    const unique = new Map<string, string>()
    ;[...baseZones, ...machineZones, ...machineZonesByQuery].forEach((zone) => {
      const key = normalizeSiteValue(zone)
      if (!key || unique.has(key)) return
      unique.set(key, zone)
    })

    return [...unique.values()]
  }, [effectiveCenter, effectiveLocation, machineCandidates, machineQueryNorm, machines, selectedLocationNode?.zones])

  useEffect(() => {
    if (effectiveZone && !zoneOptions.some((zone) => normalizeSiteValue(zone) === normalizeSiteValue(effectiveZone))) {
      setCreateZone('')
      setZoneQuery('')
    }
  }, [effectiveZone, setCreateZone, setZoneQuery, zoneOptions])

  const locationMachines = useMemo(() => {
    if (!effectiveCenter || !effectiveLocation) return []
    return machineCandidates.filter((machine) =>
      matchesMaintenanceTicketLocation(machine.location, effectiveLocation)
    )
  }, [effectiveCenter, effectiveLocation, machineCandidates])

  const filteredMachines = useMemo(
    () =>
      machineQueryNorm
        ? locationMachines.filter((machine) =>
            machine.label.toLowerCase().includes(machineQueryNorm)
          )
        : locationMachines,
    [locationMachines, machineQueryNorm]
  )
  const shouldShowMachineDropdown =
    showMachineList && effectiveCenter && effectiveLocation && locationMachines.length > 0

  const clearMachine = () => {
    setMachineQuery('')
    setCreateMachine('')
    setShowMachineList(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4"
      onClick={() => {
        setShowCenterList(false)
        setShowLocationList(false)
        setShowMachineList(false)
      }}
    >
      <div
        className="flex max-h-[min(92dvh,100svh)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-h-[90vh] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-slate-900">Nou ticket</h2>
              <p className="mt-1 text-sm leading-snug text-slate-500">
                Tots els camps son obligatoris. Cal adjuntar entre 1 i {maxFiles} fotos o videos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-lg text-gray-500"
              aria-label="Tancar"
            >
              x
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">
          {allowTicketTypeSelection ? (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Destinació *
              </label>
              <select
                className="h-12 w-full rounded-2xl border bg-white px-4 text-base"
                value={createTicketType}
                onChange={(event) => setCreateTicketType?.(event.target.value as TicketType)}
              >
                <option value="maquinaria">Manteniment</option>
                <option value="deco">Imatge-Deco</option>
              </select>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Prioritat *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['urgent', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCreatePriority(key)}
                  className={`min-h-[44px] rounded-2xl border px-3 text-sm font-semibold ${
                    createPriority === key
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-200 bg-gray-50 text-gray-800'
                  }`}
                >
                  {priorityLabels[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Centre *
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base"
                  placeholder="Cerca centre..."
                  value={centerQuery}
                  required
                  onFocus={() => setShowCenterList(true)}
                  onChange={(e) => {
                    setCenterQuery(e.target.value)
                    setCreateCenter('')
                    setLocationQuery('')
                    setCreateLocation('')
                    setZoneQuery('')
                    setCreateZone('')
                    setShowCenterList(true)
                    setShowLocationList(false)
                    setShowZoneList(false)
                    clearMachine()
                  }}
                />
                {centerQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCenterQuery('')
                      setCreateCenter('')
                      setLocationQuery('')
                      setCreateLocation('')
                      setZoneQuery('')
                      setCreateZone('')
                      setShowCenterList(false)
                      setShowLocationList(false)
                      setShowZoneList(false)
                      clearMachine()
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 hover:text-gray-600"
                    aria-label="Esborrar"
                  >
                    x
                  </button>
                ) : null}
              </div>
              {showCenterList ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {filteredCenters.map((center) => (
                    <button
                      key={center.id}
                      type="button"
                      onClick={() => {
                        const centerLocationCount =
                          center.locationNodes?.length || (center.internalLocations || []).filter(Boolean).length
                        setCreateCenter(center.name)
                        setCenterQuery(center.name)
                        if (centerLocationCount === 0) {
                          setLocationQuery(center.name)
                          setCreateLocation(center.name)
                        } else {
                          setLocationQuery('')
                          setCreateLocation('')
                        }
                        setZoneQuery('')
                        setCreateZone('')
                        setShowCenterList(false)
                        setShowLocationList(false)
                        setShowZoneList(false)
                        clearMachine()
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      {center.name}
                    </button>
                  ))}
                  {filteredCenters.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="relative">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                {canSkipLocation ? 'Ubicacio' : 'Ubicacio *'}
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base disabled:bg-slate-50"
                  placeholder={
                    !effectiveCenter
                      ? 'Primer selecciona un centre...'
                      : centerLocations.length > 0
                        ? 'Cerca ubicacio...'
                        : 'Aquest centre no te ubicacions configurades. Es fara servir el centre.'
                  }
                  value={locationQuery}
                  required={!canSkipLocation}
                  disabled={!effectiveCenter || centerLocations.length === 0}
                  onFocus={() => {
                    if (effectiveCenter) setShowLocationList(true)
                  }}
                  onChange={(e) => {
                    setLocationQuery(e.target.value)
                    setCreateLocation('')
                    setZoneQuery('')
                    setCreateZone('')
                    setShowLocationList(true)
                    setShowZoneList(false)
                    clearMachine()
                  }}
                />
                {locationQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLocationQuery('')
                      setCreateLocation('')
                      setShowLocationList(false)
                      setZoneQuery('')
                      setCreateZone('')
                      setShowZoneList(false)
                      clearMachine()
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 hover:text-gray-600"
                    aria-label="Esborrar"
                  >
                    x
                  </button>
                ) : null}
              </div>
              {canSkipLocation ? (
                <p className="mt-2 text-xs text-slate-500">
                  Aquest centre no te ubicacions internes. El ticket es creara amb el centre
                  seleccionat.
                </p>
              ) : null}
              {showLocationList ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {filteredLocations.map((location) => (
                    <button
                      key={location}
                      type="button"
                      onClick={() => {
                        setCreateLocation(location)
                        setLocationQuery(location)
                        setShowLocationList(false)
                        setZoneQuery('')
                        setCreateZone('')
                        setShowZoneList(false)
                        clearMachine()
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      {location}
                    </button>
                  ))}
                  {filteredLocations.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="relative">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Zona
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base disabled:bg-slate-50"
                  placeholder={
                    !effectiveLocation
                      ? 'Primer selecciona centre i ubicacio...'
                      : zoneOptions.length > 0
                        ? 'Cerca zona...'
                        : 'Sense zones registrades per aquesta ubicacio'
                  }
                  value={zoneQuery}
                  disabled={!effectiveLocation || zoneOptions.length === 0}
                  onFocus={() => {
                    if (effectiveLocation && zoneOptions.length > 0) setShowZoneList(true)
                  }}
                  onChange={(e) => {
                    setZoneQuery(e.target.value)
                    setCreateZone('')
                    setShowZoneList(zoneOptions.length > 0)
                    clearMachine()
                  }}
                  onBlur={() => {
                    if (!_createZone && zoneQuery.trim()) {
                      setCreateZone(zoneQuery.trim())
                    }
                  }}
                />
                {zoneQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setZoneQuery('')
                      setCreateZone('')
                      setShowZoneList(false)
                      clearMachine()
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 hover:text-gray-600"
                    aria-label="Esborrar"
                  >
                    x
                  </button>
                ) : null}
              </div>
              {showZoneList ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {zoneOptions
                    .filter((zone) => zone.toLowerCase().includes(zoneQuery.toLowerCase()))
                    .map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => {
                          setCreateZone(zone)
                          setZoneQuery(zone)
                          setShowZoneList(false)
                          clearMachine()
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        {zone}
                      </button>
                    ))}
                  {zoneOptions.filter((zone) => zone.toLowerCase().includes(zoneQuery.toLowerCase())).length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                Camp opcional. Si tries una zona, la maquinària es filtra automàticament.
              </p>
            </div>

            <div className="relative md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                {createTicketType === 'deco' ? 'Element o petició Deco *' : 'Maquinaria *'}
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base disabled:bg-slate-50"
                  placeholder={
                    effectiveCenter && effectiveLocation
                      ? 'Selecciona una maquina del llistat o escriu text lliure...'
                      : 'Primer selecciona centre i ubicacio...'
                  }
                  value={machineQuery}
                  required
                  disabled={!effectiveCenter || !effectiveLocation}
                  onFocus={() => {
                    if (effectiveCenter && effectiveLocation && locationMachines.length > 0) setShowMachineList(true)
                  }}
                  onChange={(e) => {
                    setMachineQuery(e.target.value)
                    setCreateMachine('')
                    setShowMachineList(locationMachines.length > 0)
                  }}
                  onBlur={() => {
                    if (!_createMachine && machineQuery.trim()) {
                      setCreateMachine(machineQuery.trim())
                    }
                  }}
                />
                {machineQuery ? (
                  <button
                    type="button"
                    onClick={clearMachine}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 hover:text-gray-600"
                    aria-label="Esborrar"
                  >
                    x
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Pots seleccionar una maquina del llistat o escriure el nom manualment.
              </p>
              {shouldShowMachineDropdown ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {filteredMachines.map((machine) => (
                    <button
                      key={machine.code + machine.name}
                      type="button"
                      onClick={() => {
                        setCreateMachine(machine.label)
                        setMachineQuery(machine.label)
                        if (machine.zone) {
                          setCreateZone(machine.zone)
                          setZoneQuery(machine.zone)
                        }
                        setShowMachineList(false)
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      {machine.label}
                    </button>
                  ))}
                  {filteredMachines.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      Sense resultats. Pots escriure el nom de la maquinaria al camp.
                    </div>
                  ) : null}
                </div>
              ) : null}
              {effectiveCenter && effectiveLocation && locationMachines.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-gray-500">
                  No hi ha maquinaria registrada per aquesta ubicacio. Pots escriure el nom
                  manualment.
                </div>
              ) : null}
              {machines.length === 0 ? (
                <div className="mt-1 text-xs text-amber-600">No s&apos;ha pogut carregar la maquinaria.</div>
              ) : null}
              {effectiveCenter && effectiveLocation && locationMachines.length > 0 ? (
                <div className="mt-1 text-xs text-slate-500">
                  {locationMachines.length} maquina{locationMachines.length === 1 ? '' : 's'}
                  {effectiveZone ? ' a aquesta zona' : ' en aquesta ubicacio'}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Nom treballador *
            </label>
            <input
              className="h-12 w-full rounded-2xl border px-4 text-base"
              placeholder="Qui reporta la incidencia?"
              value={createWorkerName}
              required
              autoComplete="off"
              onChange={(e) => setCreateWorkerName?.(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Indica la persona concreta que reporta el ticket, encara que el compte sigui generic del centre.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Descripcio *
            </label>
            <textarea
              className="min-h-[140px] w-full rounded-2xl border px-4 py-3 text-base"
              placeholder="Que s'ha d'arreglar?"
              value={createDescription}
              required
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Fotos i videos * <span className="font-normal text-slate-500">(min. 1, max. {maxFiles})</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium">
                  Fitxer
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    disabled={count >= maxFiles || attachmentCompressing}
                    onChange={(e) => {
                      void handleFileChange(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium">
                  Foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={count >= maxFiles || attachmentCompressing}
                    onChange={(e) => {
                      void handleFileChange(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800">
                  Video
                  <input
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    disabled={count >= maxFiles || attachmentCompressing}
                    onChange={(e) => {
                      void handleFileChange(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>
                  {count}/{maxFiles}
                </span>
                {attachmentCompressing ? <span>Comprimint...</span> : null}
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Cal adjuntar com a minim una imatge o un video. Les fotos es comprimeixen automaticament (max. 1 MB). Els videos es redueixen al navegador (objectiu ~5 MB, max. 2 min).
              </div>
              <p className="text-xs text-slate-500">Limit de video comprimit: {videoLimitLabel}.</p>
              {fileError ? <p className="text-sm text-rose-600">{fileError}</p> : null}
            </div>

            {previews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((item, index) => (
                  <div key={`${item.preview}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {item.kind === 'video' ? (
                      <video src={item.preview} className="h-28 w-full object-cover" controls muted />
                    ) : (
                      <Image
                        src={item.preview}
                        alt={`Adjunt ${index + 1}`}
                        width={240}
                        height={180}
                        className="h-28 w-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                      aria-label={`Eliminar adjunt ${index + 1}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}

          <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-100 bg-white py-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-full border border-slate-300 px-4 text-sm font-medium"
            >
              Cancel.lar
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate || createBusy || attachmentCompressing}
              className="min-h-[48px] flex-1 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createBusy ? 'Creant...' : 'Crear ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
