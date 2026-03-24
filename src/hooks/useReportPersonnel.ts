// file: src/hooks/useReportPersonnel.ts
import { useState, useEffect, useMemo } from 'react'
import type { ReportFilters } from '@/services/reports'

// 🔹 Tipus esperat del payload de /api/reports?type=personnel
export interface ReportPersonnelRow {
  id: string
  name: string
  department: string
  role: string
  hoursWorked: number
  extraHours: number
  responsableCount: number
  eventsCount: number
}

interface ReportPersonnelResponse {
  stats: {
    totalPersonnel: number
    totalHours: number
    extraHours: number
    topResponsables: string
  }
  chartByPerson: { name: string; hours: number }[]
  chartDonut: { name: string; value: number }[]
  rows: ReportPersonnelRow[]
}

export function useReportPersonnel(filters: ReportFilters) {
  const [data, setData]       = useState<ReportPersonnelResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string|null>(null)

  // ✅ clau estable per deps
  const fetchKey = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      type:         'personnel',
      department:   filters.department,
      role:         filters.role,
      from:         filters.from,
      to:           filters.to,
      event:        filters.event,
      responsible:  filters.responsible,
      businessLine: filters.businessLine
    })

    fetch('/api/reports?' + params.toString())
      .then(async res => {
        const payload = await res.json()
        console.log("[useReportPersonnel] payload rebut:", payload)

        if (!res.ok) throw new Error(payload.error || res.statusText)
        return payload?.data as ReportPersonnelResponse
      })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof Error) setError(err.message)
        else setError('Error desconegut')
      })
      .finally(() => setLoading(false))
  }, [fetchKey])

  return { data, loading, error }
}
