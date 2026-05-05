'use client'

import { useState } from 'react'
import type { TransportMonthlyMileageEntry } from '@/hooks/useTransports'
import type { TransportType } from '@/lib/transportTypes'

type TransportDocumentPayload = {
  id: string
  name: string
  url: string
  uploadedAt: string
}

export function useCreateTransport() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mutateAsync(payload: {
    plate: string
    type: TransportType
    conductorId?: string | null
    itvDate?: string | null
    itvExpiry?: string | null
    lastService?: string | null
    lastServiceKm?: number | null
    nextService?: string | null
    documents?: TransportDocumentPayload[]
    monthlyMileage?: TransportMonthlyMileageEntry[]
  }) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/transports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Error creant transport')
      return body
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Error desconegut creant transport')
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutateAsync, loading, error }
}
