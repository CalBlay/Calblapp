import { useMemo } from 'react'
import Image from 'next/image'
import { matchesMaintenanceTicketLocation } from '@/lib/maintenanceTicketCreators'
import {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  formatTicketAttachmentLimitMb,
} from '@/lib/media/ticketAttachments'
import type { PendingTicketAttachment } from '../useMaintenanceTicketComposer'
import type { MachineItem, TicketPriority } from '../types'

export type TicketAttachmentPreview = Pick<PendingTicketAttachment, 'preview' | 'kind'>

type Props = {
  locations: string[]
  machines: MachineItem[]
  createPriority: TicketPriority
  setCreatePriority: (value: TicketPriority) => void
  locationQuery: string
  setLocationQuery: (value: string) => void
  createLocation: string
  setCreateLocation: (value: string) => void
  machineQuery: string
  setMachineQuery: (value: string) => void
  createMachine: string
  setCreateMachine: (value: string) => void
  createDescription: string
  setCreateDescription: (value: string) => void
  showLocationList: boolean
  setShowLocationList: (value: boolean) => void
  showMachineList: boolean
  setShowMachineList: (value: boolean) => void
  priorityLabels: Record<TicketPriority, string>
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
  /** @deprecated */
  onImageChange?: (files: FileList | null) => void | Promise<void>
  /** @deprecated */
  imagePreviews?: string[]
  /** @deprecated */
  imageCount?: number
  /** @deprecated */
  maxImages?: number
  /** @deprecated */
  onRemoveImage?: (index: number) => void
  /** @deprecated */
  imageError?: string | null
}

export default function CreateTicketModal({
  locations,
  machines,
  createPriority,
  setCreatePriority,
  locationQuery,
  setLocationQuery,
  createLocation: _createLocation,
  setCreateLocation,
  machineQuery,
  setMachineQuery,
  createMachine: _createMachine,
  setCreateMachine,
  createDescription,
  setCreateDescription,
  showLocationList,
  setShowLocationList,
  showMachineList,
  setShowMachineList,
  priorityLabels,
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
    (attachmentPreviews && attachmentPreviews.length > 0)
      ? attachmentPreviews
      : (imagePreviews || []).map((preview) => ({ preview, kind: 'image' as const }))
  const count = attachmentCount || imageCount || 0
  const maxFiles = maxAttachments || maxImages || 3
  const removeAt = onRemoveAttachment || onRemoveImage || (() => {})
  const fileError = attachmentError ?? imageError ?? null
  const videoLimitLabel = formatTicketAttachmentLimitMb(DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
  const effectiveLocation = (_createLocation || locationQuery).trim()
  const machineQueryNorm = machineQuery.trim().toLowerCase()

  const locationMachines = useMemo(
    () =>
      effectiveLocation
        ? machines.filter((machine) =>
            matchesMaintenanceTicketLocation(machine.location, effectiveLocation)
          )
        : [],
    [effectiveLocation, machines]
  )

  const filteredMachines = useMemo(
    () =>
      machineQueryNorm
        ? locationMachines.filter((machine) =>
            machine.label.toLowerCase().includes(machineQueryNorm)
          )
        : locationMachines,
    [locationMachines, machineQueryNorm]
  )

  const clearMachine = () => {
    setMachineQuery('')
    setCreateMachine('')
    setShowMachineList(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4"
      onClick={() => {
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
                Ubicacio *
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base"
                  placeholder="Cerca ubicacio..."
                  value={locationQuery}
                  required
                  onFocus={() => setShowLocationList(true)}
                  onChange={(e) => {
                    setLocationQuery(e.target.value)
                    setCreateLocation('')
                    setShowLocationList(true)
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
                      clearMachine()
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 hover:text-gray-600"
                    aria-label="Esborrar"
                  >
                    x
                  </button>
                ) : null}
              </div>
              {showLocationList ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {locations
                    .filter((location) => location.toLowerCase().includes(locationQuery.toLowerCase()))
                    .map((location) => (
                      <button
                        key={location}
                        type="button"
                        onClick={() => {
                          setCreateLocation(location)
                          setLocationQuery(location)
                          setShowLocationList(false)
                          clearMachine()
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        {location}
                      </button>
                    ))}
                  {locations.filter((location) => location.toLowerCase().includes(locationQuery.toLowerCase()))
                    .length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="relative">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Maquinaria *
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-2xl border px-4 pr-10 text-base disabled:bg-slate-50"
                  placeholder={
                    effectiveLocation
                      ? 'Escriu o filtra maquinaria d aquesta ubicacio...'
                      : 'Primer selecciona una ubicacio...'
                  }
                  value={machineQuery}
                  required
                  disabled={!effectiveLocation}
                  onFocus={() => {
                    if (effectiveLocation) setShowMachineList(true)
                  }}
                  onChange={(e) => {
                    setMachineQuery(e.target.value)
                    setCreateMachine('')
                    setShowMachineList(true)
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
              {showMachineList && effectiveLocation ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border bg-white shadow-lg">
                  {filteredMachines.map((machine) => (
                    <button
                      key={machine.code + machine.name}
                      type="button"
                      onClick={() => {
                        setCreateMachine(machine.label)
                        setMachineQuery(machine.label)
                        setShowMachineList(false)
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      {machine.label}
                    </button>
                  ))}
                  {filteredMachines.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      {locationMachines.length === 0
                        ? 'No hi ha maquinaria registrada per aquesta ubicacio. Pots escriure el nom manualment.'
                        : 'Sense resultats. Pots escriure el nom de la maquinaria al camp.'}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {machines.length === 0 ? (
                <div className="mt-1 text-xs text-amber-600">No s&apos;ha pogut carregar la maquinaria.</div>
              ) : null}
              {effectiveLocation && locationMachines.length > 0 ? (
                <div className="mt-1 text-xs text-slate-500">
                  {locationMachines.length} maquina{locationMachines.length === 1 ? '' : 's'} a aquesta ubicacio
                </div>
              ) : null}
            </div>
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
                Fotos i videos *{' '}
                <span className="font-normal text-slate-500">(min. 1, max. {maxFiles})</span>
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
                {fileError ? <span className="text-red-600">{fileError}</span> : null}
                {attachmentCompressing ? <span>Comprimint video…</span> : null}
              </div>
            </div>

            {previews.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {previews.map((item, index) => (
                  <div key={`${item.preview}-${index}`} className="relative overflow-hidden rounded-2xl border">
                    {item.kind === 'video' ? (
                      <video
                        src={item.preview}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-28 w-full bg-black object-contain"
                      />
                    ) : (
                      <Image
                        src={item.preview}
                        alt={`Previsualitzacio ${index + 1}`}
                        width={448}
                        height={112}
                        className="h-28 w-full object-cover"
                        unoptimized
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
                Cal adjuntar com a minim una imatge o un video. Les fotos es comprimeixen
                automaticament (max. 1 MB). Els videos es redueixen al navegador (objectiu ~
                {videoLimitLabel}, max. 2 min).
              </div>
            )}
          </div>

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-full border px-5 text-sm font-medium"
          >
            Cancel.lar
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={createBusy || attachmentCompressing || !canCreate}
            className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createBusy ? 'Desant...' : 'Crear ticket'}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
