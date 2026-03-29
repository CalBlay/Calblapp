import { useEffect, useState } from 'react'
import { optimizeUploadFile } from '@/lib/file-optimization'
import type { TicketPriority } from './types'

type Params = {
  refreshTickets: () => Promise<void>
}

export function useMaintenanceTicketComposer({ refreshTickets }: Params) {
  const [showCreate, setShowCreate] = useState(false)
  const [createLocation, setCreateLocation] = useState('')
  const [createMachine, setCreateMachine] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [machineQuery, setMachineQuery] = useState('')
  const [showLocationList, setShowLocationList] = useState(false)
  const [showMachineList, setShowMachineList] = useState(false)
  const [createDescription, setCreateDescription] = useState('')
  const [createPriority, setCreatePriority] = useState<TicketPriority>('normal')
  const [createImageFile, setCreateImageFile] = useState<File | null>(null)
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    setLocationQuery(createLocation)
  }, [createLocation])

  useEffect(() => {
    setMachineQuery(createMachine)
  }, [createMachine])

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
    setCreateImageFile(null)
    setCreateImagePreview(null)
    setImageError(null)
  }

  const handleImageChange = async (file: File | null) => {
    if (!file) {
      setCreateImageFile(null)
      setCreateImagePreview(null)
      setImageError(null)
      return
    }
    const optimizedFile = await optimizeUploadFile(file, 2 * 1024 * 1024)
    if (optimizedFile.size > 2 * 1024 * 1024) {
      setCreateImageFile(null)
      setCreateImagePreview(null)
      setImageError("La imatge supera 2MB. Fes-la mes petita.")
      return
    }
    setImageError(null)
    setCreateImageFile(optimizedFile)
    setCreateImagePreview(URL.createObjectURL(optimizedFile))
  }

  const uploadImageIfNeeded = async () => {
    if (!createImageFile) return { url: null, path: null, meta: null }
    const form = new FormData()
    form.append('file', createImageFile)
    const res = await fetch('/api/maintenance/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error || "No s'ha pogut pujar la imatge")
    }
    const json = await res.json()
    return { url: json.url || null, path: json.path || null, meta: json.meta || null }
  }

  const handleCreateTicket = async () => {
    if (!createLocation || !createMachine || !createDescription) return
    try {
      setCreateBusy(true)
      const image = await uploadImageIfNeeded()
      const res = await fetch('/api/maintenance/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: createLocation,
          machine: createMachine,
          description: createDescription,
          priority: createPriority,
          ticketType: 'maquinaria',
          source: 'manual',
          imageUrl: image.url,
          imagePath: image.path,
          imageMeta: image.meta,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      resetCreateState()
      await refreshTickets()
    } catch (err: any) {
      alert(err?.message || 'Error creant ticket')
    } finally {
      setCreateBusy(false)
    }
  }

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
    createImagePreview,
    createBusy,
    imageError,
    handleImageChange,
    handleCreateTicket,
  }
}
