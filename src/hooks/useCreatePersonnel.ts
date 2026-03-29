// file: src/hooks/useCreatePersonnel.ts
'use client'

import { useState } from 'react'

export interface NewPerson {
  id: string
  name: string
  role: string
  department: string
  driver: {                  // 👇 estructura real
    isDriver: boolean
    camioGran: boolean
    camioPetit: boolean
  }
  isJamonero?: boolean
  available: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  unavailableNotifiedFor?: string | null
  unavailableNotifiedAt?: number | null
  email: string
  phone: string
  maxHoursWeek: number
}


export function useCreatePersonnel() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string|null>(null)

  async function mutateAsync(newPerson: NewPerson): Promise<NewPerson> {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPerson)
      })
      if (!res.ok) {
        type ErrorBody = { error?: string }
        const body: ErrorBody = await res.json().catch(() => ({} as ErrorBody))
        throw new Error(body.error || res.statusText)
      }
      return res.json() as Promise<NewPerson>
    } finally {
      setLoading(false)
    }
  }

  return { mutateAsync, loading, error }
}
