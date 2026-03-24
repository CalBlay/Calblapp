// file: src/hooks/useTransports.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  normalizeTransportType,
  type TransportType,
} from '@/lib/transportTypes'

interface TransportDocument {
  id: string
  name: string
  url: string
  uploadedAt: string
}

interface TransportApiItem {
  id?: string
  plate?: string
  type?: TransportType
  conductorId?: string | null
  conductorName?: string | null
  conductor?: string | null
  available?: boolean
  status?: string | null
  itvDate?: string | null
  itvExpiry?: string | null
  lastService?: string | null
  nextService?: string | null
  documents?: TransportDocument[]
}

export interface Transport {
  id: string
  plate: string
  type: TransportType
  conductorId?: string | null
  conductorName?: string | null
  conductor?: string | null
  available: boolean
  status?: string | null

  // 🔹 Camps nous de manteniment / documentació
  itvDate?: string | null          // Data ITV feta
  itvExpiry?: string | null        // Caducitat ITV
  lastService?: string | null      // Última revisió
  nextService?: string | null      // Properà revisió

  documents?: TransportDocument[]
}

interface UseTransportsResult {
  data: Transport[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * 🔹 Hook per carregar / refrescar els transports des de l’API
 *    GET /api/transports
 */
export function useTransports(): UseTransportsResult {
  const [data, setData] = useState<Transport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTransports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/transports')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const json = await res.json()

      // Acceptem formats flexibles: { data: [...] } o directament [...]
      const list: TransportApiItem[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : []

      const mapped: Transport[] = list.map((t, index) => ({
        id: t.id ?? String(index),
        plate: t.plate ?? '',
        type: normalizeTransportType(t.type) as TransportType,
        conductorId: t.conductorId ?? null,
        conductorName: t.conductorName ?? null,
        conductor: t.conductor ?? null,
        available: typeof t.available === 'boolean' ? t.available : true,
        status: t.status ?? null,
        itvDate: t.itvDate ?? null,
        itvExpiry: t.itvExpiry ?? null,
        lastService: t.lastService ?? null,
        nextService: t.nextService ?? null,
        documents: Array.isArray(t.documents) ? t.documents : [],
      }))

      setData(mapped)
    } catch (err: unknown) {
      console.error('[useTransports] Error carregant transports:', err)
      setError('No s’han pogut carregar els transports')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTransports()
  }, [fetchTransports])

  return {
    data,
    loading,
    error,
    refetch: fetchTransports,
  }
}

// 🔁 També el deixem com a export per defecte (per si algun lloc l’importa així)
export default useTransports
