'use client'

import { useCallback, useState } from 'react'

export function useCuinaCentralFetch() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(url, { ...init, cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = String(json?.error || `Error ${res.status}`)
        setError(msg)
        throw new Error(msg)
      }
      return json as T
    } finally {
      setLoading(false)
    }
  }, [])

  return { request, loading, error, setError }
}
