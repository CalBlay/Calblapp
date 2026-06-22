'use client'

import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import {
  getOpenSegmentStart,
  needsClosePreviousSegment,
  needsStartOnNextStatus,
  validateJourneyStatusPayload,
  type JourneyStatus,
  type StatusHistoryEntry,
} from '@/lib/maintenanceJourneyStatus'
import { usePendingImages } from '../../hooks/usePendingImages'
import type { JourneyTicket } from '../../lib/types'

const MAX_COMPLETION_IMAGES = 3

const defaultTime = () => format(new Date(), 'HH:mm')

type Params = {
  ticket: JourneyTicket
  onSaved: () => void
}

export function useTicketJourneyForm({ ticket, onSaved }: Params) {
  const currentStatus = ticket.status as JourneyStatus
  const statusHistory = ticket.statusHistory as StatusHistoryEntry[] | undefined

  const [nextStatus, setNextStatus] = useState<JourneyStatus | undefined>()
  const [horaInici, setHoraInici] = useState('')
  const [horaFi, setHoraFi] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    images,
    previews,
    imageCount,
    imageError,
    handleImageChange,
    removeImage,
    clearImages,
    uploadImages,
  } = usePendingImages(MAX_COMPLETION_IMAGES)

  const showPhotos = Boolean(nextStatus)

  const existingImages = useMemo(() => {
    const urls = Array.isArray(ticket.imageUrls) ? ticket.imageUrls : []
    const legacy = ticket.imageUrl ? [ticket.imageUrl] : []
    return [...urls, ...legacy].map((url) => String(url || '').trim()).filter(Boolean)
  }, [ticket.imageUrl, ticket.imageUrls])

  const existingCompletionAttachments = useMemo(
    () =>
      Array.isArray(ticket.completionAttachments)
        ? ticket.completionAttachments.filter((item) => item?.url || item?.path)
        : [],
    [ticket.completionAttachments]
  )

  const isDirty = useMemo(
    () => Boolean(nextStatus || horaInici || horaFi || note.trim() || imageCount > 0),
    [horaFi, horaInici, imageCount, nextStatus, note]
  )

  const handleSelectStatus = (status: JourneyStatus) => {
    const now = defaultTime()
    const openStart =
      getOpenSegmentStart(statusHistory, 'en_curs') ||
      getOpenSegmentStart(statusHistory, 'espera')

    setNextStatus(status)
    setHoraFi(now)
    setHoraInici(
      status === 'fet'
        ? openStart || now
        : needsStartOnNextStatus(status)
          ? now
          : openStart || now
    )
    setNote('')
    clearImages()
    setFormError(null)
  }

  const clearStatusSelection = () => {
    setNextStatus(undefined)
    setHoraInici('')
    setHoraFi('')
    setNote('')
    clearImages()
    setFormError(null)
  }

  const handleSave = async () => {
    if (!nextStatus) {
      setFormError('Selecciona un estat.')
      return
    }

    const closesPrevious = needsClosePreviousSegment(currentStatus)
    const startsSegment = needsStartOnNextStatus(nextStatus) || nextStatus === 'fet'
    const terminalEnd = nextStatus === 'fet' || nextStatus === 'no_fet' || nextStatus === 'validat'

    const closeSegmentEndTime = closesPrevious || terminalEnd ? horaFi : undefined
    const newSegmentStartTime = startsSegment || terminalEnd ? horaInici : undefined
    const newSegmentEndTime = nextStatus === 'fet' ? horaFi : terminalEnd ? horaFi : undefined

    const validationError = validateJourneyStatusPayload({
      currentStatus,
      nextStatus,
      closeSegmentEndTime,
      newSegmentStartTime,
      newSegmentEndTime,
      note,
      completionImageCount: showPhotos ? imageCount : 0,
    })
    if (validationError) {
      setFormError(validationError)
      return
    }

    try {
      setBusy(true)
      setFormError(null)
      const completionImages = imageCount > 0 ? await uploadImages() : []

      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          statusStartTime: newSegmentStartTime || null,
          statusEndTime: closeSegmentEndTime || null,
          newSegmentEndTime: newSegmentEndTime || null,
          statusNote: note.trim() || null,
          completionImages,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(String(json?.error || 'No s ha pogut actualitzar'))
      }

      onSaved()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No s ha pogut actualitzar')
    } finally {
      setBusy(false)
    }
  }

  return {
    currentStatus,
    nextStatus,
    horaInici,
    horaFi,
    note,
    formError,
    busy,
    showPhotos,
    existingImages,
    existingCompletionAttachments,
    pendingAttachments: images,
    isDirty,
    previews,
    imageCount,
    imageError,
    handleSelectStatus,
    clearStatusSelection,
    handleSave,
    setHoraInici,
    setHoraFi,
    setNote,
    handleImageChange,
    removeImage,
    maxCompletionImages: MAX_COMPLETION_IMAGES,
  }
}
