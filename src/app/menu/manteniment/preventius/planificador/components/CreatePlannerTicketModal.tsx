'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Camera, FileText, Paperclip, Trash2, X } from 'lucide-react'
import {
  getMaintenanceLocationsForCenter,
  getMaintenanceZones,
} from '@/lib/maintenanceLocationCatalog'
import type { CenterRow, MachineRow } from '@/app/menu/manteniment/dades/types'
import type { TicketPriority } from '@/app/menu/manteniment/tickets/types'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import { compressVideoForUpload } from '@/lib/media/compressVideoForUpload'
import {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  formatTicketAttachmentLimitMb,
  isTicketDocumentMime,
  isTicketDocumentName,
  isTicketImageMime,
  isTicketVideoMime,
  MAX_TICKET_ATTACHMENTS,
  MAX_UPLOAD_DOCUMENT_BYTES,
  MAX_UPLOAD_VIDEO_BYTES,
  MAX_VIDEO_INPUT_BYTES,
} from '@/lib/media/ticketAttachments'
import { minutesFromTime, timeFromMinutes } from '../utils'

type PlannerUser = {
  id: string
  name: string
  department?: string
}

type PendingAttachment = {
  file: File
  preview: string
  kind: 'image' | 'video' | 'document'
}

type Props = {
  centers: CenterRow[]
  machines: MachineRow[]
  users: PlannerUser[]
  initialDate: string
  weekStart: Date
  dayCount: number
  availableWorkers: (
    dayIndex: number,
    start: string,
    end: string,
    ignoreId?: string
  ) => Array<{ id: string; name: string }>
  onClose: () => void
  onCreated: () => Promise<void>
}

const PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'alta', label: 'Alta' },
  { value: 'normal', label: 'Normal' },
  { value: 'baixa', label: 'Baixa' },
]

