'use client'

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Calendar } from 'lucide-react'
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { ca } from 'date-fns/locale'
import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  canChooseCostDepartment,
  costDepartmentSelectOptions,
  resolveCostDepartmentFilter,
} from '@/lib/costServeis/access'
import {
  COST_SERVEIS_DEPARTMENTS,
  COST_SERVEIS_DEPT_LABELS,
  type CostServeisDepartment,
  type ServiceCostConfig,
  type ServiceCostDeptSummary,
  type ServiceCostListItem,
} from '@/lib/costServeis/types'
import type { ManualServiceLine, ManualServiceOrigin } from '@/lib/costServeis/manualServices'
import { MANUAL_LN_OPTIONS, normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'
import SearchFincaInput from '@/components/shared/SearchFincaInput'
import {
  TRANSPORT_TYPE_LABELS,
  TRANSPORT_TYPE_OPTIONS,
  normalizeTransportType,
} from '@/lib/transportTypes'
import { parseRoleForPreparationFilters } from '@/lib/logistics/preparationFilters'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
import { SPACE_KIND_LABELS, type SpaceKind } from '@/lib/costServeis/spaceOwnership'
import { SpaceKindBadge } from '../SpaceKindBadge'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtEuro = (n: number, digits = 0) =>
  n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
  })

const fmtNum = (n: number, digits = 1) =>
  n.toLocaleString('ca-ES', { maximumFractionDigits: digits })

function formatDayLabel(isoDay: string): string {
  if (!isoDay) return 'Sense data'
  const parsed = parseISO(isoDay)
  if (Number.isNaN(parsed.getTime())) return isoDay
  return format(parsed, "EEEE d MMMM yyyy", { locale: ca })
}

