'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { emptyDepartmentBlock, newVehicleTripLine } from '@/lib/costServeis/defaults'
import { fuelCostForTrip, recomputeSheet } from '@/lib/costServeis/calc'
import {
  canChooseCostDepartment,
  resolveCostDepartmentFilter,
} from '@/lib/costServeis/access'
import {
  COST_SERVEIS_DEPARTMENTS,
  COST_SERVEIS_DEPT_LABELS,
  type CostServeisDepartment,
  type DepartmentCostBlock,
  type FuelConfig,
  type ServiceCostConfig,
  type ServiceCostSheet,
  type VehicleTripLine,
} from '@/lib/costServeis/types'
import { formatDateOnly } from '@/lib/date-format'
import { TRANSPORT_TYPE_OPTIONS } from '@/lib/transportTypes'
import { cn } from '@/lib/utils'
import { SpaceKindBadge } from '../../SpaceKindBadge'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtEuro = (n: number) =>
  n.toLocaleString('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

function fuelRateForType(fuel: FuelConfig, vehicleType: string) {
  return (
    fuel.byVehicleType[vehicleType] || {
      litersPer100km: 12,
      pricePerLiter: 1.47,
    }
  )
}

function DeptEditor({
  dept,
  block,
  fuel,
  hourlyRate,
  onChange,
}: {
  dept: CostServeisDepartment
  block: DepartmentCostBlock
  fuel: FuelConfig
  hourlyRate: number
  onChange: (next: DepartmentCostBlock) => void
}) {
  const patch = (p: Partial<DepartmentCostBlock>) => onChange({ ...block, ...p })
  const showPrepRentat = dept === 'logistica' || dept === 'cuina'

  const updateTrip = (id: string, p: Partial<VehicleTripLine>) => {
    patch({
      vehicleTrips: (block.vehicleTrips || []).map((t) =>
        t.id === id ? { ...t, ...p } : t
      ),
    })
  }

  const addTrip = () => {
    patch({
      vehicleTrips: [...(block.vehicleTrips || []), newVehicleTripLine()],
    })
  }

  const removeTrip = (id: string) => {
    patch({
      vehicleTrips: (block.vehicleTrips || []).filter((t) => t.id !== id),
    })
  }

  const people = Math.max(0, Number(block.peopleCount) || 0)
  const hours = Math.max(0, Number(block.hours) || 0)
  const laborCost = Math.round(people * hours * hourlyRate * 100) / 100

  let fuelCost = 0
  for (const trip of block.vehicleTrips || []) {
    const rate = fuelRateForType(fuel, trip.vehicleType)
    fuelCost += fuelCostForTrip(Number(trip.kmTotal) || 0, rate.litersPer100km, rate.pricePerLiter)
  }
  fuelCost = Math.round(fuelCost * 100) / 100

  return (
    <section
      id={`cost-dept-${dept}`}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-800">{COST_SERVEIS_DEPT_LABELS[dept]}</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-600">
          Convocatòria
          <span className="ml-1 font-normal text-slate-400">· quadrant</span>
          <Input
            type="time"
            className="mt-1 bg-slate-50"
            value={block.callTime}
            readOnly
            title="Hora d’inici del quadrant"
          />
        </label>
        <label className="text-xs text-slate-600">
          Fi / tancament
          <span className="ml-1 font-normal text-slate-400">· auto</span>
          <Input
            type="time"
            className="mt-1 bg-slate-50"
            value={block.closeTime}
            readOnly
            title="Hora de tancament si s’ha fet; si no, hora fi de l’esdeveniment"
          />
        </label>
        <label className="text-xs text-slate-600">
          Personal
          <span className="ml-1 font-normal text-slate-400">· quadrants</span>
          <Input
            type="number"
            className="mt-1 bg-slate-50"
            value={block.peopleCount}
            readOnly
            title="Treballadors totals del departament assignats al quadrant del servei"
          />
        </label>
        <label className="text-xs text-slate-600">
          Hores jornada
          <span className="ml-1 font-normal text-slate-400">· auto</span>
          <Input
            type="number"
            step="0.25"
            className="mt-1 bg-slate-50"
            value={block.hours}
            readOnly
            title="Convocatòria → tancament (o hora fi de l’event)"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Hores totals</div>
          <div className="font-semibold text-slate-800">
            {(people * hours).toLocaleString('ca-ES', { maximumFractionDigits: 2 })} h
          </div>
          <div className="text-[11px] text-slate-500">Personal × jornada</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Cost personal</div>
          <div className="font-semibold text-slate-800">{fmtEuro(laborCost)}</div>
          <div className="text-[11px] text-slate-500">
            {hourlyRate.toLocaleString('ca-ES', { maximumFractionDigits: 2 })} €/h
          </div>
        </div>
        <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-cyan-700">Cost combustible</div>
          <div className="font-semibold text-cyan-900">{fmtEuro(fuelCost)}</div>
          <div className="text-[11px] text-cyan-700/80">km × L/100 × €/L</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-700">Vehicles / km</div>
          <Button type="button" variant="outline" size="sm" onClick={addTrip}>
            Afegir vehicle
          </Button>
        </div>
        {(block.vehicleTrips || []).length === 0 ? (
          <p className="text-xs text-slate-500">Cap vehicle. Afegeix-ne un per calcular combustible.</p>
        ) : (
          (block.vehicleTrips || []).map((trip) => {
            const rate = fuelRateForType(fuel, trip.vehicleType)
            const tripFuel = fuelCostForTrip(
              Number(trip.kmTotal) || 0,
              rate.litersPer100km,
              rate.pricePerLiter
            )
            const liters =
              (Number(trip.kmTotal) || 0) > 0
                ? Math.round(((Number(trip.kmTotal) * rate.litersPer100km) / 100) * 100) / 100
                : 0

            return (
              <div
                key={trip.id}
                className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
              >
                <div className="grid gap-2 sm:grid-cols-5">
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Tipus
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
                      value={trip.vehicleType}
                      onChange={(e) => updateTrip(trip.id, { vehicleType: e.target.value })}
                    >
                      {TRANSPORT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Km anada
                    <Input
                      type="number"
                      step="0.1"
                      className="mt-1"
                      value={trip.kmOutbound}
                      onChange={(e) =>
                        updateTrip(trip.id, { kmOutbound: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Km tornada
                    <Input
                      type="number"
                      step="0.1"
                      className="mt-1"
                      value={trip.kmReturn}
                      onChange={(e) =>
                        updateTrip(trip.id, { kmReturn: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="flex-1 text-xs text-slate-600">
                      Total km
                      <Input type="number" className="mt-1" value={trip.kmTotal} readOnly />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-0.5 text-red-600"
                      onClick={() => removeTrip(trip.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-slate-600">
                  <span>
                    {rate.litersPer100km.toLocaleString('ca-ES', { maximumFractionDigits: 1 })} L/100
                    km · {rate.pricePerLiter.toLocaleString('ca-ES', { maximumFractionDigits: 3 })} €/L
                    {liters > 0 ? (
                      <>
                        {' '}
                        · {liters.toLocaleString('ca-ES', { maximumFractionDigits: 2 })} L
                      </>
                    ) : null}
                  </span>
                  <span className="font-medium text-slate-800">
                    Combustible: {fmtEuro(tripFuel)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-slate-600">
          Cost gestió (€)
          <span className="ml-1 font-normal text-slate-400">· OpsiaFinance</span>
          <Input
            type="number"
            step="0.01"
            className="mt-1"
            value={block.managementCost || 0}
            onChange={(e) => patch({ managementCost: Number(e.target.value) || 0 })}
          />
        </label>
        {showPrepRentat ? (
          <>
            <label className="block text-xs text-slate-600">
              Cost preparació (€)
              <span className="ml-1 font-normal text-slate-400">· OpsiaFinance</span>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={block.preparationCost || 0}
                onChange={(e) => patch({ preparationCost: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-xs text-slate-600">
              Cost rentat (€)
              <span className="ml-1 font-normal text-slate-400">· OpsiaFinance</span>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={block.washingCost || 0}
                onChange={(e) => patch({ washingCost: Number(e.target.value) || 0 })}
              />
            </label>
          </>
        ) : null}
      </div>
      <p className="text-[11px] text-slate-500">
        Auto des d’OpsiaFinance (pot del mes) × ponderació Configuració
        {showPrepRentat ? ' (prep/rentat × pax)' : ''}. Editable; en desar es conserva.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <div className="text-xs text-slate-500">
          Personal {fmtEuro(laborCost)} + combustible {fmtEuro(fuelCost)}
          {(block.managementCost || 0) > 0 ||
          (block.preparationCost || 0) > 0 ||
          (block.washingCost || 0) > 0
            ? ' + gestió/prep/rentat'
            : ''}
        </div>
        <div className="font-medium text-slate-800">Subtotal: {fmtEuro(block.subtotal)}</div>
      </div>
    </section>
  )
}

export default function CostServeisFitxaPage() {
  const params = useParams<{ eventId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const eventId = params.eventId
  const { data, isLoading, mutate } = useSWR(
    eventId ? `/api/cost-serveis/events/${eventId}` : null,
    fetcher
  )
  const [sheet, setSheet] = useState<ServiceCostSheet | null>(null)
  const [config, setConfig] = useState<ServiceCostConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const canChoose = canChooseCostDepartment(session?.user?.role, session?.user?.department)
  const focusDept = resolveCostDepartmentFilter({
    role: session?.user?.role,
    department: session?.user?.department,
    requested: searchParams.get('dept'),
  })

  const visibleDepts = useMemo(() => {
    if (!canChoose && focusDept !== 'all') return [focusDept]
    return [...COST_SERVEIS_DEPARTMENTS]
  }, [canChoose, focusDept])

  useEffect(() => {
    if (data?.sheet) setSheet(data.sheet)
    if (data?.config) setConfig(data.config)
  }, [data])

  useEffect(() => {
    if (focusDept === 'all') return
    const el = document.getElementById(`cost-dept-${focusDept}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusDept, data])

  const live = useMemo(() => {
    if (!sheet || !config) return null
    return recomputeSheet(sheet, config.hourlyRates, config.fuel)
  }, [sheet, config])

  const setDept = (dept: CostServeisDepartment, block: DepartmentCostBlock) => {
    setSheet((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        departments: {
          ...prev.departments,
          [dept]: block,
        },
      }
    })
  }

  const save = async () => {
    if (!live) return
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(`/api/cost-serveis/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(live),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Error desant')
      setSheet(json.sheet)
      await mutate({ sheet: json.sheet, config }, false)
      setMessage('Fitxa desada.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !live || !config) {
    return (
      <div className="p-4">
        <ModuleHeader title="Fitxa de cost" />
        <p className="mt-4 text-sm text-slate-500">
          {isLoading ? 'Carregant…' : 'No s’ha trobat l’esdeveniment.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-28">
      <ModuleHeader
        title={live.eventName}
        subtitle={`${formatDateOnly(live.eventDate)} · ${live.serviceType || 'Sense tipus'} · ${live.ln || 'Sense LN'} · ${live.location || 'Sense ubicació'}`}
      />

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-5">
        <div>
          <div className="text-xs text-slate-500">Espai</div>
          <div className="mt-0.5 font-medium">
            <SpaceKindBadge kind={live.spaceKind} />
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Pax</div>
          <div className="font-medium">{live.numPax || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Facturació</div>
          <div className="font-medium">{fmtEuro(live.billing)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Cost operatiu</div>
          <div className="font-medium">{fmtEuro(live.operationalTotal)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">% sobre facturació</div>
          <div className="font-medium">
            {live.pctOfBilling != null
              ? `${(live.pctOfBilling * 100).toFixed(1)}%`
              : '—'}
          </div>
        </div>
      </div>

      {visibleDepts.map((dept) => (
        <div
          key={dept}
          className={cn(focusDept === dept ? 'ring-2 ring-cyan-500/40 rounded-xl' : undefined)}
        >
          <DeptEditor
            dept={dept}
            block={live.departments[dept] || emptyDepartmentBlock()}
            fuel={config.fuel}
            hourlyRate={config.hourlyRates[dept] || 0}
            onChange={(b) => setDept(dept, b)}
          />
        </div>
      ))}

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        <div className="font-medium text-slate-800">Cost salarial fix (OpsiaFinance)</div>
        <p className="mt-1 text-xs">
          Importació per API (Logística + Cuina central) — propera fase. Pots deixar un import
          manual provisional.
        </p>
        <label className="mt-3 block max-w-xs text-xs">
          Quota fixa assignada (€)
          <Input
            type="number"
            step="0.01"
            className="mt-1"
            value={live.fixedSalaryAllocated}
            onChange={(e) =>
              setSheet((prev) =>
                prev
                  ? { ...prev, fixedSalaryAllocated: Number(e.target.value) || 0 }
                  : prev
              )
            }
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <Button variant="outline" onClick={() => router.push('/menu/cost-serveis/edicio')}>
          Tornar
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Desant…' : 'Desar fitxa'}
        </Button>
        <div className="ml-auto text-sm font-semibold text-slate-900">
          Total: {fmtEuro(live.total)}
        </div>
        {message ? <span className="w-full text-sm text-slate-600">{message}</span> : null}
      </div>
    </div>
  )
}
