// file: src/hooks/useEventPersonnel.ts
'use client'

import { useEffect, useState } from 'react'

// Tipus bàsics
export interface Person {
  id?: string
  name?: string
  role?: string
  phone?: string
  department?: string
  meetingPoint?: string
  time?: string
  plate?: string
  endTime?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

export interface EventPersonnel {
  responsables?: Person[]
  conductors?: Person[]
  treballadors?: Person[]
}

// 🔵 Cache en memòria (per sessió)
const personnelCache: Record<string, EventPersonnel> = {}

export function useEventPersonnel(eventId?: string | number) {
  const [data, setData] = useState<EventPersonnel | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) {
      setData(null)
      setLoading(false)
    }

    const key = String(eventId)

    // 1) Si tenim cache, la retornem immediatament
    if (personnelCache[key]) {
      setData(personnelCache[key])
      setLoading(false)
      return
    }

    // 2) Sinó, fem fetch
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/events/personnel?eventId=${encodeURIComponent(key)}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`)

        const json: EventPersonnel = await res.json()
        personnelCache[key] = json // 👈 guardem al cache
        setData(json)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Error desconegut carregant personal')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [eventId])

  return { data, loading, error }
}