function defaultMonthRange() {
  const now = new Date()
  return {
    start: format(startOfMonth(now), 'yyyy-MM-dd'),
    end: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

function emptySummary(): ServiceCostDeptSummary {
  return {
    peopleCount: 0,
    hours: 0,
    personHours: 0,
    extras: 0,
    kmTotal: 0,
    laborCost: 0,
    fuelCost: 0,
    managementCost: 0,
    preparationCost: 0,
    washingCost: 0,
    vehicleCount: 0,
    subtotal: 0,
    vehicles: [],
  }
}

function CellDash({ children, empty }: { children: ReactNode; empty?: boolean }) {
  if (empty) return <span className="text-slate-300">—</span>
  return <>{children}</>
}

type DayRow =
  | { kind: 'event'; row: ServiceCostListItem }
  | { kind: 'manual'; row: ManualServiceLine }

type ManualFormState = {
  id?: string
  origin?: ManualServiceOrigin
  eventDate: string
  eventName: string
  ln: string
  location: string
  locationOther: boolean
  fincaId: string | null
  serviceType: string
  dept: CostServeisDepartment
  peopleCount: number
  hours: number
  vehicleCount: number
  vehicleType: string
  kmTotal: number
  fuelCost: number
  managementHours: number
  preparationHours: number
  washingHours: number
  managementCost: number
  preparationCost: number
  washingCost: number
  billing: number
  notes: string
}

function emptyManualForm(day: string, dept: CostServeisDepartment): ManualFormState {
  return {
    origin: 'edicio',
    eventDate: day,
    eventName: '',
    ln: '',
    location: '',
    locationOther: false,
    fincaId: null,
    serviceType: '',
    dept,
    peopleCount: 0,
    hours: 0,
    vehicleCount: 1,
    vehicleType: '',
    kmTotal: 0,
    fuelCost: 0,
    managementHours: 0,
    preparationHours: 0,
    washingHours: 0,
    managementCost: 0,
    preparationCost: 0,
    washingCost: 0,
    billing: 0,
    notes: '',
  }
}

function pendingStructureCosts(row: Pick<
  ManualServiceLine,
  | 'managementCost'
  | 'preparationCost'
  | 'washingCost'
  | 'managementHours'
  | 'preparationHours'
  | 'washingHours'
>): boolean {
  return (
    (row.managementHours || 0) <= 0 &&
    (row.preparationHours || 0) <= 0 &&
    (row.washingHours || 0) <= 0 &&
    (row.managementCost || 0) <= 0 &&
    (row.preparationCost || 0) <= 0 &&
    (row.washingCost || 0) <= 0
  )
}

function hoursFromLegacyCost(cost: number, hourlyRate: number): number {
  if (cost <= 0 || hourlyRate <= 0) return 0
  return Math.round((cost / hourlyRate) * 100) / 100
}

/** Recupera vehicleType si es va desar per error al camp tipus de servei. */
function resolveManualVehicleType(row: ManualServiceLine): {
  vehicleType: string
  serviceType: string
} {
  const fromField = normalizeTransportType(row.vehicleType || '')
  if (fromField && TRANSPORT_TYPE_LABELS[fromField]) {
    return {
      vehicleType: fromField,
      serviceType:
        row.origin === 'disponibilitat' &&
        (!row.serviceType ||
          normalizeTransportType(row.serviceType) === fromField ||
          TRANSPORT_TYPE_OPTIONS.some(
            (o) => o.label.toLowerCase() === row.serviceType.trim().toLowerCase()
          ))
          ? 'Intern'
          : row.serviceType,
    }
  }

  const fromService = normalizeTransportType(row.serviceType || '')
  const matchedByLabel = TRANSPORT_TYPE_OPTIONS.find(
    (o) =>
      o.label.toLowerCase().replace(/\s+/g, '') ===
      String(row.serviceType || '')
        .toLowerCase()
        .replace(/\s+/g, '')
  )

  const recovered = matchedByLabel?.value || (TRANSPORT_TYPE_LABELS[fromService] ? fromService : '')
  if (recovered && row.origin === 'disponibilitat') {
    return { vehicleType: recovered, serviceType: 'Intern' }
  }
  if (recovered && !row.vehicleType) {
    return { vehicleType: recovered, serviceType: row.serviceType }
  }
  return {
    vehicleType: row.vehicleType || '',
    serviceType: row.origin === 'disponibilitat' ? row.serviceType || 'Intern' : row.serviceType,
  }
}

export default function CostServeisEdicioPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const userDept = session?.user?.department
  const canChoose = canChooseCostDepartment(role, userDept)

  const [dateRange, setDateRange] = useState(defaultMonthRange)
  const [filterMode, setFilterMode] = useState<'week' | 'month' | 'year' | 'day' | 'range'>('month')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [spaceKindFilter, setSpaceKindFilter] = useState<'all' | SpaceKind>('all')
  const [manualForm, setManualForm] = useState<ManualFormState | null>(null)
  const [savingManual, setSavingManual] = useState(false)
  const [manualMsg, setManualMsg] = useState('')

  const effectiveDept = useMemo(
    () =>
      resolveCostDepartmentFilter({
        role,
        department: userDept,
        requested: deptFilter,
      }),
    [role, userDept, deptFilter]
  )

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/events?from=${dateRange.start}&to=${dateRange.end}`,
    fetcher
  )
  const { data: configData } = useSWR('/api/cost-serveis/config', fetcher)
  const serviceConfig = (configData?.config || null) as ServiceCostConfig | null
  const items = (data?.items || []) as ServiceCostListItem[]
  const manuals = (data?.manuals || []) as ManualServiceLine[]
  const missingServiceTypes = (data?.missingServiceTypes || []) as Array<{
    nom: string
    count: number
  }>

  const visibleEvents = useMemo(() => {
    if (spaceKindFilter === 'all') return items
    return items.filter((row) => row.spaceKind === spaceKindFilter)
  }, [items, spaceKindFilter])

  const visibleManuals = useMemo(() => {
    let rows = manuals
    if (effectiveDept !== 'all') {
      rows = rows.filter((r) => r.dept === effectiveDept)
    }
    if (spaceKindFilter !== 'all') {
      rows = rows.filter((r) => r.spaceKind === spaceKindFilter)
    }
    return rows
  }, [manuals, effectiveDept, spaceKindFilter])

  const groupedByDay = useMemo(() => {
    const map = new Map<string, DayRow[]>()
    for (const row of visibleEvents) {
      const key = row.eventDate.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ kind: 'event', row })
    }
    for (const row of visibleManuals) {
      const key = row.eventDate.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ kind: 'manual', row })
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => {
        const na = a.kind === 'event' ? a.row.eventName : a.row.eventName
        const nb = b.kind === 'event' ? b.row.eventName : b.row.eventName
        if (a.kind !== b.kind) return a.kind === 'manual' ? -1 : 1
        return na.localeCompare(nb, 'ca', { sensitivity: 'base' })
      })
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [visibleEvents, visibleManuals])

  const deptOptions = costDepartmentSelectOptions(canChoose)
  const smartRole = parseRoleForPreparationFilters(String(role || '').toLowerCase())
  const showAllDepts = effectiveDept === 'all'
  const showPrepRentat =
    showAllDepts || effectiveDept === 'logistica' || effectiveDept === 'cuina'

  const costForEvent = (row: ServiceCostListItem) => {
    if (showAllDepts) return row.total
    return row.byDepartment?.[effectiveDept as CostServeisDepartment] ?? 0
  }

  const pctForEvent = (row: ServiceCostListItem) => {
    const cost = costForEvent(row)
    if (!row.billing || row.billing <= 0) return null
    return cost / row.billing
  }

  const detailForEvent = (row: ServiceCostListItem): ServiceCostDeptSummary => {
    if (showAllDepts) return emptySummary()
    return (
      row.detailByDepartment?.[effectiveDept as CostServeisDepartment] || emptySummary()
    )
  }

  const sumOpsiaField = (
    row: ServiceCostListItem,
    field: 'managementCost' | 'preparationCost' | 'washingCost'
  ) => {
    if (showAllDepts) {
      const depts: CostServeisDepartment[] =
        field === 'managementCost'
          ? [...COST_SERVEIS_DEPARTMENTS]
          : ['logistica', 'cuina']
      return depts.reduce(
        (s, d) => s + (row.detailByDepartment?.[d]?.[field] || 0),
        0
      )
    }
    return detailForEvent(row)[field]
  }

  const laborCostForEvent = (row: ServiceCostListItem) => {
    if (showAllDepts) {
      return COST_SERVEIS_DEPARTMENTS.reduce(
        (s, d) => s + (row.detailByDepartment?.[d]?.laborCost || 0),
        0
      )
    }
    return detailForEvent(row).laborCost || 0
  }

  const edicioHref = (eventId: string) => {
    if (showAllDepts) return `/menu/cost-serveis/edicio/${eventId}`
    return `/menu/cost-serveis/edicio/${eventId}?dept=${effectiveDept}`
  }

  const openCreateManual = (day?: string) => {
    const dept =
      effectiveDept === 'all'
        ? 'logistica'
        : (effectiveDept as CostServeisDepartment)
    setManualForm(emptyManualForm(day || dateRange.start, dept))
    setManualMsg('')
  }

  const openEditManual = (row: ManualServiceLine) => {
    const rate = serviceConfig?.hourlyRates?.[row.dept] || 18
    const managementHours =
      row.managementHours > 0
        ? row.managementHours
        : hoursFromLegacyCost(row.managementCost, rate)
    const preparationHours =
      row.preparationHours > 0
        ? row.preparationHours
        : hoursFromLegacyCost(row.preparationCost, rate)
    const washingHours =
      row.washingHours > 0
        ? row.washingHours
        : hoursFromLegacyCost(row.washingCost, rate)
    const { vehicleType, serviceType } = resolveManualVehicleType(row)
    setManualForm({
      id: row.id,
      origin: row.origin || 'edicio',
      eventDate: row.eventDate,
      eventName: row.eventName,
      ln: normalizeManualLnName(row.ln),
      location: row.location,
      locationOther: !row.fincaId && Boolean(row.location),
      fincaId: row.fincaId || null,
      serviceType,
      dept: row.dept,
      peopleCount: row.peopleCount,
      hours: row.hours,
      vehicleCount: row.vehicleCount || (vehicleType ? 1 : 0),
      vehicleType,
      kmTotal: row.kmTotal,
      fuelCost: row.fuelCost,
      managementHours,
      preparationHours,
      washingHours,
      managementCost: row.managementCost,
      preparationCost: row.preparationCost,
      washingCost: row.washingCost,
      billing: row.billing,
      notes: row.notes,
    })
    setManualMsg('')
  }

  const saveManual = async () => {
    if (!manualForm) return
    setSavingManual(true)
    setManualMsg('')
    try {
      const payload = {
        ...manualForm,
        autoKm: true,
        managementHours: manualForm.managementHours,
        preparationHours: manualForm.preparationHours,
        washingHours: manualForm.washingHours,
      }
      const res = await fetch('/api/cost-serveis/manual-services', {
        method: manualForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Error desant')
      setManualForm(null)
      await mutate()
    } catch (e) {
      setManualMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingManual(false)
    }
  }

  const deleteManual = async (id: string) => {
    if (!window.confirm('Eliminar aquest servei manual?')) return
    const res = await fetch(`/api/cost-serveis/manual-services?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setManualMsg(json.error || 'Error eliminant')
      return
    }
    await mutate()
  }

  const thClass =
    'whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
  const tdClass = 'whitespace-nowrap px-2 py-2 text-sm text-slate-800'
  const thAccent = 'bg-cyan-50/80'
  const thMuted = 'bg-emerald-50/70'

  const tableHeader = (
    <tr className="border-b border-slate-200">
      <th className={cn(thClass, thMuted, 'min-w-[140px] max-w-[220px]')}>Nom</th>
      <th className={cn(thClass, thMuted, 'max-w-[110px]')}>Tipus</th>
      <th className={cn(thClass, thMuted)}>LN</th>
      <th className={cn(thClass, thMuted)}>Espai</th>
      <th className={cn(thClass, thMuted)}>Pax</th>
      {showAllDepts ? (
        <>
          {COST_SERVEIS_DEPARTMENTS.map((d) => (
            <th key={d} className={cn(thClass, thMuted)}>
              {COST_SERVEIS_DEPT_LABELS[d]}
            </th>
          ))}
          <th className={cn(thClass, thMuted)}>Cost personal</th>
          <th className={cn(thClass, thMuted)}>Gestió</th>
          <th className={cn(thClass, thMuted)}>Preparació</th>
          <th className={cn(thClass, thMuted)}>Rentat</th>
        </>
      ) : (
        <>
          <th className={cn(thClass, thMuted)}>Personal</th>
          <th className={cn(thClass, thMuted)}>Hores</th>
          <th className={cn(thClass, thMuted)}>Cost personal</th>
          <th className={cn(thClass, thMuted)}>Vehicles</th>
          <th className={cn(thClass, thMuted)}>Km</th>
          <th className={cn(thClass, thMuted)}>Combustible</th>
          <th className={cn(thClass, thMuted)}>Gestió</th>
          {showPrepRentat ? (
            <>
              <th className={cn(thClass, thMuted)}>Preparació</th>
              <th className={cn(thClass, thMuted)}>Rentat</th>
            </>
          ) : null}
        </>
      )}
      <th className={cn(thClass, thAccent)}>Total</th>
      <th className={cn(thClass, thAccent)}>Facturació</th>
      <th className={cn(thClass, thAccent)}>%</th>
      <th className={cn(thClass, thAccent)} />
    </tr>
  )

  return (
    <section className="w-full max-w-none space-y-6 pb-12">
      <ModuleHeader
        title="Edició"
        subtitle="Events i línies de Disponibilitat / manuals. Gestió/prep/rentat manuals es resten dels pots d’estructura."
        actions={
          <Button type="button" onClick={() => openCreateManual()}>
            Afegir servei manual
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SmartFilters
          modeDefault={filterMode}
          modeOptions={['week', 'month', 'year', 'day', 'range']}
          role={smartRole}
          showDepartment={false}
          showCommercial={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          initialStart={dateRange.start}
          initialEnd={dateRange.end}
          onChange={(f: SmartFiltersChange) => {
            if (f.mode) setFilterMode(f.mode)
            if (f.start && f.end) {
              setDateRange({ start: f.start, end: f.end })
            }
          }}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-[220px]">
            <label className={corporateFilterLabelClass}>Departament</label>
            {canChoose ? (
              <select
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                value={effectiveDept}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                {deptOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className={cn(
                  corporateFilterFieldClass,
                  'mt-1 flex w-full items-center bg-slate-50 text-slate-700'
                )}
              >
                {COST_SERVEIS_DEPT_LABELS[effectiveDept as CostServeisDepartment]}
              </div>
            )}
          </div>
          <div className="min-w-[220px]">
            <label className={corporateFilterLabelClass}>Espai</label>
            <select
              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              value={spaceKindFilter}
              onChange={(e) => setSpaceKindFilter(e.target.value as 'all' | SpaceKind)}
            >
              <option value="all">Tots</option>
              <option value="Propi">{SPACE_KIND_LABELS.Propi}</option>
              <option value="Extern">{SPACE_KIND_LABELS.Extern}</option>
            </select>
          </div>
        </div>
      </div>

      {missingServiceTypes.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-medium">
            {missingServiceTypes.length} tipus de servei no són al catàleg
          </span>
          {' · '}
          <Link
            href="/menu/cost-serveis/configuracio"
            className="underline hover:text-amber-800"
          >
            Configuració → Ponderació
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : groupedByDay.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm text-slate-500">Cap línia en aquest període.</p>
          <Button className="mt-3" type="button" variant="outline" onClick={() => openCreateManual()}>
            Afegir servei manual
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDay.map(([day, rows]) => {
            const eventCount = rows.filter((r) => r.kind === 'event').length
            const manualCount = rows.filter((r) => r.kind === 'manual').length
            return (
              <section
                key={day}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/70 px-3 py-2">
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold capitalize text-slate-800">
                    <Calendar className="h-4 w-4 text-blue-700" aria-hidden />
                    {formatDayLabel(day)}
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {eventCount} event{eventCount === 1 ? '' : 's'}
                      {manualCount > 0 ? ` · ${manualCount} manual${manualCount === 1 ? '' : 's'}` : ''}
                    </span>
                  </h2>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openCreateManual(day)}
                  >
                    + Manual
                  </Button>
                </header>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>{tableHeader}</thead>
                    <tbody>
                      {rows.map((entry) => {
                        if (entry.kind === 'manual') {
                          const row = entry.row
                          const matchesDeptView =
                            showAllDepts || row.dept === effectiveDept
                          if (!matchesDeptView) return null
                          return (
                            <tr
                              key={`m-${row.id}`}
                              className={cn(
                                'border-t border-slate-100 hover:bg-violet-50/70',
                                row.origin === 'disponibilitat'
                                  ? 'bg-amber-50/50'
                                  : 'bg-violet-50/40'
                              )}
                            >
                              <td className={cn(tdClass, 'max-w-[220px] whitespace-normal')}>
                                <div className="font-medium leading-snug text-slate-900">
                                  {row.eventName}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                                  {row.origin === 'disponibilitat' ? (
                                    <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                                      Disponibilitat
                                    </span>
                                  ) : (
                                    <span className="rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800">
                                      Manual
                                    </span>
                                  )}
                                  {row.origin === 'disponibilitat' &&
                                  pendingStructureCosts(row) ? (
                                    <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-800">
                                      Pendent gestió/prep
                                    </span>
                                  ) : null}
                                  <span className="text-slate-500">
                                    {COST_SERVEIS_DEPT_LABELS[row.dept]}
                                    {row.location ? ` · ${row.location}` : ''}
                                  </span>
                                </div>
                              </td>
                              <td className={cn(tdClass, 'max-w-[110px] whitespace-normal')}>
                                {(() => {
                                  const resolved = resolveManualVehicleType(row)
                                  return resolved.serviceType || '—'
                                })()}
                              </td>
                              <td className={tdClass}>{normalizeManualLnName(row.ln) || '—'}</td>
                              <td className={tdClass}>
                                <SpaceKindBadge kind={row.spaceKind} compact />
                              </td>
                              <td className={tdClass}>—</td>
                              {showAllDepts ? (
                                <>
                                  {COST_SERVEIS_DEPARTMENTS.map((d) => (
                                    <td key={d} className={tdClass}>
                                      {d === row.dept ? fmtEuro(row.total) : '—'}
                                    </td>
                                  ))}
                                  <td className={tdClass}>
                                    <CellDash empty={(row.laborCost || 0) <= 0}>
                                      {fmtEuro(row.laborCost || 0, 2)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.managementCost <= 0}>
                                      {fmtEuro(row.managementCost, 2)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.preparationCost <= 0}>
                                      {fmtEuro(row.preparationCost, 2)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.washingCost <= 0}>
                                      {fmtEuro(row.washingCost, 2)}
                                    </CellDash>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={tdClass}>
                                    <CellDash empty={row.peopleCount <= 0}>
                                      {row.peopleCount}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.hours <= 0}>
                                      {fmtNum(row.hours)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={(row.laborCost || 0) <= 0}>
                                      {fmtEuro(row.laborCost || 0, 2)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.vehicleCount <= 0}>
                                      {row.vehicleCount}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.kmTotal <= 0}>
                                      {fmtNum(row.kmTotal, 0)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.fuelCost <= 0}>
                                      {fmtEuro(row.fuelCost, 2)}
                                    </CellDash>
                                  </td>
                                  <td className={tdClass}>
                                    <CellDash empty={row.managementCost <= 0}>
                                      {fmtEuro(row.managementCost, 2)}
                                    </CellDash>
                                  </td>
                                  {showPrepRentat ? (
                                    <>
                                      <td className={tdClass}>
                                        <CellDash empty={row.preparationCost <= 0}>
                                          {fmtEuro(row.preparationCost, 2)}
                                        </CellDash>
                                      </td>
                                      <td className={tdClass}>
                                        <CellDash empty={row.washingCost <= 0}>
                                          {fmtEuro(row.washingCost, 2)}
                                        </CellDash>
                                      </td>
                                    </>
                                  ) : null}
                                </>
                              )}
                              <td className={cn(tdClass, 'bg-cyan-50/40 font-medium')}>
                                {fmtEuro(row.total)}
                              </td>
                              <td className={cn(tdClass, 'bg-cyan-50/40')}>
                                {fmtEuro(row.billing, 2)}
                              </td>
                              <td className={cn(tdClass, 'bg-cyan-50/40')}>—</td>
                              <td className={cn(tdClass, 'bg-cyan-50/40 text-right')}>
                                <button
                                  type="button"
                                  className={cn(
                                    'font-medium hover:underline',
                                    row.origin === 'disponibilitat' &&
                                      pendingStructureCosts(row)
                                      ? 'text-amber-800'
                                      : 'text-violet-700'
                                  )}
                                  onClick={() => openEditManual(row)}
                                >
                                  {row.origin === 'disponibilitat' &&
                                  pendingStructureCosts(row)
                                    ? 'Afegir cost'
                                    : 'Editar'}
                                </button>
                              </td>
                            </tr>
                          )
                        }

                        const row = entry.row
                        const cost = costForEvent(row)
                        const pct = pctForEvent(row)
                        const detail = detailForEvent(row)
                        const laborCost = laborCostForEvent(row)
                        const management = sumOpsiaField(row, 'managementCost')
                        const preparation = sumOpsiaField(row, 'preparationCost')
                        const washing = sumOpsiaField(row, 'washingCost')

                        return (
                          <tr
                            key={row.eventId}
                            className="border-t border-slate-100 odd:bg-slate-50/40 hover:bg-cyan-50/40"
                          >
                            <td className={cn(tdClass, 'max-w-[220px] whitespace-normal')}>
                              <div className="font-medium leading-snug text-slate-900">
                                {row.eventName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {row.location || '—'}
                              </div>
                            </td>
                            <td className={cn(tdClass, 'max-w-[110px] whitespace-normal')}>
                              {row.serviceType || '—'}
                              {row.serviceType && row.serviceInCatalog === false ? (
                                <div className="text-[11px] text-amber-700">Fora de catàleg</div>
                              ) : null}
                            </td>
                            <td className={tdClass}>{row.ln || '—'}</td>
                            <td className={tdClass}>
                              <SpaceKindBadge kind={row.spaceKind} compact />
                            </td>
                            <td className={tdClass}>{row.numPax || '—'}</td>
                            {showAllDepts ? (
                              <>
                                {COST_SERVEIS_DEPARTMENTS.map((d) => (
                                  <td key={d} className={tdClass}>
                                    {fmtEuro(row.byDepartment?.[d] ?? 0)}
                                  </td>
                                ))}
                                <td className={tdClass}>
                                  <CellDash empty={laborCost <= 0}>
                                    {fmtEuro(laborCost, 2)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={management <= 0}>
                                    {fmtEuro(management, 2)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={preparation <= 0}>
                                    {fmtEuro(preparation, 2)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={washing <= 0}>
                                    {fmtEuro(washing, 2)}
                                  </CellDash>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className={tdClass}>
                                  <CellDash empty={detail.peopleCount <= 0}>
                                    {detail.peopleCount}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={detail.personHours <= 0}>
                                    {fmtNum(detail.personHours)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={laborCost <= 0}>
                                    {fmtEuro(laborCost, 2)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={detail.vehicleCount <= 0}>
                                    {detail.vehicleCount}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={detail.kmTotal <= 0}>
                                    {fmtNum(detail.kmTotal, 0)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={detail.fuelCost <= 0}>
                                    {fmtEuro(detail.fuelCost, 2)}
                                  </CellDash>
                                </td>
                                <td className={tdClass}>
                                  <CellDash empty={management <= 0}>
                                    {fmtEuro(management, 2)}
                                  </CellDash>
                                </td>
                                {showPrepRentat ? (
                                  <>
                                    <td className={tdClass}>
                                      <CellDash empty={preparation <= 0}>
                                        {fmtEuro(preparation, 2)}
                                      </CellDash>
                                    </td>
                                    <td className={tdClass}>
                                      <CellDash empty={washing <= 0}>
                                        {fmtEuro(washing, 2)}
                                      </CellDash>
                                    </td>
                                  </>
                                ) : null}
                              </>
                            )}
                            <td className={cn(tdClass, 'bg-cyan-50/40 font-medium')}>
                              {fmtEuro(cost)}
                            </td>
                            <td className={cn(tdClass, 'bg-cyan-50/40')}>
                              {fmtEuro(row.billing, 2)}
                            </td>
                            <td className={cn(tdClass, 'bg-cyan-50/40')}>
                              {pct != null ? `${(pct * 100).toFixed(2)}%` : '—'}
                            </td>
                            <td className={cn(tdClass, 'bg-cyan-50/40 text-right')}>
                              <Link
                                href={edicioHref(row.eventId)}
                                className="font-medium text-cyan-700 hover:underline"
                              >
                                Obrir
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <ManualServiceDialog
        open={Boolean(manualForm)}
        form={manualForm}
        saving={savingManual}
        message={manualMsg}
        canChooseDept={canChoose}
        config={serviceConfig}
        onChange={setManualForm}
        onClose={() => setManualForm(null)}
        onSave={() => void saveManual()}
        onDelete={
          manualForm?.id
            ? () => {
                const id = manualForm.id!
                setManualForm(null)
                void deleteManual(id)
              }
            : undefined
        }
      />
    </section>
  )
}

function ManualServiceDialog({
  open,
  form,
  saving,
  message,
  canChooseDept,
  config,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  form: ManualFormState | null
  saving: boolean
  message: string
  canChooseDept: boolean
  config: ServiceCostConfig | null
  onChange: Dispatch<SetStateAction<ManualFormState | null>>
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  const [estimating, setEstimating] = useState(false)
  const [estimateMsg, setEstimateMsg] = useState('')

  const hourlyRate = form
    ? Math.max(0, Number(config?.hourlyRates?.[form.dept]) || 18)
    : 18

  useEffect(() => {
    if (!open || !form?.location?.trim()) {
      setEstimateMsg('')
      return
    }

    const location = form.location.trim()
    const dept = form.dept
    const vehicleType = form.vehicleType
    const vehicleCount = Math.max(1, form.vehicleCount || 1)

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setEstimating(true)
      setEstimateMsg('')
      try {
        const res = await fetch('/api/cost-serveis/manual-services/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dept,
            location,
            vehicleType,
            vehicleCount,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Error estimant')
        if (cancelled) return
        const estimate = json.estimate || {}
        onChange((prev) => {
          if (!prev) return prev
          const rate = Math.max(0, Number(config?.hourlyRates?.[prev.dept]) || 18)
          return {
            ...prev,
            kmTotal: Number(estimate.kmTotal) || 0,
            fuelCost: Number(estimate.fuelCost) || 0,
            managementCost: Math.round(prev.managementHours * rate * 100) / 100,
            preparationCost: Math.round(prev.preparationHours * rate * 100) / 100,
            washingCost: Math.round(prev.washingHours * rate * 100) / 100,
          }
        })
        if (!estimate.kmTotal) {
          setEstimateMsg('No s’han pogut obtenir km (revisa ubicació / sortida config).')
        } else {
          setEstimateMsg(
            estimate.source === 'cache'
              ? 'Km des de taula de distàncies.'
              : 'Km calculats i desats a la taula.'
          )
        }
      } catch (e) {
        if (!cancelled) {
          setEstimateMsg(e instanceof Error ? e.message : 'Error estimant km')
        }
      } finally {
        if (!cancelled) setEstimating(false)
      }
    }, 450)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    open,
    form?.location,
    form?.dept,
    form?.vehicleType,
    form?.vehicleCount,
    config,
    onChange,
  ])

  if (!form) return null

  const patch = (p: Partial<ManualFormState>) => {
    onChange((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...p }
      if (
        p.managementHours != null ||
        p.preparationHours != null ||
        p.washingHours != null ||
        p.dept != null
      ) {
        const rate = Math.max(0, Number(config?.hourlyRates?.[next.dept]) || 18)
        next.managementCost =
          Math.round((next.managementHours || 0) * rate * 100) / 100
        next.preparationCost =
          Math.round((next.preparationHours || 0) * rate * 100) / 100
        next.washingCost =
          Math.round((next.washingHours || 0) * rate * 100) / 100
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.id
              ? form.origin === 'disponibilitat'
                ? 'Editar línia de Disponibilitat'
                : 'Editar servei manual'
              : 'Nou servei manual'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          Gestió / preparació / rentat: hores × {fmtEuro(hourlyRate, 2)}/h (config). Es resten
          dels pots. Km i combustible es calculen sols (cache → Google Maps).
        </p>
        {form.origin === 'disponibilitat' && pendingStructureCosts(form) ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Encara no hi ha hores de gestió/preparació. Omple-les si cal restar cost dels pots.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Data
            <Input
              type="date"
              className="mt-1"
              value={form.eventDate}
              onChange={(e) => patch({ eventDate: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Departament (pots)
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
              value={form.dept}
              disabled={!canChooseDept}
              onChange={(e) => patch({ dept: e.target.value as CostServeisDepartment })}
            >
              {COST_SERVEIS_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {COST_SERVEIS_DEPT_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Nom (ex. ATMETLLER)
            <Input
              className="mt-1"
              value={form.eventName}
              onChange={(e) => patch({ eventName: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-600">
            LN
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
              value={
                (() => {
                  const name = normalizeManualLnName(form.ln)
                  return MANUAL_LN_OPTIONS.some((o) => o.value === name)
                    ? name
                    : form.ln
                      ? '__custom__'
                      : ''
                })()
              }
              onChange={(e) => {
                const v = e.target.value
                if (v === '__custom__') {
                  patch({ ln: '' })
                  return
                }
                patch({ ln: normalizeManualLnName(v) })
              }}
            >
              <option value="">Selecciona LN</option>
              {MANUAL_LN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {'code' in o && o.code ? `${o.label} (${o.code})` : o.label}
                </option>
              ))}
              <option value="__custom__">Altres (escriure)…</option>
            </select>
            {!MANUAL_LN_OPTIONS.some((o) => o.value === normalizeManualLnName(form.ln)) ? (
              <Input
                className="mt-1"
                placeholder="Nom LN (ex. Precuinats)…"
                value={form.ln}
                onChange={(e) => patch({ ln: e.target.value })}
              />
            ) : null}
          </label>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span>Ubicació</span>
              {form.locationOther ? (
                <button
                  type="button"
                  className="font-medium text-cyan-700 hover:underline"
                  onClick={() =>
                    patch({ locationOther: false, location: '', fincaId: null })
                  }
                >
                  Cercar finca
                </button>
              ) : null}
            </div>
            {form.locationOther ? (
              <Input
                value={form.location}
                placeholder="Destinació lliure (Altres)"
                onChange={(e) => patch({ location: e.target.value, fincaId: null })}
              />
            ) : (
              <SearchFincaInput
                value={form.location}
                allowOther
                otherLabel="Altres…"
                placeholder="Cerca finca (mín. 2 lletres)…"
                onChange={(val) => {
                  onChange((prev) =>
                    prev
                      ? {
                          ...prev,
                          location: val,
                          fincaId: val.trim() ? prev.fincaId : null,
                        }
                      : prev
                  )
                }}
                onSelectFinca={(finca) => {
                  onChange((prev) => {
                    if (!prev) return prev
                    if (!finca) return { ...prev, fincaId: null }
                    return {
                      ...prev,
                      locationOther: false,
                      fincaId: finca.id,
                    }
                  })
                }}
                onSelectOther={() =>
                  patch({
                    locationOther: true,
                    fincaId: null,
                    location: '',
                  })
                }
              />
            )}
          </div>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Tipus de servei
            <Input
              className="mt-1"
              value={form.serviceType}
              onChange={(e) => patch({ serviceType: e.target.value })}
            />
          </label>
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-slate-600">
            Personal
            <Input
              type="number"
              className="mt-1"
              value={form.peopleCount}
              onChange={(e) => patch({ peopleCount: Number(e.target.value) || 0 })}
            />
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Cost conductor ≈{' '}
              {fmtEuro(
                Math.round(
                  (form.peopleCount || 0) * (form.hours || 0) * hourlyRate * 100
                ) / 100,
                2
              )}
            </span>
          </label>
          <label className="text-xs text-slate-600">
            Hores (operatives)
            <Input
              type="number"
              step="0.25"
              className="mt-1"
              value={form.hours}
              onChange={(e) => patch({ hours: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-xs text-slate-600">
            Núm. vehicles
            <Input
              type="number"
              className="mt-1"
              value={form.vehicleCount}
              onChange={(e) => patch({ vehicleCount: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2 lg:col-span-2">
            Tipus de vehicle
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
              value={form.vehicleType}
              onChange={(e) => {
                const vehicleType = e.target.value
                patch({
                  vehicleType,
                  vehicleCount: form.vehicleCount > 0 ? form.vehicleCount : vehicleType ? 1 : 0,
                })
              }}
            >
              <option value="">Sense vehicle</option>
              {TRANSPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Km (auto)
            <Input type="number" className="mt-1 bg-slate-100" value={form.kmTotal} readOnly />
            <span className="mt-0.5 block text-[11px] text-slate-500">
              {estimating
                ? 'Calculant…'
                : form.vehicleType
                  ? TRANSPORT_TYPE_LABELS[form.vehicleType] || form.vehicleType
                  : 'Tria tipus per combustible'}
            </span>
          </label>
        </div>
        {estimateMsg ? (
          <p className="text-[11px] text-slate-500">{estimateMsg}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-700">
            Gestió (h) · resta pot
            <Input
              type="number"
              step="0.25"
              className="mt-1"
              value={form.managementHours}
              onChange={(e) => patch({ managementHours: Number(e.target.value) || 0 })}
            />
            <span className="mt-0.5 block text-[11px] text-slate-500">
              = {fmtEuro(form.managementCost, 2)}
            </span>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Preparació (h) · resta pot
            <Input
              type="number"
              step="0.25"
              className="mt-1"
              value={form.preparationHours}
              onChange={(e) => patch({ preparationHours: Number(e.target.value) || 0 })}
            />
            <span className="mt-0.5 block text-[11px] text-slate-500">
              = {fmtEuro(form.preparationCost, 2)}
            </span>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Rentat (h) · resta pot
            <Input
              type="number"
              step="0.25"
              className="mt-1"
              value={form.washingHours}
              onChange={(e) => patch({ washingHours: Number(e.target.value) || 0 })}
            />
            <span className="mt-0.5 block text-[11px] text-slate-500">
              = {fmtEuro(form.washingCost, 2)}
            </span>
          </label>
          <label className="text-xs text-slate-600">
            Combustible (€) · no resta
            <Input
              type="number"
              step="0.01"
              className="mt-1 bg-slate-100"
              value={form.fuelCost}
              readOnly
            />
          </label>
        </div>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {onDelete ? (
              <Button type="button" variant="ghost" className="text-red-600" onClick={onDelete}>
                Eliminar
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel·lar
            </Button>
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? 'Desant…' : 'Desar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

