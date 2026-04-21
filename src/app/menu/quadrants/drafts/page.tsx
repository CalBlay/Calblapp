// file: src/app/menu/quadrants/drafts/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Loader2 } from 'lucide-react'
import React from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar from '@/components/layout/FiltersBar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import QuadrantCard from './components/QuadrantCard'

/* ──────────────────────────────
   Tipus de dades
────────────────────────────── */
export interface Draft {
  id: string
  code: string
  eventName: string

  // Dates
  startDate: string
  endDate?: string
  startTime?: string
  endTime?: string

  // Localització
  location?: string | { [key: string]: unknown }
  meetingPoint?: string

  // Departament
  department?: string

  // Responsables
  responsableId?: string
  responsableName?: string | { [key: string]: unknown }
  responsable?: {
    id?: string
    name?: string
    meetingPoint?: string
    plate?: string
    vehicleType?: string
  }

  // Conductors
  conductors?: Array<{
    id?: string
    name: string
    meetingPoint?: string
    plate?: string
    vehicleType?: string
  }>

  // Treballadors
  treballadors?: Array<{
    id?: string
    name: string
    meetingPoint?: string
  }>

  legacyBrigades?: Array<{
    id?: string
    name?: string
    workers?: number
    startDate?: string
    endDate?: string
    startTime?: string
    endTime?: string
  }>

  // Grups cuina
  groups?: Array<{
    id?: string | null
    serviceDate?: string | null
    dateLabel?: string | null
    meetingPoint?: string
    startTime?: string
    arrivalTime?: string | null
    endTime?: string
    workers?: number
    drivers?: number
    responsibleId?: string | null
    responsibleName?: string | null
  }>
  timetables?: Array<{ startTime: string; endTime: string }>

  // Comptadors requerits
  responsablesNeeded?: number
  numDrivers?: number
  totalWorkers?: number

  // Sistema
  updatedAt?: string
  status?: 'draft' | 'confirmed'
  service?: string | null
  vestimentModel?: string | null
  numPax?: number | null
  commercial?: string | null  
}

/* ──────────────────────────────
   Helpers
────────────────────────────── */
const fetcher = (url: string) => fetch(url).then((r) => r.json())
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const timeToMinutes = (time?: string) => {
  if (!time) return null
  const [hours, minutes] = time.split(':').map((part) => Number(part))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

const selectEdgeTime = (
  candidates: Array<string | undefined | null>,
  fallback: string | undefined,
  comparator: (current: number, best: number) => boolean
): string | undefined => {
  let best: { value: number; text: string } | null = null
  candidates.forEach((candidate) => {
    if (!candidate) return
    const value = timeToMinutes(candidate)
    if (value === null) return
    if (!best || comparator(value, best.value)) {
      best = { value, text: candidate }
    }
  })
  if (best) return (best as { value: number; text: string }).text
  return fallback
}

const normalizeLocation = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const c =
      (v as Record<string, unknown>).address ??
      (v as Record<string, unknown>).location ??
      (v as Record<string, unknown>).text ??
      (v as Record<string, unknown>).label ??
      (v as Record<string, unknown>).name
    if (typeof c === 'string') return c
  }
  return ''
}