export default function CreatePlannerTicketModal({
  centers,
  machines,
  users,
  initialDate,
  weekStart,
  dayCount,
  availableWorkers,
  onClose,
  onCreated,
}: Props) {
  const [center, setCenter] = useState('')
  const [location, setLocation] = useState('')
  const [zone, setZone] = useState('')
  const [machine, setMachine] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState('08:00')
  const [duration, setDuration] = useState(60)
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [preparingAttachments, setPreparingAttachments] = useState(false)
  const attachmentsRef = useRef<PendingAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.preview))
    }
  }, [])

  const locationOptions = useMemo(
    () => getMaintenanceLocationsForCenter(centers, center),
    [center, centers]
  )
  const zoneOptions = useMemo(
    () => getMaintenanceZones(centers, center, location),
    [center, centers, location]
  )
  const machineOptions = useMemo(
    () =>
      machines.filter((item) => {
        if (center && item.center && item.center !== center) return false
        if (location && item.location && item.location !== location) return false
        if (zone && item.zone && item.zone !== zone) return false
        return true
      }),
    [center, location, machines, zone]
  )

  const endTime = useMemo(
    () => timeFromMinutes(minutesFromTime(startTime) + Math.max(30, duration)),
    [duration, startTime]
  )
  const dayIndex = useMemo(
    () => differenceInCalendarDays(parseISO(date), weekStart),
    [date, weekStart]
  )
  const available = useMemo(
    () =>
      dayIndex >= 0 && dayIndex < dayCount
        ? availableWorkers(dayIndex, startTime, endTime)
        : [],
    [availableWorkers, dayCount, dayIndex, endTime, startTime]
  )
  const availableIds = useMemo(() => new Set(available.map((item) => item.id)), [available])
  const selectedWorkers = useMemo(
    () => users.filter((user) => workerIds.includes(user.id)),
    [users, workerIds]
  )

  const toggleWorker = (id: string) => {
    setWorkerIds((current) =>
      current.includes(id) ? current.filter((workerId) => workerId !== id) : [...current, id]
    )
  }

  const handleAttachmentChange = async (fileList: FileList | null) => {
    const selected = fileList ? Array.from(fileList) : []
    if (!selected.length) return

    const remainingSlots = MAX_TICKET_ATTACHMENTS - attachments.length
    if (remainingSlots <= 0) {
      setError(`Només pots adjuntar fins a ${MAX_TICKET_ATTACHMENTS} fitxers.`)
      return
    }

    try {
      setPreparingAttachments(true)
      setError(null)
      const prepared: PendingAttachment[] = []

      for (const file of selected.slice(0, remainingSlots)) {
        if (isTicketVideoMime(file.type)) {
          if (file.size > MAX_VIDEO_INPUT_BYTES) {
            throw new Error(
              `El vídeo supera el límit de ${formatTicketAttachmentLimitMb(MAX_VIDEO_INPUT_BYTES)} abans de comprimir.`
            )
          }
          const optimized = await compressVideoForUpload(file, DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
          if (optimized.size > MAX_UPLOAD_VIDEO_BYTES) {
            throw new Error(
              `El vídeo comprimit encara supera ${formatTicketAttachmentLimitMb(MAX_UPLOAD_VIDEO_BYTES)}.`
            )
          }
          prepared.push({
            file: optimized,
            preview: URL.createObjectURL(optimized),
            kind: 'video',
          })
          continue
        }

        if (isTicketImageMime(file.type)) {
          const optimized = await compressRasterImageForUpload(file, DEFAULT_MAX_IMAGE_UPLOAD_BYTES)
          if (optimized.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
            throw new Error('Una imatge encara supera 1 MB després de comprimir-se.')
          }
          prepared.push({
            file: optimized,
            preview: URL.createObjectURL(optimized),
            kind: 'image',
          })
          continue
        }

        if (isTicketDocumentMime(file.type) || isTicketDocumentName(file.name)) {
          if (file.size > MAX_UPLOAD_DOCUMENT_BYTES) {
            throw new Error(
              `El fitxer supera el límit de ${formatTicketAttachmentLimitMb(MAX_UPLOAD_DOCUMENT_BYTES)}.`
            )
          }
          prepared.push({
            file,
            preview: URL.createObjectURL(file),
            kind: 'document',
          })
          continue
        }

        throw new Error('Només es permeten fotos, vídeos, PDF, Word, Excel o fitxers de text.')
      }

      setAttachments((current) =>
        [...current, ...prepared].slice(0, MAX_TICKET_ATTACHMENTS)
      )
      if (selected.length > remainingSlots) {
        setError(`Només s'han afegit els primers ${MAX_TICKET_ATTACHMENTS} fitxers.`)
      }
    } catch (attachmentError: unknown) {
      setError(
        attachmentError instanceof Error
          ? attachmentError.message
          : 'No s’han pogut preparar els adjunts.'
      )
    } finally {
      setPreparingAttachments(false)
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
    setError(null)
  }

  const uploadAttachments = async () => {
    const uploaded = await Promise.all(
      attachments.map(async (attachment) => {
        const form = new FormData()
        form.append('file', attachment.file)
        const response = await fetch('/api/maintenance/upload-image', {
          method: 'POST',
          body: form,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(payload?.error || "No s'ha pogut pujar un dels adjunts"))
        }
        return {
          url: payload?.url || null,
          path: payload?.path || null,
          meta: payload?.meta || null,
        }
      })
    )

    return uploaded.filter((attachment) => attachment.url || attachment.path)
  }

  const handleSubmit = async () => {
    setError(null)
    const unavailableSelected = selectedWorkers.filter((worker) => !availableIds.has(worker.id))
    if (!center || !machine.trim() || !description.trim()) {
      setError('Cal indicar centre, màquina o element i descripció.')
      return
    }
    if (attachments.length < 1) {
      setError(`Cal adjuntar com a mínim una foto o un fitxer (màxim ${MAX_TICKET_ATTACHMENTS}).`)
      return
    }
    if (dayIndex < 0 || dayIndex >= dayCount) {
      setError('La data ha de quedar dins del periode visible del planificador.')
      return
    }
    if (selectedWorkers.length === 0) {
      setError('Selecciona com a minim un treballador.')
      return
    }
    if (unavailableSelected.length > 0) {
      setError(`${unavailableSelected.map((worker) => worker.name).join(', ')} ja no està disponible en aquesta franja.`)
      return
    }

    const plannedStart = new Date(`${date}T${startTime}:00`).getTime()
    const plannedEnd = new Date(`${date}T${endTime}:00`).getTime()
    if (!Number.isFinite(plannedStart) || !Number.isFinite(plannedEnd) || plannedEnd <= plannedStart) {
      setError('La franja horària no és vàlida.')
      return
    }

    try {
      setBusy(true)
      const uploadedAttachments = await uploadAttachments()
      if (uploadedAttachments.length < 1) {
        throw new Error('Cal adjuntar com a mínim un adjunt vàlid.')
      }
      const primaryAttachment = uploadedAttachments[0]
      const response = await fetch('/api/maintenance/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationMode: 'planner_direct',
          center,
          location: center,
          workLocation: location || center,
          zone: zone || null,
          machine: machine.trim(),
          operatorTitle: machine.trim(),
          description: description.trim(),
          priority,
          ticketType: 'maquinaria',
          plannedStart,
          plannedEnd,
          estimatedMinutes: Math.max(30, duration),
          assignedToIds: selectedWorkers.map((worker) => worker.id),
          assignedToNames: selectedWorkers.map((worker) => worker.name),
          imageUrl: primaryAttachment?.url || null,
          imagePath: primaryAttachment?.path || null,
          imageMeta: primaryAttachment?.meta || null,
          images: uploadedAttachments,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload?.error || `HTTP ${response.status}`))
      }
      await onCreated()
      onClose()
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "No s'ha pogut crear el ticket")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-planner-ticket-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <h2 id="create-planner-ticket-title" className="text-xl font-semibold text-slate-950">
              Crear ticket intern planificat
            </h2>
            <p className="mt-1 text-sm text-slate-500">
            Es crea directament com a assignat, sense passar per la safata de nous tiquets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Tancar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Centre
            <select
              value={center}
              onChange={(event) => {
                setCenter(event.target.value)
                setLocation('')
                setZone('')
                setMachine('')
              }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
            >
              <option value="">Selecciona un centre</option>
              {centers.map((item) => (
                <option key={item.id} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Ubicació
            <select
              value={location}
              onChange={(event) => {
                setLocation(event.target.value)
                setZone('')
                setMachine('')
              }}
              disabled={!center || locationOptions.length === 0}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 disabled:bg-slate-100"
            >
              <option value="">{locationOptions.length ? 'Selecciona una ubicació' : 'Sense ubicacions internes'}</option>
              {locationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Zona
            <select
              value={zone}
              onChange={(event) => {
                setZone(event.target.value)
                setMachine('')
              }}
              disabled={zoneOptions.length === 0}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 disabled:bg-slate-100"
            >
              <option value="">{zoneOptions.length ? 'Selecciona una zona' : 'Sense zona'}</option>
              {zoneOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Màquina o element
            <input
              value={machine}
              onChange={(event) => setMachine(event.target.value)}
              list="planner-ticket-machines"
              placeholder="Selecciona o escriu un element"
              className="h-11 w-full rounded-xl border border-slate-200 px-3"
            />
            <datalist id="planner-ticket-machines">
              {machineOptions.map((item) => <option key={item.code || item.label} value={item.label} />)}
            </datalist>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
            Descripció de la feina
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Que s'ha de revisar o reparar?"
            />
          </label>

          <div className="space-y-3 md:col-span-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Fotos o fitxers * <span className="font-normal text-slate-500">(mín. 1, màx. {MAX_TICKET_ATTACHMENTS})</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Admet fotos, vídeos, PDF, Word, Excel i fitxers de text.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Paperclip className="h-4 w-4" />
                Afegir foto o fitxer
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  className="hidden"
                  disabled={attachments.length >= MAX_TICKET_ATTACHMENTS || preparingAttachments || busy}
                  onChange={(event) => {
                    void handleAttachmentChange(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
                <Camera className="h-4 w-4" />
                Fer una foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={attachments.length >= MAX_TICKET_ATTACHMENTS || preparingAttachments || busy}
                  onChange={(event) => {
                    void handleAttachmentChange(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>

            <p className="text-xs text-slate-500">
              {preparingAttachments ? 'Preparant adjunts…' : `${attachments.length}/${MAX_TICKET_ATTACHMENTS} adjunts`}
            </p>

            {attachments.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.file.name}-${attachment.file.size}-${index}`}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{attachment.file.name}</p>
                      <p className="text-xs text-slate-500">
                        {attachment.kind === 'image' ? 'Foto' : attachment.kind === 'video' ? 'Vídeo' : 'Fitxer'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      disabled={busy}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                      aria-label={`Eliminar adjunt ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Prioritat
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as TicketPriority)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
            >
              {PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Data
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Hora d'inici
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Durada estimada (minuts)
            <input
              type="number"
              min={30}
              step={30}
              value={duration}
              onChange={(event) => setDuration(Math.max(30, Number(event.target.value) || 30))}
              className="h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>

          <fieldset className="space-y-3 md:col-span-2">
            <legend className="text-sm font-semibold text-slate-800">
              Treballadors disponibles · {startTime}–{endTime}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {available.map((worker) => (
                <label key={worker.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={workerIds.includes(worker.id)}
                    onChange={() => toggleWorker(worker.id)}
                    className="h-4 w-4"
                  />
                  {worker.name}
                </label>
              ))}
              {available.length === 0 ? (
                <p className="text-sm text-slate-500">No hi ha treballadors disponibles en aquesta franja.</p>
              ) : null}
            </div>
          </fieldset>

          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
              {error}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border px-5 py-2.5 text-sm font-semibold">
            Cancel·lar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || preparingAttachments}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Creant...' : preparingAttachments ? 'Preparant adjunts...' : 'Crear i planificar'}
          </button>
        </div>
      </div>
    </div>
  )
}
