// file: src/hooks/useDepartments.ts
'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export type DepartmentsResponse = {
  departments?: string[]
}

const fetchDepartments = async (url: string): Promise<DepartmentsResponse> => {
  const response = await fetch(url)
  return response.json()
}

// normalitza (minúscules sense accents) per evitar duplicats
const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string) => unaccent((s || '').toLowerCase().trim())

export function useDepartments() {
  // ✅ crida el teu endpoint real
  const { data, error, isLoading } = useSWR<DepartmentsResponse>(
    '/api/quadrants/departments',
    fetchDepartments,
    {
    revalidateOnFocus: false,
    }
  )

  const values: string[] = Array.from(
    new Set((data?.departments || []).map(norm))
  ).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ca'))

  return { values, isLoading, error }
}
