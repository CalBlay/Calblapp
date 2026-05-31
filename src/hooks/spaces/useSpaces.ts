'use client'

import { useEffect, useState } from 'react'
import { SpacesFilterState } from '@/components/spaces/SpacesFilters'

type SpaceEventRow = Record<string, unknown>
type SpaceDayRow = { date?: string; events?: SpaceEventRow[] }
export type SpaceApiRow = { finca?: string; dies?: SpaceDayRow[]; fincaId?: string }

function buildFacetValues(rows: SpaceApiRow[]) {
  const fincasSet = new Set<string>()
  const comercialsSet = new Set<string>()
  const lnsSet = new Set<string>()

  rows.forEach((row) => {
    if (typeof row.finca === 'string' && row.finca.trim() !== '') {
      fincasSet.add(row.finca.trim())
    }

    const dies = Array.isArray(row.dies) ? row.dies : []
    dies.forEach((day) => {
      const events = Array.isArray(day?.events) ? day.events : []
      events.forEach((event) => {
        const comercial = event?.commercial ?? event?.Comercial
        if (typeof comercial === 'string' && comercial.trim() !== '') {
          comercialsSet.add(comercial.trim())
        }

        const ln = event?.LN ?? event?.ln
        if (typeof ln === 'string' && ln.trim() !== '') {
          lnsSet.add(ln.trim())
        }
      })
    })
  })

  const sortValues = (values: Set<string>) =>
    Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'ca', { sensitivity: 'base' })
    )

  return {
    fincas: sortValues(fincasSet),
    comercials: sortValues(comercialsSet),
    lns: sortValues(lnsSet),
  }
}

export function useSpaces(
  filters: SpacesFilterState & { baseDate: string; month?: number; year?: number },
  refreshKey = 0
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
        const filteredParams = new URLSearchParams()
        ;(filters.stage ?? []).forEach((value) => filteredParams.append('stage', value))
        ;(filters.finca ?? []).forEach((value) => filteredParams.append('finca', value))
        ;(filters.comercial ?? []).forEach((value) => filteredParams.append('comercial', value))
        ;(filters.ln ?? []).forEach((value) => filteredParams.append('ln', value))
        if (typeof filters.month === 'number') filteredParams.append('month', String(filters.month))
        if (typeof filters.year === 'number') filteredParams.append('year', String(filters.year))
        if (filters.baseDate) filteredParams.append('baseDate', filters.baseDate)

        const facetParams = new URLSearchParams()
        ;(filters.stage ?? []).forEach((value) => facetParams.append('stage', value))
        if (typeof filters.month === 'number') facetParams.append('month', String(filters.month))
        if (typeof filters.year === 'number') facetParams.append('year', String(filters.year))
        if (filters.baseDate) facetParams.append('baseDate', filters.baseDate)

        const [filteredRes, facetRes] = await Promise.all([
          fetch(`/api/spaces?${filteredParams.toString()}`),
          fetch(`/api/spaces?${facetParams.toString()}`),
        ])

        if (!filteredRes.ok) {
          const json = await filteredRes.json().catch(() => ({}))
          throw new Error(
            filteredRes.status === 403
              ? 'No tens permisos per veure les reserves d’espais'
              : json?.error || `HTTP ${filteredRes.status}`
          )
        }

        if (!facetRes.ok) {
          const json = await facetRes.json().catch(() => ({}))
          throw new Error(
            facetRes.status === 403
              ? 'No tens permisos per carregar els filtres d’espais'
              : json?.error || `HTTP ${facetRes.status}`
          )
        }

        const filteredJson = await filteredRes.json()
        const facetJson = await facetRes.json()

        const rows: SpaceApiRow[] = Array.isArray(filteredJson.data) ? filteredJson.data : []
        const totalsArr: number[] = Array.isArray(filteredJson.totalPaxPerDia)
          ? filteredJson.totalPaxPerDia
          : []
        const facetRows: SpaceApiRow[] = Array.isArray(facetJson.data) ? facetJson.data : []

        setSpaces(rows)
        setTotals(totalsArr)

        const facets = buildFacetValues(facetRows)
        setFincas(facets.fincas)
        setComercials(facets.comercials)
        setLns(facets.lns)
      } catch (err: unknown) {
        console.error('Error carregant espais:', err)
        setError(err instanceof Error ? err.message : 'No s han pogut carregar les dades')
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
  }, [
    filters.baseDate,
    filters.comercial,
    filters.finca,
    filters.ln,
    filters.month,
    filters.stage,
    filters.year,
    refreshKey,
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
