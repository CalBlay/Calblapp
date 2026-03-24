// file: src/components/reports/summary/SummaryPanel.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { FiltersBar, type Filters } from '@/components/reports/filters/FiltersBar'
import { KpiCard } from './KpiCard'
import { EventsTable, type EventRow } from './EventsTable'

type PersonalRes = { summary?: { hours?: number; people?: number } }
type EventsRes = {
  summary?: { totalEvents?: number; avgPax?: number }
  data?: Array<{ id: string; name: string; ln: string; pax: number; location: string; commercial: string; serviceType?: string }>
}
type FinancialRes = { summary?: { revenue?: number; cost?: number; marginPct?: number } }
type VehiclesRes = { vehicles?: Array<{ distanceKm?: number; cost?: number }> }
type IncidenciesRes = { summary?: { total?: number; open?: number } }
type ModsRes = { summary?: { total?: number; last72?: number } }
type EventsOptions = { id: string; name: string }

export function SummaryPanel() {
  const defaultRange = getCurrentWeekRange()
  const [filters, setFilters] = useState<Filters>({
    start: defaultRange.start,
    end: defaultRange.end,
    department: '',
    event: '',
    person: '',
    line: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kpis, setKpis] = useState<Record<string, string | number>>({})
  const [eventsList, setEventsList] = useState<EventRow[]>([])
  const [eventOptions, setEventOptions] = useState<EventsOptions[]>([])
  const [lineOptions, setLineOptions] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ start: filters.start, end: filters.end })
      if (filters.event.trim()) qs.set('event', filters.event.trim())
      if (filters.line.trim()) qs.set('line', filters.line.trim())

      const [personal, events, financial, vehicles, incidencies, mods] = await Promise.all([
        fetchJson<PersonalRes>(`/api/reports/personal?${qs.toString()}`),
        fetchJson<EventsRes>(`/api/reports/events?${qs.toString()}`),
        fetchJson<FinancialRes>(`/api/reports/financial?${qs.toString()}`),
        fetchJson<VehiclesRes>(`/api/reports/vehicles?${qs.toString()}`),
        fetchJson<IncidenciesRes>(`/api/reports/incidencies?${qs.toString()}`),
        fetchJson<ModsRes>(`/api/reports/modificacions?${qs.toString()}`),
      ])

      const vehKm = (vehicles.vehicles || []).reduce((acc, v) => acc + Number(v.distanceKm || 0), 0)
      const vehCost = (vehicles.vehicles || []).reduce((acc, v) => acc + Number(v.cost || 0), 0)
      setEventsList(
        (events.data || []).map((event) => ({
          ...event,
          serviceType: event.serviceType || '',
        }))
      )
      setEventOptions(Array.isArray((events as any)?.options?.events) ? (events as any).options.events : [])
      setLineOptions(Array.isArray((events as any)?.options?.lines) ? (events as any).options.lines : [])

      setKpis({
        hours: personal.summary?.hours?.toFixed ? personal.summary.hours.toFixed(1) : personal.summary?.hours || 0,
        people: personal.summary?.people || 0,
        events: events.summary?.totalEvents || 0,
        avgPax: events.summary?.avgPax ? events.summary.avgPax.toFixed(1) : 0,
        revenue: financial.summary?.revenue ? `${financial.summary.revenue.toFixed(0)} €` : '0 €',
        laborCost: financial.summary?.cost ? `${financial.summary.cost.toFixed(0)} €` : '0 €',
        marginPct: financial.summary?.marginPct ? `${financial.summary.marginPct.toFixed(1)} %` : '0 %',
        vehKm: vehKm.toFixed(1),
        vehCost: `${vehCost.toFixed(2)} €`,
        incidents: incidencies.summary?.total || 0,
        incidentsOpen: incidencies.summary?.open || 0,
        mods72: mods.summary?.last72 || 0,
        modsTotal: mods.summary?.total || 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconegut')
      setKpis({})
      setEventsList([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto -mx-1 px-1">
        <FiltersBar
          value={filters}
          onChange={setFilters}
          eventOptions={eventOptions}
          departmentOptions={[]}
          personOptions={[]}
          lineOptions={lineOptions}
          collapsible
        />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard title="Hores treballades" value={kpis.hours ?? '0'} />
        <KpiCard title="Treballadors" value={kpis.people ?? '0'} />
        <KpiCard title="Esdeveniments" value={kpis.events ?? '0'} />
        <KpiCard title="Pax mitjana" value={kpis.avgPax ?? '0'} />

        <KpiCard title="Ingressos" value={kpis.revenue ?? '0 €'} />
        <KpiCard title="Cost laboral" value={kpis.laborCost ?? '0 €'} />
        <KpiCard title="Marge %" value={kpis.marginPct ?? '0 %'} />
        <KpiCard title="Km vehicles" value={kpis.vehKm ?? '0'} subtitle={kpis.vehCost ? `Cost ${kpis.vehCost}` : ''} />

        <KpiCard title="Incidències" value={kpis.incidents ?? 0} />
        <KpiCard title="Incidències obertes" value={kpis.incidentsOpen ?? 0} />
        <KpiCard title="Mods <72h" value={kpis.mods72 ?? 0} />
        <KpiCard title="Mods totals" value={kpis.modsTotal ?? 0} />
      </div>

      {loading && <div className="text-sm text-gray-500">Carregant resum…</div>}

      <EventsTable data={eventsList || []} />
    </div>
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data as T
}

function getCurrentWeekRange() {
  const now = new Date()
  const day = now.getDay() || 7 // convert Sunday (0) to 7
  const start = new Date(now)
  start.setDate(now.getDate() - (day - 1))
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}
