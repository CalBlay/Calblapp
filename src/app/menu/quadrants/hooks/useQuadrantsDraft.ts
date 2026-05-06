// src/app/menu/quadrants/hooks/useQuadrantsDraft.ts
'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'

export interface Participant {
  id?: string
  name?: string
}

export interface Draft {
  id: string
  code: string
  eventName: string
  department: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  location?: string
  totalWorkers: number
  numDrivers: number
  responsableId?: string
  responsableName?: string
  conductors?: Participant[]
  treballadors?: Participant[]
  updatedAt: string
}

const fetcher = (url: string): Promise<Draft[]> =>
  axios.get(url).then((r) => {
    const b = r.data
    if (Array.isArray(b)) return b as Draft[]
    if (Array.isArray(b?.drafts)) return b.drafts as Draft[]
    if (Array.isArray(b?.items)) return b.items as Draft[]
    return [] as Draft[]
  })

function toYMD(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function currentWeekRange() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = (today.getDay() + 6) % 7 // dilluns=0
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toYMD(monday), end: toYMD(sunday) }
}

function participantArrayToNames(arr?: Participant[]): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((x) => {
      if (typeof x === 'string') return x // fallback per si algun és string
      if (x && typeof x === 'object') return String(x.name || x.id || '')
      return ''
    })
    .filter(Boolean)
}

export function useQuadrantsDraft(params?: { department?: string }) {
  // Filtres d’UI (client-side)
  const [weekFilter, setWeekFilter] = useState<string>('') // reservat per més endavant
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  })
  const [personFilter, setPersonFilter] = useState<string>('')

  // Construeix URL amb rang per defecte (setmana actual)
  const week = currentWeekRange()
  const start = dateFilter.start || week.start
  const end = dateFilter.end || week.end

  const qs = new URLSearchParams({ start, end })
  if (params?.department) qs.set('department', params.department)

  const { data, error, isLoading, mutate } = useSWR<Draft[]>(
    `/api/quadrants/list?${qs.toString()}`,
    fetcher,
    { revalidateOnFocus: true }
  )

  // Apliquem filtres extra al client (persona)
  const filteredDrafts = useMemo(() => {
    const allDrafts: Draft[] = data || []
    if (!personFilter) return allDrafts

    const pf = personFilter.toLowerCase()
    return allDrafts.filter((d) => {
      const w = participantArrayToNames(d.treballadors).some((n) =>
        n.toLowerCase().includes(pf)
      )
      const c = participantArrayToNames(d.conductors).some((n) =>
        n.toLowerCase().includes(pf)
      )
      const r = String(d.responsableName || '').toLowerCase().includes(pf)
      return w || c || r
    })
  }, [data, personFilter])

  // Ordenació i agrupació per dia (dl → dg)
  const drafts = useMemo(() => {
    return [...filteredDrafts].sort((a, b) => {
      const kA = `${a.startDate} ${a.startTime}`
      const kB = `${b.startDate} ${b.startTime}`
      return kA.localeCompare(kB)
    })
  }, [filteredDrafts])

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Draft[]>()
    drafts.forEach((d) => {
      const key = d.startDate || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, items]) => ({ date, items }))
  }, [drafts])

  return {
    drafts, // llista plana (ordenada)
    groupedByDate, // [{date:'YYYY-MM-DD', items: Draft[]}]
    loading: isLoading,
    error: error ? (error as Error).message : null,
    // setters filtres
    weekFilter,
    setWeekFilter,
    dateFilter,
    setDateFilter,
    personFilter,
    setPersonFilter,
    // revalidació
    refetchDrafts: mutate,
  }
}
