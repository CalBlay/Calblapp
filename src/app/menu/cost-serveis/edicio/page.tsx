'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { formatDateOnly } from '@/lib/date-format'
import {
  canChooseCostDepartment,
  costDepartmentSelectOptions,
  resolveCostDepartmentFilter,
} from '@/lib/costServeis/access'
import {
  COST_SERVEIS_DEPARTMENTS,
  COST_SERVEIS_DEPT_LABELS,
  type CostServeisDepartment,
  type ServiceCostDeptSummary,
  type ServiceCostListItem,
} from '@/lib/costServeis/types'
import { parseRoleForPreparationFilters } from '@/lib/logistics/preparationFilters'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
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

function monthLabel(isoDay: string): string {
  const [y, m] = isoDay.split('-').map(Number)
  if (!y || !m) return isoDay
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('ca-ES', { month: 'long', year: 'numeric' })
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

export default function CostServeisEdicioPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const userDept = session?.user?.department
  const canChoose = canChooseCostDepartment(role, userDept)

  const [dateRange, setDateRange] = useState(defaultMonthRange)
  const [filterMode, setFilterMode] = useState<'week' | 'month' | 'year' | 'day' | 'range'>('month')
  const [deptFilter, setDeptFilter] = useState<string>('all')

  const effectiveDept = useMemo(
    () =>
      resolveCostDepartmentFilter({
        role,
        department: userDept,
        requested: deptFilter,
      }),
    [role, userDept, deptFilter]
  )

  const { data, isLoading } = useSWR(
    `/api/cost-serveis/events?from=${dateRange.start}&to=${dateRange.end}`,
    fetcher
  )
  const items = (data?.items || []) as ServiceCostListItem[]
  const missingServiceTypes = (data?.missingServiceTypes || []) as Array<{
    nom: string
    count: number
  }>

  const grouped = useMemo(() => {
    const map = new Map<string, ServiceCostListItem[]>()
    for (const row of items) {
      const key = row.eventDate.slice(0, 7)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const deptOptions = costDepartmentSelectOptions(canChoose)
  const smartRole = parseRoleForPreparationFilters(String(role || '').toLowerCase())
  const showAllDepts = effectiveDept === 'all'
  const showPrepRentat =
    showAllDepts || effectiveDept === 'logistica' || effectiveDept === 'cuina'

  const costForRow = (row: ServiceCostListItem) => {
    if (showAllDepts) return row.total
    return row.byDepartment?.[effectiveDept as CostServeisDepartment] ?? 0
  }

  const pctForRow = (row: ServiceCostListItem) => {
    const cost = costForRow(row)
    if (!row.billing || row.billing <= 0) return null
    return cost / row.billing
  }

  const detailForRow = (row: ServiceCostListItem): ServiceCostDeptSummary => {
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
    return detailForRow(row)[field]
  }

  const edicioHref = (eventId: string) => {
    if (showAllDepts) return `/menu/cost-serveis/edicio/${eventId}`
    return `/menu/cost-serveis/edicio/${eventId}?dept=${effectiveDept}`
  }

  const thClass = 'whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
  const tdClass = 'whitespace-nowrap px-2.5 py-2 text-sm text-slate-800'
  const thAccent = 'bg-cyan-50/80'
  const thMuted = 'bg-emerald-50/70'

  return (
    <section className="w-full max-w-none space-y-6 pb-12">
      <ModuleHeader
        title="Edició"
        subtitle="Desglossament operatiu per esdeveniment (com el full d’Excel)"
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
      </div>

      {!showAllDepts ? (
        <p className="text-xs text-slate-500">
          Columnes del departament{' '}
          <span className="font-medium text-slate-700">
            {COST_SERVEIS_DEPT_LABELS[effectiveDept as CostServeisDepartment]}
          </span>
          . El cost de gestió es calcularà amb dades d’OpsiaFinance (API).
        </p>
      ) : null}

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
          {' '}
          («Carregar tipus des d’Edició») per crear-los i ponderar.
          <span className="mt-1 block text-xs text-amber-800/80">
            Ex.: {missingServiceTypes.slice(0, 5).map((m) => m.nom).join(', ')}
            {missingServiceTypes.length > 5 ? '…' : ''}
          </span>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant esdeveniments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">No hi ha esdeveniments en aquest període.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([ym, rows]) => (
            <div key={ym} className="space-y-2">
              <h2 className="text-sm font-semibold capitalize text-slate-700">
                {monthLabel(`${ym}-01`)}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={cn(thClass, thMuted)}>Data</th>
                      <th className={cn(thClass, thMuted)}>Nom del servei</th>
                      <th className={cn(thClass, thMuted)}>Tipus de servei</th>
                      <th className={cn(thClass, thMuted)}>LN</th>
                      <th className={cn(thClass, thMuted)}>Pax</th>
                      {showAllDepts ? (
                        <>
                          {COST_SERVEIS_DEPARTMENTS.map((d) => (
                            <th key={d} className={cn(thClass, thMuted)}>
                              {COST_SERVEIS_DEPT_LABELS[d]}
                            </th>
                          ))}
                          <th className={cn(thClass, thMuted)} title="OpsiaFinance + fórmules">
                            Cost gestió
                          </th>
                          <th className={cn(thClass, thMuted)} title="Logística i Cuina · OpsiaFinance">
                            Cost preparació
                          </th>
                          <th className={cn(thClass, thMuted)} title="Logística i Cuina · OpsiaFinance">
                            Cost rentat
                          </th>
                        </>
                      ) : (
                        <>
                          <th
                            className={cn(thClass, thMuted)}
                            title="Treballadors del departament assignats al quadrant del servei"
                          >
                            Personal
                          </th>
                          <th
                            className={cn(thClass, thMuted)}
                            title="Suma d’hores de tots els treballadors (personal × jornada)"
                          >
                            Hores totals
                          </th>
                          <th
                            className={cn(thClass, thMuted)}
                            title="Hores totals × preu/hora del departament"
                          >
                            Cost personal
                          </th>
                          <th
                            className={cn(thClass, thMuted)}
                            title="Vehicles utilitzats al quadrant del servei"
                          >
                            Vehicles
                          </th>
                          <th className={cn(thClass, thMuted)}>Total km</th>
                          <th className={cn(thClass, thMuted)}>Combustible</th>
                          <th className={cn(thClass, thMuted)} title="OpsiaFinance + fórmules">
                            Cost gestió
                          </th>
                          {showPrepRentat ? (
                            <>
                              <th
                                className={cn(thClass, thMuted)}
                                title="Comú Logística i Cuina · OpsiaFinance + fórmules"
                              >
                                Cost preparació
                              </th>
                              <th
                                className={cn(thClass, thMuted)}
                                title="Comú Logística i Cuina · OpsiaFinance + fórmules"
                              >
                                Cost rentat
                              </th>
                            </>
                          ) : null}
                        </>
                      )}
                      <th className={cn(thClass, thAccent)}>Total cost</th>
                      <th className={cn(thClass, thAccent)}>Facturació</th>
                      <th className={cn(thClass, thAccent)}>%</th>
                      <th className={cn(thClass, thAccent)} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const cost = costForRow(row)
                      const pct = pctForRow(row)
                      const detail = detailForRow(row)
                      const management = sumOpsiaField(row, 'managementCost')
                      const preparation = sumOpsiaField(row, 'preparationCost')
                      const washing = sumOpsiaField(row, 'washingCost')

                      return (
                        <tr
                          key={row.eventId}
                          className="border-t border-slate-100 odd:bg-slate-50/40 hover:bg-cyan-50/40"
                        >
                          <td className={tdClass}>{formatDateOnly(row.eventDate)}</td>
                          <td className={cn(tdClass, 'min-w-[220px] whitespace-normal')}>
                            <div className="font-medium text-slate-900">{row.eventName}</div>
                            <div className="text-xs text-slate-500">{row.location || '—'}</div>
                          </td>
                          <td className={cn(tdClass, 'min-w-[120px] whitespace-normal')}>
                            {row.serviceType || '—'}
                            {row.serviceType && row.serviceInCatalog === false ? (
                              <div className="text-[11px] text-amber-700">Fora de catàleg</div>
                            ) : null}
                          </td>
                          <td className={tdClass}>{row.ln || '—'}</td>
                          <td className={tdClass}>{row.numPax || '—'}</td>

                          {showAllDepts ? (
                            <>
                              {COST_SERVEIS_DEPARTMENTS.map((d) => (
                                <td key={d} className={tdClass}>
                                  {fmtEuro(row.byDepartment?.[d] ?? 0)}
                                </td>
                              ))}
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
                                <CellDash empty={detail.laborCost <= 0}>
                                  {fmtEuro(detail.laborCost, 2)}
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
                          <td className={cn(tdClass, 'bg-cyan-50/40')}>{fmtEuro(row.billing, 2)}</td>
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
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
