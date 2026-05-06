'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataSourceLegend } from '@/components/informes/DataSourceLegend'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { toast } from '@/components/ui/use-toast'
import { loadXlsx } from '@/lib/loadXlsx'
import { INFORMES_DOMAINS } from '@/lib/informes/domains'
import type { TransportsOverview } from '@/lib/informes/transportsOverview'
import { TransportsInformesVisualCharts } from '@/components/informes/TransportsInformesVisualCharts'

const TRANSPORTS_META = INFORMES_DOMAINS.find((domain) => domain.id === 'transports')!

type ExportSnap = {
  tab: 'kpis' | 'custom'
  data: TransportsOverview | null
  loading: boolean
}

function currentYear() {
  return new Date().getFullYear()
}

function formatKm(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(value)
}

export function TransportsInformesPanel() {
  const [tab, setTab] = useState<'kpis' | 'custom'>('kpis')
  const [kpiYear, setKpiYear] = useState(String(currentYear()))
  const [kpiData, setKpiData] = useState<TransportsOverview | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [kpiError, setKpiError] = useState<string | null>(null)

  const [customYear, setCustomYear] = useState(String(currentYear()))
  const [customMonth, setCustomMonth] = useState('')
  const [customPlate, setCustomPlate] = useState('')
  const [customConductor, setCustomConductor] = useState('')
  const [customVehicleType, setCustomVehicleType] = useState('')
  const [customEventQuery, setCustomEventQuery] = useState('')
  const [customData, setCustomData] = useState<TransportsOverview | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customOptions, setCustomOptions] = useState<TransportsOverview['filterOptions'] | null>(null)
  const [chartMountReady, setChartMountReady] = useState(false)

  useEffect(() => {
    setChartMountReady(true)
  }, [])

  const loadKpis = useCallback(async () => {
    setKpiLoading(true)
    setKpiError(null)
    try {
      const params = new URLSearchParams()
      params.set('year', kpiYear)
      const res = await fetch(`/api/reports/transports/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setKpiData((await res.json()) as TransportsOverview)
    } catch (error: unknown) {
      setKpiData(null)
      setKpiError(error instanceof Error ? error.message : String(error))
    } finally {
      setKpiLoading(false)
    }
  }, [kpiYear])

  useEffect(() => {
    void loadKpis()
  }, [loadKpis])

  useEffect(() => {
    setCustomData(null)
  }, [customYear, customMonth, customPlate, customConductor, customVehicleType, customEventQuery])

  useEffect(() => {
    if (tab !== 'custom') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/reports/transports/filter-options?year=${encodeURIComponent(customYear)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as { filterOptions?: TransportsOverview['filterOptions'] }
        if (!cancelled) setCustomOptions(json.filterOptions ?? null)
      } catch {
        if (!cancelled) setCustomOptions(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, customYear])

  const runCustomReport = useCallback(async () => {
    setCustomLoading(true)
    setCustomError(null)
    try {
      const params = new URLSearchParams()
      params.set('mode', 'custom')
      params.set('year', customYear)
      if (customMonth) params.set('month', customMonth)
      if (customPlate) params.set('plate', customPlate)
      if (customConductor) params.set('conductor', customConductor)
      if (customVehicleType) params.set('vehicleType', customVehicleType)
      if (customEventQuery.trim()) params.set('eventQuery', customEventQuery.trim())
      const res = await fetch(`/api/reports/transports/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setCustomData((await res.json()) as TransportsOverview)
      setCustomReady(true)
    } catch (error: unknown) {
      setCustomData(null)
      setCustomReady(false)
      setCustomError(error instanceof Error ? error.message : String(error))
    } finally {
      setCustomLoading(false)
    }
  }, [customYear, customMonth, customPlate, customConductor, customVehicleType, customEventQuery])

  const exportSnapRef = useRef<ExportSnap>({
    tab: 'kpis',
    data: null,
    loading: true,
  })

  exportSnapRef.current = {
    tab,
    data: tab === 'kpis' ? kpiData : customData,
    loading: tab === 'kpis' ? kpiLoading : customLoading,
  }

  const handleExportXlsx = useCallback(async () => {
    const snap = exportSnapRef.current
    if (snap.loading || !snap.data) return

    try {
      const XLSX = await loadXlsx()
      const wb = XLSX.utils.book_new()

      const summaryRows = snap.data.kpis.map((kpi) => ({
        KPI: kpi.label,
        Valor: kpi.value,
        Context: kpi.hint || '',
      }))
      const criticalRows = snap.data.criticalVehicles.map((row) => ({
        Matricula: row.plate,
        Tipus: row.type,
        Conductor: row.driverName,
        KmActuals: row.latestKm ?? '',
        Revisio: row.reviewStatus,
        ITV: row.itvStatus,
        Disponibilitat: row.availability,
      }))
      const assignmentRows = snap.data.assignments.map((row) => ({
        Dia: row.day,
        Event: row.eventName,
        Codi: row.eventCode,
        Ubicacio: row.location,
        Departament: row.department,
        Conductor: row.driverName,
        Matricula: row.plate,
        Vehicle: row.vehicleType,
        Inici: row.startTime,
        Arribada: row.arrivalTime,
        Fi: row.endTime,
        Estat: row.status,
        Pax: row.pax,
      }))

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'KPIs')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(criticalRows), 'Critics')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assignmentRows), 'Assignacions')
      XLSX.writeFile(
        wb,
        `informes-transports-${snap.tab === 'custom' ? 'mida' : 'kpis'}-${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      toast({
        title: 'Informe Excel descarregat',
        description: snap.tab === 'custom' ? 'Transports · Informe a mida' : 'Transports · KPIs',
      })
    } catch (error: unknown) {
      toast({
        title: 'Error generant Excel',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    }
  }, [])

  const exportItems = useMemo(
    () => [
      {
        label: tab === 'custom' ? 'Excel (.xlsx) — vista A mida' : 'Excel (.xlsx) — vista KPIs',
        onClick: () => void handleExportXlsx(),
        disabled: (tab === 'kpis' ? kpiLoading : customLoading) || !(tab === 'kpis' ? kpiData : customData),
      },
    ],
    [tab, handleExportXlsx, kpiLoading, customLoading, kpiData, customData]
  )

  useRegisterModuleExportMenu(exportItems)

  const activeData = tab === 'kpis' ? kpiData : customData
  const activeError = tab === 'kpis' ? kpiError : customError
  const activeLoading = tab === 'kpis' ? kpiLoading : customLoading

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('kpis')}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            tab === 'kpis'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
              : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          KPIs
        </button>
        <button
          type="button"
          onClick={() => setTab('custom')}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            tab === 'custom'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
              : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          A mida
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Transports</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Quadre de comandament operatiu del parc: revisions, ITV, assignacions, conductors i quilometratge mensual.
            </p>
          </div>
          <DataSourceLegend sources={TRANSPORTS_META.sources} />
        </div>
      </div>

      {tab === 'kpis' ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="kpi-year">Any</Label>
              <Select value={kpiYear} onValueChange={setKpiYear}>
                <SelectTrigger id="kpi-year">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear() - 1, currentYear(), currentYear() + 1].map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="custom-year">Any</Label>
              <Select value={customYear} onValueChange={setCustomYear}>
                <SelectTrigger id="custom-year">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear() - 1, currentYear(), currentYear() + 1].map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-month">Mes</Label>
              <Select value={customMonth || '__all__'} onValueChange={(value) => setCustomMonth(value === '__all__' ? '' : value)}>
                <SelectTrigger id="custom-month">
                  <SelectValue placeholder="Tots els mesos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.months || []).map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-plate">Vehicle</Label>
              <Select value={customPlate || '__all__'} onValueChange={(value) => setCustomPlate(value === '__all__' ? '' : value)}>
                <SelectTrigger id="custom-plate">
                  <SelectValue placeholder="Tots els vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.vehicles || []).map((vehicle) => (
                    <SelectItem key={vehicle.value} value={vehicle.value}>
                      {vehicle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-driver">Conductor</Label>
              <Select
                value={customConductor || '__all__'}
                onValueChange={(value) => setCustomConductor(value === '__all__' ? '' : value)}
              >
                <SelectTrigger id="custom-driver">
                  <SelectValue placeholder="Tots els conductors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.drivers || []).map((driver) => (
                    <SelectItem key={driver.value} value={driver.value}>
                      {driver.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-type">Tipus vehicle</Label>
              <Select
                value={customVehicleType || '__all__'}
                onValueChange={(value) => setCustomVehicleType(value === '__all__' ? '' : value)}
              >
                <SelectTrigger id="custom-type">
                  <SelectValue placeholder="Tots els tipus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.vehicleTypes || []).map((vehicleType) => (
                    <SelectItem key={vehicleType.value} value={vehicleType.value}>
                      {vehicleType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-event">Event / ubicacio</Label>
              <Input
                id="custom-event"
                value={customEventQuery}
                onChange={(event) => setCustomEventQuery(event.target.value)}
                placeholder="Codi, event o ubicacio"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => void runCustomReport()} disabled={customLoading}>
              {customLoading ? 'Generant...' : 'Generar informe'}
            </Button>
          </div>
        </div>
      )}

      {activeError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {activeError}
        </div>
      ) : null}

      {activeLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Carregant informe de transports...
        </div>
      ) : null}

      {!activeLoading && activeData ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activeData.kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(kpi.value)}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">{kpi.hint || '—'}</p>
              </div>
            ))}
          </div>

          <TransportsInformesVisualCharts data={activeData} chartMountReady={chartMountReady} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">Vehicles critics</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Revisio, ITV o documentacio amb risc operatiu.
              </p>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricula</TableHead>
                      <TableHead>Tipus</TableHead>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Km</TableHead>
                      <TableHead>Revisio</TableHead>
                      <TableHead>ITV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeData.criticalVehicles.length ? (
                      activeData.criticalVehicles.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.plate}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell>{row.driverName}</TableCell>
                          <TableCell>{formatKm(row.latestKm)}</TableCell>
                          <TableCell>{row.reviewStatus}</TableCell>
                          <TableCell>{row.itvStatus}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                          Cap vehicle critic al periode.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">Conductors i assignacions</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Resum dels perfils amb mes activitat registrada.
              </p>
              <div className="mt-4 space-y-2">
                {activeData.topDrivers.length ? (
                  activeData.topDrivers.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.assignments} assignacions · {row.vehicles} vehicles
                        </p>
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        Top
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No hi ha conductors amb assignacions dins dels filtres actuals.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">
              {tab === 'custom' ? 'Detall d assignacions filtrades' : 'Detall d assignacions de l any'}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Vehicle, conductor, horaris i esdeveniments on ha intervingut cada transport.
            </p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Ubicacio</TableHead>
                    <TableHead>Conductor</TableHead>
                    <TableHead>Matricula</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Dept.</TableHead>
                    <TableHead>Inici</TableHead>
                    <TableHead>Arribada</TableHead>
                    <TableHead>Fi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.assignments.length ? (
                    activeData.assignments.map((row, index) => (
                      <TableRow key={`${row.eventCode}-${row.plate}-${row.driverName}-${index}`}>
                        <TableCell>{row.day || '-'}</TableCell>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <p className="font-medium text-foreground">{row.eventName || '-'}</p>
                            <p className="text-[11px] text-muted-foreground">{row.eventCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>{row.location || '-'}</TableCell>
                        <TableCell>{row.driverName || 'Sense conductor'}</TableCell>
                        <TableCell>{row.plate || '-'}</TableCell>
                        <TableCell>{row.vehicleType || '-'}</TableCell>
                        <TableCell>{row.department}</TableCell>
                        <TableCell>{row.startTime || '-'}</TableCell>
                        <TableCell>{row.arrivalTime || '-'}</TableCell>
                        <TableCell>{row.endTime || '-'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                        No hi ha assignacions que compleixin aquests filtres.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