/* ──────────────────────────────
   Component principal
────────────────────────────── */
export default function DraftsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 📅 Rang inicial (ve de la pantalla de Quadrants)
  const startParam = searchParams?.get('start')
  const endParam = searchParams?.get('end')

  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    if (startParam && endParam) {
      return [startParam as string, endParam as string]
    }
    const today = format(new Date(), 'yyyy-MM-dd')
    return [today, today]
  })

  const norm = (s: unknown) =>
    (s ?? '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  const { data: session } = useSession()
  const role = norm(session?.user?.role)
  const userDept = norm(session?.user?.department)
  const canSelectDepartment = ['admin', 'direccio', 'direccion'].includes(role)

  const [department, setDepartment] = useState<string>(
    canSelectDepartment ? '' : userDept || ''
  )
  const [status, setStatus] = useState<'all' | 'draft' | 'confirmed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* ──────────────────────────────
     API i dades
  ─────────────────────────────── */
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      start: dateRange[0],
      end: dateRange[1],
    })
    const depLC = (department || '').toLowerCase().trim()
    if (depLC) params.set('department', depLC)
    if (status !== 'all') params.set('status', status)
    return `/api/quadrants/list?${params.toString()}`
  }, [dateRange, department, status])

  const { data, isLoading, error, mutate } = useSWR(apiUrl, fetcher)
  const drafts: Draft[] = useMemo(() => data?.drafts || [], [data])

  useEffect(() => {
    const refreshDrafts = () => {
      void mutate()
    }

    window.addEventListener('quadrant:updated', refreshDrafts)
    window.addEventListener('quadrant:created', refreshDrafts)

    return () => {
      window.removeEventListener('quadrant:updated', refreshDrafts)
      window.removeEventListener('quadrant:created', refreshDrafts)
    }
  }, [mutate])

  /* ──────────────────────────────
     Agrupacions i opcions
  ─────────────────────────────── */
  // 🔹 Opcions d'estat per al selector (per si un dia es volen mostrar)
  const statusOptions = useMemo(() => {
    const s = new Set<'draft' | 'confirmed'>()
    drafts.forEach((d) => {
      const v = String(d.status || '').toLowerCase()
      if (v === 'draft' || v === 'confirmed') s.add(v as 'draft' | 'confirmed')
    })
    return s.size
      ? Array.from(s)
      : (['draft', 'confirmed'] as Array<'draft' | 'confirmed'>)
  }, [drafts])

  // 🔹 Agrupació per dia (vista tipus "operativa / Excel")
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Draft[]> = {}
    drafts.forEach((d) => {
      const key = d.startDate || 'Sense data'
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    })
    return groups
  }, [drafts])

  /* ──────────────────────────────
     Filtres i etiquetes
  ─────────────────────────────── */
  const headerDept = canSelectDepartment
    ? department
      ? cap(department)
      : 'Tots'
    : userDept
    ? cap(userDept)
    : 'Tots'

  /* ──────────────────────────────
     Render
  ─────────────────────────────── */
  return (
    <div className="p-4 space-y-6">
      {/* 🔙 Enllaç de retorn */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/menu/quadrants')}
          className="flex items-center gap-2 text-blue-700 hover:underline text-sm"
        >
          <ArrowLeft size={18} /> Torna als Quadrants
        </button>
      </div>

      {/* 🧩 Capçalera del mòdul */}
      <ModuleHeader
        icon="📋"
        title="EDICIÓ DE QUADRANTS"
        subtitle={`Consulta i gestiona els quadrants – ${headerDept}`}
      />

      {/* 🔹 Filtres superiors: data + estat */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Rang de dates (barreta compacta) */}
        {dateRange && (
          <div className="max-w-md">
            <FiltersBar
              filters={{
                start: dateRange[0],
                end: dateRange[1],
              }}
              setFilters={(f) => {
                if (f.start && f.end) setDateRange([f.start, f.end])
              }}
            />
          </div>
        )}

        {/* Selector d'estat (Tots / Esborrany / Confirmat) */}
        <div className="flex items-center gap-2 justify-end">
          <span className="text-sm text-gray-600">Estat:</span>
          <select
            className="h-9 rounded-xl border bg-white px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | 'draft' | 'confirmed')}
          >
            <option value="all">Tots</option>
            {statusOptions.includes('draft') && (
              <option value="draft">Esborranys</option>
            )}
            {statusOptions.includes('confirmed') && (
              <option value="confirmed">Confirmats</option>
            )}
          </select>
        </div>
      </div>

      {/* 🌀 Estat de càrrega */}
      {isLoading && (
        <div className="flex justify-center items-center py-10 text-gray-500">
          <Loader2 className="animate-spin w-5 h-5 mr-2" /> Carregant quadrants…
        </div>
      )}

      {/* ⚠️ Error */}
      {error && (
        <p className="text-red-600 text-center py-10">
          {String(error)}
        </p>
      )}

      {/* 📭 Sense dades */}
      {!isLoading && !error && drafts.length === 0 && (
        <p className="text-gray-400 text-center py-10">
          No hi ha quadrants per mostrar.
        </p>
      )}

      {/* 📊 Vista tipus operativa / Excel */}
      {!isLoading && !error && drafts.length > 0 && (
        <div className="overflow-x-auto border rounded-2xl shadow-sm bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-900 text-sm h-8">
                <TableHead className="py-1">Responsable</TableHead>
                <TableHead className="py-1">Esdeveniment</TableHead>
                <TableHead className="py-1">Finca / Ubicació</TableHead>
                <TableHead className="py-1">Servei / Vestimenta</TableHead>
                <TableHead className="py-1">Personal assignat</TableHead>
                <TableHead className="py-1">Horari</TableHead>
               <TableHead className="text-center py-1 w-[40px]">●</TableHead>

              </TableRow>
            </TableHeader>

            <TableBody>
              {Object.entries(groupedByDate).map(([day, items]) => (
                <React.Fragment key={day}>
                  {/* Subheader per dia */}
                  <TableRow className="bg-emerald-100/70 text-emerald-800 font-semibold">
                    <TableCell colSpan={6}>{day}</TableCell>
                  </TableRow>

                  {/* Files de quadrants */}
                  {items.map((q) => {
                    const responsable =
                      typeof q.responsableName === 'string'
                        ? q.responsableName
                        : (q.responsableName as any)?.name || '—'

                    const loc = normalizeLocation(q.location)
                    const workers = (q.treballadors || []).map((t) => t.name)
                    const drivers = (q.conductors || []).map((c) => c.name)
                    const people = [...workers, ...drivers]

                    const labelEstat =
                      q.status === 'confirmed' ? 'Confirmat' : 'Esborrany'
                    const estatClass =
                      q.status === 'confirmed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'

                    const serviceTimetables = Array.isArray(q.timetables)
                      ? q.timetables
                      : []
                    const startCandidates = [
                      q.startTime,
                      ...serviceTimetables.map((tt) => tt.startTime),
                    ]
                    const endCandidates = [
                      q.endTime,
                      ...serviceTimetables.map((tt) => tt.endTime),
                    ]
                    const earliestServiceStart = selectEdgeTime(
                      startCandidates,
                      q.startTime,
                      (current, best) => current < best
                    )
                    const latestServiceEnd = selectEdgeTime(
                      endCandidates,
                      q.endTime,
                      (current, best) => current > best
                    )
                    const horariLabel = `${earliestServiceStart ?? '—'} – ${
                      latestServiceEnd ?? '—'
                    }`

                    const isExpanded = expandedId === q.id

                    return (
                      <React.Fragment key={q.id}>
                        <TableRow
                          className="text-xs sm:text-sm hover:bg-emerald-50 transition cursor-pointer"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : q.id)
                          }
                        >
                          {/* Responsable */}
                          <TableCell className="font-medium text-gray-800 min-w-[130px] max-w-[160px]">
                            {responsable || '—'}
                          </TableCell>
                         {/* Esdeveniment */}
                        <TableCell>{q.eventName || '—'}</TableCell>

                          {/* Ubicació */}
                          <TableCell className="min-w-[150px] max-w-[220px] truncate">
                            {loc || '—'}
                          </TableCell>

                          {/* Servei */}
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{q.service ?? '—'}</span>
                              {String(q.vestimentModel || '').trim() ? (
                                <span className="text-[11px] text-violet-700">{q.vestimentModel}</span>
                              ) : null}
                            </div>
                          </TableCell>


                          {/* Personal assignat */}
                          <TableCell className="max-w-[260px] truncate">
                            {people.length
                              ? people.join(', ')
                              : '—'}
                          </TableCell>


                          {/* Horari */}
                          <TableCell>{horariLabel}</TableCell>
                              {/* ● Punt d’estat */}
<TableCell className="text-center">
<span
  className={`inline-block w-3 h-3 rounded-full ${
    q.status === 'confirmed'
      ? 'bg-green-500'       // Confirmat = Verd
      : q.status === 'draft'
      ? 'bg-blue-500'        // Esborrany = taronja
      : 'bg-yellow-400'      // Pending = Groc
  }`}
/>

</TableCell>

                        
                        </TableRow>

                        {/* Fila expandida: edició completa del quadrant (DraftsTable via QuadrantCard) */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <div className="mt-2 mb-4">
                                <QuadrantCard quadrant={q} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

