'use client'

import { useEffect, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type { AutoPreviewResponse, QuadrantMode } from '../components/quadrantModalTypes'

type UseQuadrantAutoPreviewParams = {
  open: boolean
  mode: QuadrantMode
  isQuadrantCoreDept: boolean
  event: QuadrantEvent
  department: string
  startDate: string
  startTime: string
  location: string
  setManualResp: (value: string) => void
  setTotalWorkers: (value: string) => void
  setNumDrivers: (value: string) => void
}

export function useQuadrantAutoPreview({
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
}: UseQuadrantAutoPreviewParams) {
  const [autoPreview, setAutoPreview] = useState<AutoPreviewResponse | null>(null)
  const [autoPreviewLoading, setAutoPreviewLoading] = useState(false)
  const [autoPreviewError, setAutoPreviewError] = useState<string | null>(null)
  const [autoPreviewKey, setAutoPreviewKey] = useState<string | null>(null)
  const [autoPreviewApplied, setAutoPreviewApplied] = useState(false)

  useEffect(() => {
    if (!open) {
      setAutoPreview(null)
      setAutoPreviewError(null)
      setAutoPreviewKey(null)
      setAutoPreviewApplied(false)
      return
    }
    if (mode !== 'auto' || !isQuadrantCoreDept) {
      setAutoPreview(null)
      setAutoPreviewError(null)
      setAutoPreviewKey(null)
      setAutoPreviewApplied(false)
      return
    }
    if (!event.id || !department || !startDate) return
    const eventLn =
      typeof (event as { ln?: string | null }).ln === 'string'
        ? ((event as { ln?: string | null }).ln as string)
        : ''
    const params = new URLSearchParams({
      department,
      eventId: String(event.id),
      startDate,
    })
    if (event.service) params.set('service', String(event.service))
    if (event.numPax !== null && event.numPax !== undefined) {
      params.set('numPax', String(event.numPax))
    }
    if (location) params.set('location', String(location))
    if (eventLn) params.set('ln', eventLn)
    if (startTime) params.set('startTime', startTime)
    const key = params.toString()
    if (key === autoPreviewKey) return
    setAutoPreviewKey(key)
    setAutoPreviewApplied(false)
    setAutoPreviewLoading(true)
    setAutoPreviewError(null)
    fetch(`/api/quadrants/auto-preview?${key}`)
      .then(async (res) => {
        const text = await res.text()
        const data = text ? (JSON.parse(text) as AutoPreviewResponse) : ({} as AutoPreviewResponse)
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Error ${res.status}`)
        }
        setAutoPreview(data)
      })
      .catch((err) => {
        setAutoPreview(null)
        setAutoPreviewError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setAutoPreviewLoading(false))
  }, [
    open,
    mode,
    isQuadrantCoreDept,
    event,
    department,
    startDate,
    startTime,
    location,
    autoPreviewKey,
  ])

  useEffect(() => {
    if (mode !== 'auto') return
    if (autoPreviewApplied) return
    const proposal = autoPreview?.proposal
    if (!proposal) return
    if (proposal.responsible?.id) setManualResp(proposal.responsible.id)
    if (typeof proposal.totalWorkers === 'number') {
      setTotalWorkers(String(proposal.totalWorkers))
    }
    if (typeof proposal.numDrivers === 'number') {
      setNumDrivers(String(proposal.numDrivers))
    }
    setAutoPreviewApplied(true)
  }, [
    mode,
    autoPreview,
    autoPreviewApplied,
    setManualResp,
    setTotalWorkers,
    setNumDrivers,
  ])

  return {
    autoPreview,
    autoPreviewLoading,
    autoPreviewError,
  }
}
