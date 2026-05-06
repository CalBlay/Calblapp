// file: src/hooks/spaces/useSpaces.ts
'use client'

import { useEffect, useState } from 'react'
import { SpacesFilterState } from '@/components/spaces/SpacesFilters'

type SpaceEventRow = Record<string, unknown>
type SpaceDayRow = { date?: string; events?: SpaceEventRow[] }
type SpaceApiRow = { finca?: string; dies?: SpaceDayRow[]; fincaId?: string }

export function useSpaces(
  filters: SpacesFilterState & { baseDate: string; month?: number; year?: number }
) {
  const [spaces, setSpaces] = useState<SpaceApiRow[]>([])
  const [totals, setTotals] = useState<number[]>([])
  const [fincas, setFincas] = useState<string[]>([])
  const [comercials, setComercials] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lns, setLns] = useState<string[]>([])


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // ---------------------------
        // Build API params
        // ---------------------------
        const params = new URLSearchParams()
        if (filters.stage) params.append('stage', filters.stage)
        if (filters.finca) params.append('finca', filters.finca)
        if (filters.comercial) params.append('comercial', filters.comercial)
        if (filters.ln) params.append('ln', filters.ln)
        if (typeof filters.month === 'number') params.append('month', String(filters.month))
        if (typeof filters.year === 'number') params.append('year', String(filters.year))
        if (filters.baseDate) params.append('baseDate', filters.baseDate)

        const res = await fetch(`/api/spaces?${params.toString()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()

        const rows: SpaceApiRow[] = Array.isArray(json.data) ? json.data : []
        const totalsArr: number[] = Array.isArray(json.totalPaxPerDia)
          ? json.totalPaxPerDia
          : []

        setSpaces(rows)
        setTotals(totalsArr)

        // ---------------------------
        // 🟩 Build FINCAS list
        // ---------------------------
        const fincasSet = new Set<string>()

        rows.forEach((row) => {
          if (typeof row.finca === 'string' && row.finca.trim() !== '') {
            fincasSet.add(row.finca.trim())
          }
        })

        setFincas(
          Array.from(fincasSet).sort((a, b) =>
            a.localeCompare(b, 'ca', { sensitivity: 'base' })
          )
        )

        // ---------------------------
        // 🟦 Build COMERCIALS list
        // ---------------------------
        const comercialsSet = new Set<string>()

        rows.forEach((row) => {
          const dies = Array.isArray(row.dies) ? row.dies : []

          dies.forEach((day) => {
            const events = Array.isArray(day?.events) ? day.events : []

            events.forEach((ev) => {
              const c = ev?.commercial ?? ev?.Comercial
              if (typeof c === 'string' && c.trim() !== '') {
                comercialsSet.add(c.trim())
              }
            })
          })
        })

        setComercials(
          Array.from(comercialsSet).sort((a, b) =>
            a.localeCompare(b, 'ca', { sensitivity: 'base' })
          )
        )

        // ---------------------------
// 🟨 Build LN list
// ---------------------------
const lnSet = new Set<string>()

rows.forEach((row) => {
  const dies = Array.isArray(row.dies) ? row.dies : []

  dies.forEach((day) => {
    const events = Array.isArray(day?.events) ? day.events : []

    events.forEach((ev) => {
      const ln = ev?.LN ?? ev?.ln
      if (typeof ln === 'string' && ln.trim() !== '') {
        lnSet.add(ln.trim())
      }
    })
  })
})

setLns(
  Array.from(lnSet).sort((a, b) =>
    a.localeCompare(b, 'ca', { sensitivity: 'base' })
  )
)

      } catch (err: unknown) {
        console.error('Error carregant espais:', err)
        setError('No s’han pogut carregar les dades')
        setSpaces([])
        setTotals([])
        setFincas([])
        setComercials([])
        setLns([])

      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // Trigger NOMÉS quan realment canvien filtres
  }, [
    filters.baseDate,
    filters.comercial,
    filters.finca,
    filters.ln,
    filters.month,
    filters.stage,
    filters.year,
  ])

  return {
    spaces,
    totals,
    fincas,
    comercials,
    loading,
    error,
    lns,
  }
}
