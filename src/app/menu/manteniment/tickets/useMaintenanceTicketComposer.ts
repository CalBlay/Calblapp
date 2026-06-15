import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import { compressVideoForUpload } from '@/lib/media/compressVideoForUpload'
import {
  resolveManualTicketRouting,
  type ManualTicketRouting,
} from '@/lib/maintenanceTicketCreators'
import {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  formatTicketAttachmentLimitMb,
  isTicketImageMime,
  isTicketVideoMime,
  MAX_TICKET_ATTACHMENTS,
  MAX_UPLOAD_VIDEO_BYTES,
  MAX_VIDEO_INPUT_BYTES,
} from '@/lib/media/ticketAttachments'
import type { TicketPriority } from './types'

type Params = {
  refreshTickets?: () => Promise<void>
  /** Valors per defecte en obrir el modal (p. ex. Cuina central). */
  defaultLocation?: string
  defaultMachine?: string
  /** Força encaminament cuina central encara que el departament de sessió sigui admin. */
  routingOverride?: ManualTicketRouting
}

type SessionUser = {
  department?: string | null
}

export type PendingTicketAttachment = {
  file: File
  preview: string
  kind: 'image' | 'video'
}

export function useMaintenanceTicketComposer({
  refreshTickets = async () => {},
  defaultLocation = '',
  defaultMachine = '',
  routingOverride,
}: Params) {
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const [showCreate, setShowCreate] = useState(false)
  const [createLocation, setCreateLocation] = useState('')
  const [createMachine, setCreateMachine] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [machineQuery, setMachineQuery] = useState('')
  const [showLocationList, setShowLocationList] = useState(false)
  const [showMachineList, setShowMachineList] = useState(false)
  const [createDescription, setCreateDescription] = useState('')
  const [createPriority, setCreatePriority] = useState<TicketPriority>('normal')
  const [createAttachments, setCreateAttachments] = useState<PendingTicketAttachment[]>([])
  const [createBusy, setCreateBusy] = useState(false)
  const [attachmentCompressing, setAttachmentCompressing] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const attachmentsRef = useRef<PendingTicketAttachment[]>([])

  useEffect(() => {
    setLocationQuery(createLocation)
  }, [createLocation])

  useEffect(() => {
    setMachineQuery(createMachine)
  }, [createMachine])

  useEffect(() => {
    attachmentsRef.current = createAttachments
  }, [createAttachments])

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
    }
  }, [])

  const applyDefaults = (preset?: { location?: string; machine?: string }) => {
    const loc = preset?.location ?? defaultLocation
    const mac = preset?.machine ?? defaultMachine
    setCreateLocation(loc)
    setCreateMachine(mac)
    setLocationQuery(loc)
    setMachineQuery(mac)
  }

  const openCreate = (preset?: { location?: string; machine?: string }) => {
    applyDefaults(preset)
    setShowCreate(true)
  }

  const resetCreateState = () => {
    setShowCreate(false)
    setCreateLocation('')
    setCreateMachine('')
    setLocationQuery('')
    setMachineQuery('')
    setShowLocationList(false)
    setShowMachineList(false)
    setCreateDescription('')
    setCreatePriority('normal')
    createAttachments.forEach((item) => URL.revokeObjectURL(item.preview))
    setCreateAttachments([])
    setAttachmentError(null)
    setFormError(null)
  }

  const handleAttachmentChange = async (fileList: FileList | null) => {
    const selected = fileList ? Array.from(fileList) : []
    if (!selected.length) return

    const remainingSlots = MAX_TICKET_ATTACHMENTS - createAttachments.length
    if (remainingSlots <= 0) {
      setAttachmentError(`Només pots adjuntar fins a ${MAX_TICKET_ATTACHMENTS} fitxers.`)
      return
    }

    const nextFiles = selected.slice(0, remainingSlots)

    try {
      const prepared: PendingTicketAttachment[] = []
      for (const file of nextFiles) {
        if (isTicketVideoMime(file.type)) {
          if (file.size > MAX_VIDEO_INPUT_BYTES) {
            throw new Error(
              `El video supera el limit de ${formatTicketAttachmentLimitMb(MAX_VIDEO_INPUT_BYTES)} abans de comprimir.`
            )
          }
          setAttachmentCompressing(true)
          const optimized = await compressVideoForUpload(file, DEFAULT_MAX_VIDEO_UPLOAD_BYTES)
          if (optimized.size > MAX_UPLOAD_VIDEO_BYTES) {
            throw new Error(
              `El video comprimit encara supera ${formatTicketAttachmentLimitMb(MAX_UPLOAD_VIDEO_BYTES)}.`
            )
          }
          prepared.push({
            file: optimized,
            preview: URL.createObjectURL(optimized),
            kind: 'video',
          })
          continue
        }

        if (!isTicketImageMime(file.type)) {
          throw new Error('Només es permeten imatges o vídeos.')
        }

        const optimized = await compressRasterImageForUpload(
          file,
          DEFAULT_MAX_IMAGE_UPLOAD_BYTES
        )
        if (optimized.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
          throw new Error('Una imatge encara supera 1 MB després de comprimir-se.')
        }
        prepared.push({
          file: optimized,
          preview: URL.createObjectURL(optimized),
          kind: 'image',
        })
      }

      setAttachmentError(
        selected.length > remainingSlots
          ? `Només s'han afegit els primers ${MAX_TICKET_ATTACHMENTS} fitxers.`
          : null
      )
      setFormError(null)
      setCreateAttachments((current) =>
        [...current, ...prepared].slice(0, MAX_TICKET_ATTACHMENTS)
      )
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Error preparant els adjunts')
    } finally {
      setAttachmentCompressing(false)
    }
  }

  const removeAttachment = (index: number) => {
    setCreateAttachments((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
    setFormError(null)
  }

  const uploadAttachments = async () => {
    const uploaded = await Promise.all(
      createAttachments.map(async (attachment) => {
        const form = new FormData()
        form.append('file', attachment.file)
        const res = await fetch('/api/maintenance/upload-image', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(String(json?.error || "No s'ha pogut pujar un dels adjunts"))
        }
        const json = await res.json()
        return {
          url: json.url || null,
          path: json.path || null,
          meta: json.meta || null,
        }
      })
    )

    return uploaded.filter((item) => item.url || item.path)
  }

  const getEffectiveMachine = () => createMachine.trim() || machineQuery.trim()

  const validateCreateForm = () => {
    if (!createLocation.trim()) {
      return 'Selecciona una ubicacio.'
    }
    if (!getEffectiveMachine()) {
      return 'Indica la maquinaria (cerca al llistat o escriu el nom).'
    }
    if (!createDescription.trim()) {
      return 'La descripcio es obligatoria.'
    }
    if (createAttachments.length < 1) {
      return `Cal adjuntar com a minim una foto o video (maxim ${MAX_TICKET_ATTACHMENTS}).`
    }
    return null
  }

  const handleCreateTicket = async () => {
    const validationError = validateCreateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    try {
      setCreateBusy(true)
      setFormError(null)
      const uploadedAttachments = await uploadAttachments()
      if (uploadedAttachments.length < 1) {
        throw new Error('Cal adjuntar com a minim un adjunt valid.')
      }

      const primary = uploadedAttachments[0]
      const routing =
        routingOverride ||
        resolveManualTicketRouting({
          department: sessionUser.department,
          location: createLocation.trim(),
        })
      const res = await fetch('/api/maintenance/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: createLocation.trim(),
          machine: getEffectiveMachine(),
          operatorTitle: getEffectiveMachine(),
          description: createDescription.trim(),
          priority: createPriority,
          ticketType: 'maquinaria',
          source: routing.source,
          intakeChannel: routing.intakeChannel,
          imageUrl: primary?.url || null,
          imagePath: primary?.path || null,
          imageMeta: primary?.meta || null,
          images: uploadedAttachments,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(String(json?.error || `HTTP ${res.status}`))
      }
      resetCreateState()
      await refreshTickets()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error creant ticket'
      setFormError(message)
    } finally {
      setCreateBusy(false)
    }
  }

  const canCreateTicket =
    Boolean(createLocation.trim()) &&
    Boolean(getEffectiveMachine()) &&
    Boolean(createDescription.trim()) &&
    createAttachments.length >= 1 &&
    createAttachments.length <= MAX_TICKET_ATTACHMENTS

  return {
    showCreate,
    setShowCreate,
    createLocation,
    setCreateLocation,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    machineQuery,
    setMachineQuery,
    showLocationList,
    setShowLocationList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createPriority,
    setCreatePriority,
    createAttachments,
    createAttachmentCount: createAttachments.length,
    maxTicketAttachments: MAX_TICKET_ATTACHMENTS,
    createBusy,
    attachmentCompressing,
    attachmentError,
    formError,
    canCreateTicket,
    handleAttachmentChange,
    removeAttachment,
    handleCreateTicket,
    openCreate,
    /** @deprecated use createAttachments */
    createImages: createAttachments,
    /** @deprecated */
    createImageCount: createAttachments.length,
    /** @deprecated */
    maxTicketImages: MAX_TICKET_ATTACHMENTS,
    /** @deprecated */
    imageError: attachmentError,
    /** @deprecated */
    handleImageChange: handleAttachmentChange,
    /** @deprecated */
    removeImage: removeAttachment,
  }
}
