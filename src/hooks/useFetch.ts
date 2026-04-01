// ✅ file: src/hooks/useFetch.ts
import { useEffect, useState } from 'react'

export default function useFetch(url: string, start?: string, end?: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let active = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (start) params.set('start', start)
        if (end) params.set('end', end)

        const res = await fetch(`${url}?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!active) return
        setData(json.events || [])
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        if (!active) return
        setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchData()
    return () => {
      active = false
      controller.abort()
    }
  }, [url, start, end])

  return { data, loading, error }
}
