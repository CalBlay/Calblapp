// file: src/hooks/useUpdatePersonnel.ts
import { useState } from 'react'

export interface UpdatePerson {
  id: string
  name?: string
  role?: string
  department?: string
  driver?: {
    isDriver?: boolean
    camioGran?: boolean
    camioPetit?: boolean
  }
  isJamonero?: boolean
  available?: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  unavailableNotifiedFor?: string | null
  unavailableNotifiedAt?: number | null
  email?: string
  phone?: string
  maxHoursWeek?: number
}

export function useUpdatePersonnel() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const mutateAsync = async (updateData: UpdatePerson) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/personnel/${updateData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { message?: string }))
        throw new Error(body.message || `Error ${res.status}`)
      }
      return await res.json()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Error desconegut actualitzant personal')
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { mutateAsync, loading, error }
}
