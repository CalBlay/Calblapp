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
import { MaintenanceInformesVisualCharts } from '@/components/informes/MaintenanceInformesVisualCharts'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import type { MaintenanceOverview } from '@/lib/informes/maintenanceOverview'
import { normalizeMaintenanceOverview } from '@/lib/informes/normalizeMaintenanceOverview'
import { loadXlsx } from '@/lib/loadXlsx'
import { toast } from '@/components/ui/use-toast'

type ExportSnap = {
  tab: 'kpis' | 'custom'
  data: MaintenanceOverview | null
  loading: boolean
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultCustomRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return { from: toYmd(start), to: toYmd(end) }
}

function formatMinutes(minutes: number) {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleString('ca-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MaintenanceInformesPanel() {
  const [tab, setTab] = useState<'kpis' | 'custom'>('kpis')
  const [days, setDays] = useState('30')
  const [kpiData, setKpiData] = useState<MaintenanceOverview | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [kpiError, setKpiError] = useState<string | null>(null)

  const defRange = useMemo(() => defaultCustomRange(), [])
  const [customDateFrom, setCustomDateFrom] = useState(defRange.from)
  const [customDateTo, setCustomDateTo] = useState(defRange.to)
  const [customStatus, setCustomStatus] = useState('')
  const [customPriority, setCustomPriority] = useState('')
  const [customCenter, setCustomCenter] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [customZone, setCustomZone] = useState('')
  const [customTicketType, setCustomTicketType] = useState('')
  const [customInterventionType, setCustomInterventionType] = useState('')
  const [customAssigneeId, setCustomAssigneeId] = useState('')
  const [customOptions, setCustomOptions] = useState<MaintenanceOverview['filterOptions'] | null>(null)
  const [customData, setCustomData] = useState<MaintenanceOverview | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [chartMountReady, setChartMountReady] = useState(false)

  useEffect(() => {
    setChartMountReady(true)
  }, [])

  const loadKpis = useCallback(async () => {
    setKpiLoading(true)
    setKpiError(null)
    try {
      const params = new URLSearchParams()
      params.set('days', days)
      const res = await fetch(`/api/reports/maintenance/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setKpiData(normalizeMaintenanceOverview((await res.json()) as MaintenanceOverview))
    } catch (error: unknown) {
      setKpiData(null)
      setKpiError(error instanceof Error ? error.message : String(error))
    } finally {
      setKpiLoading(false)
    }
  }, [days])

  useEffect(() => {
    void loadKpis()
  }, [loadKpis])

  useEffect(() => {
    setCustomData(null)
  }, [
    customDateFrom,
    customDateTo,
    customStatus,
    customPriority,
    customCenter,
    customLocation,
    customZone,
    customTicketType,
    customInterventionType,
    customAssigneeId,
  ])

  useEffect(() => {
    if (tab !== 'custom') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reports/maintenance/filter-options?days=90', {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = (await res.json()) as { filterOptions?: MaintenanceOverview['filterOptions'] }
        if (!cancelled) setCustomOptions(json.filterOptions ?? null)
      } catch {
        if (!cancelled) setCustomOptions(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  const runCustomReport = useCallback(async () => {
    setCustomLoading(true)
    setCustomError(null)
    try {
      const params = new URLSearchParams()
      params.set('mode', 'custom')
      params.set('dateFrom', customDateFrom)
      params.set('dateTo', customDateTo)
      if (customStatus) params.set('status', customStatus)
      if (customPriority) params.set('priority', customPriority)
      if (customCenter) params.set('center', customCenter)
      if (customLocation) params.set('location', customLocation)
      if (customZone) params.set('zone', customZone)
      if (customTicketType) params.set('ticketType', customTicketType)
      if (customInterventionType) params.set('interventionType', customInterventionType)
      if (customAssigneeId) {
        params.set('operatorId', customAssigneeId)
        params.set('assigneeId', customAssigneeId)
      }
      const res = await fetch(`/api/reports/maintenance/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setCustomData(normalizeMaintenanceOverview((await res.json()) as MaintenanceOverview))
    } catch (error: unknown) {
      setCustomData(null)
      setCustomError(error instanceof Error ? error.message : String(error))
    } finally {
      setCustomLoading(false)
    }
  }, [
    customDateFrom,
    customDateTo,
    customStatus,
    customPriority,
    customCenter,
    customLocation,
    customZone,
    customTicketType,
    customInterventionType,
    customAssigneeId,
  ])

  const exportSnapRef = useRef<ExportSnap>({ tab: 'kpis', data: null, loading: true })
  exportSnapRef.current = {
    tab,
    data: tab === 'kpis' ? kpiData : customData,
    loading: tab === 'kpis' ? kpiLoading : customLoading,
  }

  const handleExportXlsx = useCallback(async () => {
    const snap = exportSnapRef.current
    const data = normalizeMaintenanceOverview(snap.data)
    if (snap.loading || !data) return

    try {
      const XLSX = await loadXlsx()
      const wb = XLSX.utils.book_new()

      const kpiRows = data.kpis.map((kpi) => ({
        KPI: kpi.label,
        Valor: kpi.value,
        Context: kpi.hint || '',
      }))
      const entryRows = data.entries.map((row) => ({
        Tipus: row.kind === 'preventiu' ? 'Preventiu' : 'Ticket',
        Codi: row.code,
        Creat: row.createdAt,
        Ultim: row.lastActivityAt || '',
        Ubicacio: row.location,
        Maquina: row.machine || '—',
        Estat: row.status,
        Prioritat: row.priority,
        Categoria: row.category,
        Operaris: row.assignees,
        MinTreball: row.workMinutes,
        MinDesplacament: row.travelMinutes,
        MinTotals: row.totalMinutes,
        Externalitzat: row.kind === 'ticket' && row.externalized ? 'Si' : 'No',
      }))
      const locationRows = data.topLocations.map((row) => ({
        Ubicacio: row.location,
        Tickets: row.tickets,
        Preventius: row.preventius,
        MinTreball: row.workMinutes,
        MinDesplacament: row.travelMinutes,
        MinTotals: row.totalMinutes,
      }))

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'KPIs')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows), 'Intervencions')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locationRows), 'Ubicacions')
      XLSX.writeFile(
        wb,
        `informes-manteniment-${snap.tab === 'custom' ? 'mida' : 'kpis'}-${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      toast({
        title: 'Informe Excel descarregat',
        description:
          snap.tab === 'custom' ? 'Manteniment · Informe a mida' : 'Manteniment · KPIs',
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
        disabled:
          (tab === 'kpis' ? kpiLoading : customLoading) || !(tab === 'kpis' ? kpiData : customData),
      },
    ],
    [tab, handleExportXlsx, kpiLoading, customLoading, kpiData, customData]
  )

  useRegisterModuleExportMenu(exportItems)

  const activeData = useMemo(
    () => normalizeMaintenanceOverview(tab === 'kpis' ? kpiData : customData),
    [tab, kpiData, customData]
  )
  const activeError = tab === 'kpis' ? kpiError : customError
  const activeLoading = tab === 'kpis' ? kpiLoading : customLoading

  const selectAll = (value: string) => (value === '__all__' ? '' : value)

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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

          {tab === 'kpis' ? (
            <div className="min-w-[220px] space-y-2 xl:w-[260px]">
              <Label htmlFor="kpi-days">Període</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id="kpi-days">
                  <SelectValue placeholder="Dies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últims 7 dies</SelectItem>
                  <SelectItem value="30">Últims 30 dies</SelectItem>
                  <SelectItem value="90">Últims 90 dies</SelectItem>
                  <SelectItem value="180">Últims 180 dies</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      {tab === 'custom' ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="custom-from">Data inici</Label>
              <Input
                id="custom-from"
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-to">Data fi</Label>
              <Input
                id="custom-to"
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-status">Estat</Label>
              <Select
                value={customStatus || '__all__'}
                onValueChange={(v) => setCustomStatus(selectAll(v))}
              >
                <SelectTrigger id="custom-status">
                  <SelectValue placeholder="Tots" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.statuses || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-priority">Prioritat</Label>
              <Select
                value={customPriority || '__all__'}
                onValueChange={(v) => setCustomPriority(selectAll(v))}
              >
                <SelectTrigger id="custom-priority">
                  <SelectValue placeholder="Totes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Totes</SelectItem>
                  {(customOptions?.priorities || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-intervention-type">Gestió</Label>
              <Select
                value={customInterventionType || '__all__'}
                onValueChange={(v) => setCustomInterventionType(selectAll(v))}
              >
                <SelectTrigger id="custom-intervention-type">
                  <SelectValue placeholder="Totes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Totes</SelectItem>
                  {(customOptions?.interventionTypes || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-location">Ubicació</Label>
              <Select
                value={customLocation || '__all__'}
                onValueChange={(v) => setCustomLocation(selectAll(v))}
              >
                <SelectTrigger id="custom-location">
                  <SelectValue placeholder="Totes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Totes</SelectItem>
                  {(customOptions?.locations || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-type">Tipus</Label>
              <Select
                value={customTicketType || '__all__'}
                onValueChange={(v) => setCustomTicketType(selectAll(v))}
              >
                <SelectTrigger id="custom-type">
                  <SelectValue placeholder="Tots" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.ticketTypes || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-assignee">Operari</Label>
              <Select
                value={customAssigneeId || '__all__'}
                onValueChange={(v) => setCustomAssigneeId(selectAll(v))}
              >
                <SelectTrigger id="custom-assignee">
                  <SelectValue placeholder="Tots" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(customOptions?.assignees || []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="button" onClick={() => void runCustomReport()} disabled={customLoading}>
            {customLoading ? 'Generant…' : 'Generar informe'}
          </Button>
        </div>
      ) : null}

      {activeError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {activeError}
        </div>
      ) : null}

      {activeLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Carregant informe de manteniment...
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

          <MaintenanceInformesVisualCharts data={activeData} chartMountReady={chartMountReady} />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">Ubicacions amb més hores</h3>
              <div className="mt-4 space-y-2">
                {activeData.topLocations.length ? (
                  activeData.topLocations.map((row) => (
                    <div
                      key={row.location}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.location}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.tickets} tickets
                          {row.externalizedTickets ? ` · ${row.externalizedTickets} externalitzats` : ''}
                          {' · '}
                          {row.preventius ?? 0} preventius · treball {formatMinutes(row.workMinutes)} ·
                          desplaçament {formatMinutes(row.travelMinutes)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatMinutes(row.totalMinutes)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sense dades al període.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">Operaris assignats</h3>
              <div className="mt-4 space-y-2">
                {activeData.topAssignees.length ? (
                  activeData.topAssignees.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.tickets} tickets
                          {row.externalizedTickets ? ` · ${row.externalizedTickets} externalitzats` : ''}
                          {' · '}
                          {row.preventius ?? 0} preventius · treball {formatMinutes(row.workMinutes)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-indigo-700">
                        {formatMinutes(row.totalMinutes)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sense assignacions al període.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">
              {tab === 'custom'
                ? 'Detall d’intervencions (filtre)'
                : 'Detall d’intervencions del període'}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tickets i preventius: minuts de treball (jornada), desplaçament anada+tornada i total.
            </p>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipus</TableHead>
                    <TableHead>Codi</TableHead>
                    <TableHead>Data últim</TableHead>
                    <TableHead>Ubicació</TableHead>
                    <TableHead>Estat</TableHead>
                    <TableHead>Prioritat</TableHead>
                    <TableHead>Operaris</TableHead>
                    <TableHead>Treball</TableHead>
                    <TableHead>Desplaç.</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.entries.length > 0 ? (
                    activeData.entries.slice(0, 200).map((row) => (
                      <TableRow key={`${row.kind}-${row.id}`}>
                        <TableCell>
                          {row.kind === 'preventiu'
                            ? 'Preventiu'
                            : row.externalized
                              ? 'Ticket externalitzat'
                              : 'Ticket intern'}
                        </TableCell>
                        <TableCell className="font-medium">{row.code}</TableCell>
                        <TableCell>{formatDateTime(row.lastActivityAt)}</TableCell>
                        <TableCell>{row.location || '—'}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.priority}</TableCell>
                        <TableCell>{row.assignees}</TableCell>
                        <TableCell>{formatMinutes(row.workMinutes)}</TableCell>
                        <TableCell>{formatMinutes(row.travelMinutes)}</TableCell>
                        <TableCell>{formatMinutes(row.totalMinutes)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                        Cap intervenció al període.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {activeData.entries.length > 200 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Es mostren les primeres 200 intervencions. Exporta a Excel per veure el llistat
                complet.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
