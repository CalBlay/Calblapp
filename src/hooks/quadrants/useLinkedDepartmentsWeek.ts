//filename: src/hooks/quadrants/useLinkedDepartments.ts
'use client'

import { useEffect, useState } from 'react'

/**
 * 🧩 Tipus de dades retornades per /api/quadrants/linked
 */
export interface LinkedDept {
  dept: string
  startTime?: string
  responsable?: string
}

/**
 * 🧠 Hook optimitzat per carregar tots els enllaços de departaments
 * segons el rang setmanal (start / end)
 *
 * Exemple:
 *   const { linkedData, loading } = useLinkedDepartmentsWeek('2025-11-03', '2025-11-09')
 *   linkedData['E2500161'] -> [{ dept: 'serveis', startTime: '11:00' }]
 */
export default function useLinkedDepartmentsWeek(start?: string, end?: string) {
  const [linkedData, setLinkedData] = useState<Record<string, LinkedDept[]>>({})
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!start || !end) return
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/quadrants/linked?start=${start}&end=${end}`)
        const json = await res.json()

        if (!res.ok) throw new Error(json.error || 'Error carregant dades')
        setLinkedData(json.linked || {})
      } catch (err: unknown) {
        console.error('[useLinkedDepartmentsWeek] Error:', err)
        setError(err instanceof Error ? err.message : 'Error desconegut')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [start, end])

  return { linkedData, loading, error }
}
