import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import {
  resolveManualTicketRouting,
  type ManualTicketRouting,
} from '@/lib/maintenanceTicketCreators'
import type { TicketPriority } from './types'

const MAX_TICKET_IMAGES = 3

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

type PendingImage = {
  file: File
  preview: string
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
  const [createImages, setCreateImages] = useState<PendingImage[]>([])
  const [createBusy, setCreateBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const imagesRef = useRef<PendingImage[]>([])

  useEffect(() => {
    setLocationQuery(createLocation)
  }, [createLocation])

  useEffect(() => {
    setMachineQuery(createMachine)
  }, [createMachine])

  useEffect(() => {
    imagesRef.current = createImages
  }, [createImages])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
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
    createImages.forEach((item) => URL.revokeObjectURL(item.preview))
    setCreateImages([])
    setImageError(null)
    setFormError(null)
  }

  const handleImageChange = async (fileList: FileList | null) => {
    const selected = fileList ? Array.from(fileList) : []
    if (!selected.length) return

    const remainingSlots = MAX_TICKET_IMAGES - createImages.length
    if (remainingSlots <= 0) {
      setImageError(`Nomes pots adjuntar fins a ${MAX_TICKET_IMAGES} fotos.`)
      return
    }

    const nextFiles = selected.slice(0, remainingSlots)

    try {
      const compressed = await Promise.all(
        nextFiles.map(async (file) => {
          if (!file.type.startsWith('image/')) {
            throw new Error('Nomes es permeten imatges.')
          }
          const optimized = await compressRasterImageForUpload(
            file,
            DEFAULT_MAX_IMAGE_UPLOAD_BYTES
          )
          if (optimized.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
            throw new Error('Una imatge encara supera 1MB despres de comprimir-se.')
          }
          return {
            file: optimized,
            preview: URL.createObjectURL(optimized),
          }
        })
      )

      setImageError(
        selected.length > remainingSlots
          ? `Nomes s'han afegit les primeres ${MAX_TICKET_IMAGES} fotos.`
          : null
      )
      setFormError(null)
      setCreateImages((current) => [...current, ...compressed].slice(0, MAX_TICKET_IMAGES))
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Error preparant les imatges')
    }
  }

  const removeImage = (index: number) => {
    setCreateImages((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
    setFormError(null)
  }

  const uploadImages = async () => {
    const uploaded = await Promise.all(
      createImages.map(async (image) => {
        const form = new FormData()
        form.append('file', image.file)
        const res = await fetch('/api/maintenance/upload-image', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(String(json?.error || "No s'ha pogut pujar una de les imatges"))
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
    if (createImages.length < 1) {
      return 'Cal adjuntar com a minim una foto (maxim 3).'
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
      const uploadedImages = await uploadImages()
      if (uploadedImages.length < 1) {
        throw new Error('Cal adjuntar com a minim una foto valida.')
      }

      const primary = uploadedImages[0]
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
          images: uploadedImages,
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
    createImages.length >= 1 &&
    createImages.length <= MAX_TICKET_IMAGES

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
    createImages,
    createImageCount: createImages.length,
    maxTicketImages: MAX_TICKET_IMAGES,
    createBusy,
    imageError,
    formError,
    canCreateTicket,
    handleImageChange,
    removeImage,
    handleCreateTicket,
    openCreate,
  }
}
