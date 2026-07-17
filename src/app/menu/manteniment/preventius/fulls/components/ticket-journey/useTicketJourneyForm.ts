'use client'

import { format, isBefore, startOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import {
  applyStatusHistoryUpdate,
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

function timeToMinutes(value?: string | null) {
  const raw = String(value || '').trim()
  if (!/^\d{2}:\d{2}$/.test(raw)) return null
  const [hours, minutes] = raw.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function parseHistoryAt(value?: number | string | null) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value)
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getOpenSegment(history: StatusHistoryEntry[] | undefined, status: JourneyStatus) {
  if (!Array.isArray(history)) return null
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (String(entry?.status || '') !== status) continue
    const start = String(entry?.startTime || '').trim()
    const end = String(entry?.endTime || '').trim()
    if (start && !end) {
      return {
        startTime: start,
        date: parseHistoryAt(entry?.at),
      }
    }
  }
  return null
}

type Params = {
  ticket: JourneyTicket
  onSaved: () => void
}

export function useTicketJourneyForm({ ticket, onSaved }: Params) {
  const initialStatus = ticket.status as JourneyStatus
  const [currentStatus, setCurrentStatus] = useState<JourneyStatus>(initialStatus)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>(
    Array.isArray(ticket.statusHistory) ? (ticket.statusHistory as StatusHistoryEntry[]) : []
  )

  const [nextStatus, setNextStatus] = useState<JourneyStatus | undefined>()
  const [horaInici, setHoraInici] = useState('')
  const [horaFi, setHoraFi] = useState('')
  const [previousSegmentEndTime, setPreviousSegmentEndTime] = useState('')
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

  const openSegment = useMemo(
    () => getOpenSegment(statusHistory, 'en_curs') || getOpenSegment(statusHistory, 'espera'),
    [statusHistory]
  )
  const openSegmentDateLabel = useMemo(
    () => (openSegment?.date ? format(openSegment.date, 'dd/MM/yyyy') : ''),
    [openSegment]
  )
  const openSegmentStartTimeLabel = useMemo(
    () => String(openSegment?.startTime || '').trim(),
    [openSegment]
  )
  const todayDateLabel = useMemo(() => format(new Date(), 'dd/MM/yyyy'), [])
  const hasStaleOpenSegment = useMemo(
    () => Boolean(openSegment?.date && isBefore(startOfDay(openSegment.date), startOfDay(new Date()))),
    [openSegment]
  )

  const isDirty = useMemo(
    () => Boolean(nextStatus || horaInici || horaFi || note.trim() || imageCount > 0),
    [horaFi, horaInici, imageCount, nextStatus, note]
  )

  useEffect(() => {
    setCurrentStatus(initialStatus)
    setStatusHistory(Array.isArray(ticket.statusHistory) ? (ticket.statusHistory as StatusHistoryEntry[]) : [])
    setNextStatus(undefined)
    const initialOpenSegment =
      getOpenSegment(
        Array.isArray(ticket.statusHistory) ? (ticket.statusHistory as StatusHistoryEntry[]) : [],
        'en_curs'
      ) ||
      getOpenSegment(
        Array.isArray(ticket.statusHistory) ? (ticket.statusHistory as StatusHistoryEntry[]) : [],
        'espera'
      )
    if (initialStatus === 'en_curs' || initialStatus === 'espera') {
      setHoraInici(initialOpenSegment?.startTime || '')
      setHoraFi('')
      setPreviousSegmentEndTime('')
    } else {
      setHoraInici('')
      setHoraFi('')
      setPreviousSegmentEndTime('')
    }
    setNote('')
    clearImages()
    setFormError(null)
    setBusy(false)
  }, [clearImages, initialStatus, ticket.id, ticket.statusHistory])

  const handleSelectStatus = (status: JourneyStatus) => {
    setNextStatus(status)
    if (hasStaleOpenSegment) {
      setHoraFi((prev) => (status === 'en_curs' ? '' : prev))
      setHoraInici((prev) =>
        needsStartOnNextStatus(status) || status === 'fet' || status === 'no_fet' ? prev : ''
      )
      setPreviousSegmentEndTime((prev) => prev || '')
    } else {
      setHoraFi((prev) => prev)
      setHoraInici((prev) => {
        if (status === 'fet' || status === 'no_fet' || status === 'validat') {
          return currentStatus === 'en_curs' || currentStatus === 'espera'
            ? openSegment?.startTime || prev
            : prev
        }
        if (needsStartOnNextStatus(status)) return prev
        return prev
      })
    }
    setNote('')
    clearImages()
    setFormError(null)
  }

  const clearStatusSelection = () => {
    setNextStatus(undefined)
    if (currentStatus === 'en_curs' || currentStatus === 'espera') {
      setHoraInici(openSegment?.startTime || '')
      setHoraFi('')
      setPreviousSegmentEndTime('')
    } else {
      setHoraInici('')
      setHoraFi('')
      setPreviousSegmentEndTime('')
    }
    setNote('')
    clearImages()
    setFormError(null)
  }

  const handleSave = async () => {
    const effectiveStatus = nextStatus || currentStatus

    const closesPrevious = needsClosePreviousSegment(currentStatus)
    const startsSegment = needsStartOnNextStatus(effectiveStatus) || effectiveStatus === 'fet'
    const terminalEnd =
      effectiveStatus === 'fet' || effectiveStatus === 'no_fet' || effectiveStatus === 'validat'

    const closeSegmentEndTime =
      closesPrevious || terminalEnd
        ? hasStaleOpenSegment
          ? previousSegmentEndTime
          : horaFi
        : undefined
    const newSegmentStartTime = startsSegment || terminalEnd ? horaInici : undefined
    const newSegmentEndTime = effectiveStatus === 'fet' ? horaFi : terminalEnd ? horaFi : undefined

    if (hasStaleOpenSegment && (closesPrevious || terminalEnd) && !String(previousSegmentEndTime || '').trim()) {
      setFormError(`Omple hora fi del tram obert del ${openSegmentDateLabel}.`)
      return
    }

    const previousEndMinutes = timeToMinutes(previousSegmentEndTime)
    const openStartMinutes = timeToMinutes(openSegment?.startTime)
    if (
      hasStaleOpenSegment &&
      (closesPrevious || terminalEnd) &&
      previousEndMinutes !== null &&
      openStartMinutes !== null &&
      previousEndMinutes < openStartMinutes
    ) {
      setFormError(`La hora fi del tram anterior no pot ser inferior a la hora inici (${openSegment?.startTime}).`)
      return
    }

    const startMinutes = timeToMinutes(newSegmentStartTime)
    const endMinutes = timeToMinutes(newSegmentEndTime || closeSegmentEndTime)
    const shouldCompareCurrentSegment =
      !hasStaleOpenSegment || effectiveStatus === 'fet' || effectiveStatus === 'no_fet' || effectiveStatus === 'validat'
    if (
      shouldCompareCurrentSegment &&
      startMinutes !== null &&
      endMinutes !== null &&
      endMinutes < startMinutes
    ) {
      setFormError(`La hora fi no pot ser inferior a la hora inici (${newSegmentStartTime}).`)
      return
    }

    const previousSegmentCloseMinutes = timeToMinutes(closeSegmentEndTime)
    if (
      startsSegment &&
      closesPrevious &&
      startMinutes !== null &&
      previousSegmentCloseMinutes !== null &&
      startMinutes < previousSegmentCloseMinutes
    ) {
      setFormError(
        `La hora inici del nou tram no pot ser inferior a la hora fi del tram anterior (${closeSegmentEndTime}).`
      )
      return
    }

    const validationError = validateJourneyStatusPayload({
      currentStatus,
      nextStatus: effectiveStatus,
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
          status: effectiveStatus,
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
    previousSegmentEndTime,
    todayDateLabel,
    openSegmentDateLabel,
    openSegmentStartTimeLabel,
    hasStaleOpenSegment,
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
    setPreviousSegmentEndTime,
    setNote,
    handleImageChange,
    removeImage,
    maxCompletionImages: MAX_COMPLETION_IMAGES,
  }
}
