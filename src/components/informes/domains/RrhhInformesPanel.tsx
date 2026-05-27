'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INFORMES_DOMAINS } from '@/lib/informes/domains'
import { DataSourceLegend } from '../DataSourceLegend'
import { InformesProductFilterCombobox } from '../InformesProductFilterCombobox'
import { RrhhInformesVisualCharts } from '../RrhhInformesVisualCharts'
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
import { isDeliveryFocusedRrhhReport, type RrhhRobaOverview } from '@/lib/informes/rrhhOverview'
import { deriveRrhhSignals } from '@/lib/informes/rrhhSignals'
import {
  exportRrhhRobaInformePdf,
  exportRrhhRobaInformeXlsx,
  informesExportFilename,
} from '@/lib/informes/informesExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const RRHH_META = INFORMES_DOMAINS.find((d) => d.id === 'rrhh')!
const RRHH_STAGE_FILTER_OPTIONS = [
  { value: 'submitted', label: 'Sol·licituds' },
  { value: 'sent_to_rrhh', label: 'Preparació' },
  { value: 'prepared', label: 'Recepcions' },
  {
    value: 'ready_for_worker_delivery,picked_up,fulfilled,receipt_confirmed',
    label: 'Entregues',
  },
  {
    value: 'fulfilled,receipt_confirmed',
    label: 'Tancades',
  },
  { value: 'cancelled', label: 'Cancel·lades' },
] as const

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultCustomRange(): { from: string; to: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return { from: toYmd(start), to: toYmd(end) }
}

/** Període «últims N dies» alineat amb el filtre de data de creació (KPIs). */
function periodRangeLabelRolling(periodDays: number): string {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - periodDays)
  const fmt = (d: Date) =>
    d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function overviewPeriodLabel(d: RrhhRobaOverview): string {
  const ctx = d.reportContext
  if (ctx?.kind === 'range' && ctx.dateFrom && ctx.dateTo) {
    const fmt = (ymd: string) => {
      const [y, m, day] = ymd.split('-').map(Number)
      return new Date(y, m - 1, day).toLocaleDateString('ca-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
    return `${fmt(ctx.dateFrom)} – ${fmt(ctx.dateTo)}`
  }
  return periodRangeLabelRolling(d.periodDays)
}

type ExportMenuSnap = {
  tab: 'kpis' | 'custom'
  kpiData: RrhhRobaOverview | null
  customData: RrhhRobaOverview | null
  customReady: boolean
  kpiLoading: boolean
  customLoading: boolean
}

/** Resol el payload en el moment del clic (evita handlers antics al menú de la impressora). */
function resolveExportTarget(s: ExportMenuSnap): {
  payload: RrhhRobaOverview | null
  blocked: boolean
} {
  const payload = s.tab === 'kpis' ? s.kpiData : s.customData
  const blocked =
    !payload ||
    (s.tab === 'kpis' && s.kpiLoading) ||
    (s.tab === 'custom' && (!s.customReady || s.customLoading))
  return { payload, blocked }
}

function signalBorderClass(tone: string): string {
  switch (tone) {
    case 'critical':
      return 'border-l-red-500 bg-red-50/50 dark:bg-red-950/25'
    case 'attention':
      return 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
    case 'positive':
      return 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
    default:
      return 'border-l-slate-400 bg-muted/30'
  }
}

export function RrhhInformesPanel() {
  const [tab, setTab] = useState<'kpis' | 'custom'>('kpis')
  const [days, setDays] = useState('30')
  const [kpiData, setKpiData] = useState<RrhhRobaOverview | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [kpiError, setKpiError] = useState<string | null>(null)

  const defRange = useMemo(() => defaultCustomRange(), [])
  const [customDateFrom, setCustomDateFrom] = useState(defRange.from)
  const [customDateTo, setCustomDateTo] = useState(defRange.to)
  const [customDept, setCustomDept] = useState('')
  const [customStatus, setCustomStatus] = useState('')
  const [customProductId, setCustomProductId] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([])
  const [productOptions, setProductOptions] = useState<{ id: string; label: string }[]>([])
  const [customData, setCustomData] = useState<RrhhRobaOverview | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customReady, setCustomReady] = useState(false)

  /** Recharts + ResponsiveContainer fallen amb Strict Mode / hidratació si es pinta al primer render del servidor. */
  const [chartMountReady, setChartMountReady] = useState(false)
  useEffect(() => {
    setChartMountReady(true)
  }, [])

  useEffect(() => {
    setCustomReady(false)
    setCustomData(null)
  }, [customDateFrom, customDateTo, customDept, customStatus, customProductId])

  useEffect(() => {
    if (tab !== 'custom') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reports/rrhh/filter-options', { cache: 'no-store' })
        if (!res.ok) return
        const j = (await res.json()) as {
          products?: { id: string; label: string }[]
          departments?: { value: string; label: string }[]
        }
        if (!cancelled) {
          setProductOptions(j.products ?? [])
          setDepartmentOptions(j.departments ?? [])
        }
      } catch {
        /* catàleg opcional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  const loadKpi = useCallback(async () => {
    setKpiLoading(true)
    setKpiError(null)
    try {
      const res = await fetch(`/api/reports/rrhh/overview?days=${encodeURIComponent(days)}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || res.statusText)
      }
      const json = (await res.json()) as RrhhRobaOverview
      setKpiData(json)
    } catch (e: unknown) {
      setKpiData(null)
      setKpiError(e instanceof Error ? e.message : String(e))
    } finally {
      setKpiLoading(false)
    }
  }, [days])

  useEffect(() => {
    void loadKpi()
  }, [loadKpi])

  const runCustomReport = useCallback(async () => {
    setCustomLoading(true)
    setCustomError(null)
    try {
      const from = new Date(`${customDateFrom}T00:00:00`)
      const to = new Date(`${customDateTo}T23:59:59.999`)
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
        throw new Error('Dates no vàlides.')
      }
      if (to.getTime() < from.getTime()) {
        throw new Error('La data final ha de ser posterior o igual a l’inicial.')
      }
      const maxMs = 366 * 86_400_000
      if (to.getTime() - from.getTime() > maxMs) {
        throw new Error('El rang màxim és d’un any.')
      }
      const params = new URLSearchParams()
      params.set('fromMs', String(from.getTime()))
      params.set('toMs', String(to.getTime()))
      params.set('dateFrom', customDateFrom)
      params.set('dateTo', customDateTo)
      if (customDept.trim()) params.set('department', customDept.trim())
      if (customStatus.trim()) {
        params.set('status', customStatus.trim())
        const stageLabel = RRHH_STAGE_FILTER_OPTIONS.find(
          (option) => option.value === customStatus.trim()
        )?.label
        if (stageLabel) params.set('statusLabel', stageLabel)
      }
      if (customProductId.trim()) {
        params.set('productId', customProductId.trim())
        const lbl = productOptions.find((p) => p.id === customProductId.trim())?.label
        if (lbl) params.set('productLabel', lbl)
      }
      const res = await fetch(`/api/reports/rrhh/overview?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || res.statusText)
      }
      const json = (await res.json()) as RrhhRobaOverview
      setCustomData(json)
      setCustomReady(true)
    } catch (e: unknown) {
      setCustomData(null)
      setCustomReady(false)
      setCustomError(e instanceof Error ? e.message : String(e))
    } finally {
      setCustomLoading(false)
    }
  }, [
    customDateFrom,
    customDateTo,
    customDept,
    customStatus,
    customProductId,
    productOptions,
  ])

  const controlSignals = useMemo(
    () => (kpiData ? deriveRrhhSignals(kpiData) : []),
    [kpiData]
  )

  const kpiChartKey = useMemo(() => `kpi-${days}`, [days])

  const customChartKey = useMemo(
    () => `c-${customDateFrom}-${customDateTo}-${customDept}-${customStatus}-${customProductId}`,
    [customDateFrom, customDateTo, customDept, customStatus, customProductId]
  )

  const customIsDeliveryFocused = useMemo(() => {
    return customData ? isDeliveryFocusedRrhhReport(customData) : false
  }, [customData])

  const productRowsPareto = useMemo(() => {
    if (!kpiData?.topProducts.length) return []
    let acc = 0
    return kpiData.topProducts.map((r) => {
      acc += r.shareOfRequestedPct
      return { ...r, cumulativePct: Math.round(acc * 10) / 10 }
    })
  }, [kpiData])

  const deptRowsPareto = useMemo(() => {
    if (!kpiData?.topDepartments.length) return []
    let acc = 0
    return kpiData.topDepartments.map((r) => {
      acc += r.shareOfRequestedPct
      return { ...r, cumulativePct: Math.round(acc * 10) / 10 }
    })
  }, [kpiData])

  const exportPayload = tab === 'kpis' ? kpiData : customData
  const exportDisabled =
    !exportPayload ||
    (tab === 'kpis' && kpiLoading) ||
    (tab === 'custom' && (!customReady || customLoading))

  const exportSnapRef = useRef<ExportMenuSnap>({
    tab: 'kpis',
    kpiData: null,
    customData: null,
    customReady: false,
    kpiLoading: true,
    customLoading: false,
  })
  exportSnapRef.current = {
    tab,
    kpiData,
    customData,
    customReady,
    kpiLoading,
    customLoading,
  }

  const handleExportPdf = useCallback(async () => {
    const snap = exportSnapRef.current
    const { payload, blocked } = resolveExportTarget(snap)
    if (blocked || !payload) return
    const origin = snap.tab === 'custom' ? 'Informe a mida' : 'KPIs'
    const mode = snap.tab === 'custom' ? 'custom' : 'kpis'
    try {
      const base = informesExportFilename(
        snap.tab === 'custom' ? 'informes-rrhh-roba-mida' : 'informes-rrhh-roba-kpis'
      )
      await exportRrhhRobaInformePdf(payload, overviewPeriodLabel(payload), base, mode)
      toast({
        title: 'Informe PDF descarregat',
        description: `${origin} · logo Cal Blay.`,
      })
    } catch (e: unknown) {
      toast({
        title: 'Error generant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const handleExportXlsx = useCallback(async () => {
    const snap = exportSnapRef.current
    const { payload, blocked } = resolveExportTarget(snap)
    if (blocked || !payload) return
    const origin = snap.tab === 'custom' ? 'Informe a mida' : 'KPIs'
    const mode = snap.tab === 'custom' ? 'custom' : 'kpis'
    try {
      const base = informesExportFilename(
        snap.tab === 'custom' ? 'informes-rrhh-roba-mida' : 'informes-rrhh-roba-kpis'
      )
      await exportRrhhRobaInformeXlsx(payload, overviewPeriodLabel(payload), base, mode)
      toast({ title: 'Informe Excel descarregat', description: origin })
    } catch (e: unknown) {
      toast({
        title: 'Error generant Excel',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const exportMenuItems = useMemo(
    () => [
      {
        label:
          tab === 'custom'
            ? 'Informe PDF (logo) — vista «A mida»'
            : 'Informe PDF (logo) — vista KPIs',
        onClick: () => void handleExportPdf(),
        disabled: exportDisabled,
      },
      {
        label: tab === 'custom' ? 'Informe Excel — vista «A mida»' : 'Informe Excel — vista KPIs',
        onClick: () => void handleExportXlsx(),
        disabled: exportDisabled,
      },
    ],
    [exportDisabled, tab, handleExportPdf, handleExportXlsx]
  )

  useRegisterModuleExportMenu(exportMenuItems)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">RRHH · Dotació de roba</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vista de control i demanda — dades operatives de l&apos;app (sol·licituds i entregues).
          </p>
          <DataSourceLegend sources={RRHH_META.sources} className="mt-1" />
        </div>
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 w-fit">
          <button
            type="button"
            onClick={() => setTab('kpis')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'kpis'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            KPIs
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'custom'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Informe a mida
          </button>
        </div>
      </div>

      {tab === 'kpis' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Període</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dies</SelectItem>
                  <SelectItem value="30">30 dies</SelectItem>
                  <SelectItem value="90">90 dies</SelectItem>
                  <SelectItem value="180">6 mesos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {kpiLoading ? (
            <p className="text-sm text-muted-foreground">Carregant…</p>
          ) : kpiError ? (
            <p className="text-sm text-destructive">{kpiError}</p>
          ) : kpiData ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                Finestra temporal (sol·licituds creades):{' '}
                <span className="font-medium text-foreground">{overviewPeriodLabel(kpiData)}</span>
              </p>

              {controlSignals.length > 0 ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-muted/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lectura de control
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Resum automàtic amb regles fixes (no IA); revisar amb el vostre criteri de negoci.
                    </p>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {controlSignals.map((s, idx) => (
                      <li
                        key={idx}
                        className={cn(
                          'pl-4 pr-3 py-2.5 text-sm border-l-4',
                          signalBorderClass(s.tone)
                        )}
                      >
                        {s.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-3">
                  1. Sol·licituds i cobertura d’entrega
                </h3>
                <div className="rounded-xl border border-border bg-card p-4 max-w-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Volum al període
                  </p>
                  <p className="text-2xl font-semibold tabular-nums mt-1">{kpiData.totalRequests}</p>
                  <p className="text-sm text-foreground mt-2 tabular-nums">
                    Amb entrega registrada:{' '}
                    <span className="font-semibold">{kpiData.requestsWithSomeDelivery}</span>
                    {kpiData.totalRequests > 0 ? (
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        (
                        {(
                          (100 * kpiData.requestsWithSomeDelivery) /
                          kpiData.totalRequests
                        ).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}
                        % del total)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Cancel·lades al període: {kpiData.cancelledRequestsInPeriod}
                    {kpiData.totalRequests > 0
                      ? ` (${((100 * kpiData.cancelledRequestsInPeriod) / kpiData.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}%)`
                      : ''}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-3">
                  2. Flux per pestanya
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Sol·licituds
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.requestsInRequestsTab}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Pendents d&apos;enviar a RRHH</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Preparació
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.requestsInPreparationTab}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Ja enviades a RRHH</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Recepcions
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.requestsInReceptionTab}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Preparades pendent recollida</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Entregues
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.requestsInDeliveriesTab}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">En flux d&apos;entrega</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Tancades</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">{kpiData.requestsClosed}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Recepció confirmada o lliurada</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-3">
                  3. Volum i compliment (unitats)
                </h3>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="grid gap-4 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    <div className="sm:pr-4 pt-1 sm:pt-0">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        Sol·licitades
                      </p>
                      <p className="text-2xl font-semibold tabular-nums mt-1">
                        {kpiData.requestedUnitsInPeriod}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">Suma de línies al període</p>
                    </div>
                    <div className="sm:px-4 pt-4 sm:pt-0">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        Lliurades (vinculades)
                      </p>
                      <p className="text-2xl font-semibold tabular-nums mt-1">
                        {kpiData.deliveredUnitsLinked}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Totes les entregues d’aquestes sol·licituds
                      </p>
                    </div>
                    <div className="sm:pl-4 pt-4 sm:pt-0">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                        Compliment
                      </p>
                      <p className="text-2xl font-semibold tabular-nums mt-1">
                        {kpiData.pctDeliveredVsRequested != null
                          ? `${kpiData.pctDeliveredVsRequested.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`
                          : '—'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">Lliurades / sol·licitades</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-3">
                  4. Pipeline, temps i riscos
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Sense entrega (actives)
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.requestsPendingNoDelivery}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Backlog operatiu</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Dies fins 1a entrega
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.avgDaysToFirstDelivery != null
                        ? kpiData.avgDaysToFirstDelivery.toLocaleString('ca-ES', {
                            maximumFractionDigits: 1,
                          })
                        : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Mitjana (amb data d’entrega)</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Incidències recepció
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.deliveriesWithOpenDispute}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Correcció pendent</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Cancel·lades
                    </p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">
                      {kpiData.cancelledRequestsInPeriod}
                      {kpiData.totalRequests > 0 ? (
                        <span className="text-base font-normal text-muted-foreground ml-1">
                          (
                          {(
                            (100 * kpiData.cancelledRequestsInPeriod) /
                            kpiData.totalRequests
                          ).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}
                          %)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Sortida del flux</p>
                  </div>
                </div>
              </div>

              {kpiData.totalRequests > 0 ? (
                <RrhhInformesVisualCharts
                  key={kpiChartKey}
                  data={kpiData}
                  chartMountReady={chartMountReady}
                  chartKey={kpiChartKey}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Sense sol·licituds en aquest període.</p>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-3">
                  6. Concentració de demanda (Pareto)
                </h3>
                <p className="text-[11px] text-muted-foreground mb-3 max-w-2xl">
                  El % mostra la part del total d’unitats sol·licitades al període; l’acumulat ajuda a veure
                  quants articles o departaments concentren la major part de la feina.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-muted/30">
                      <p className="text-sm font-medium">Top 10 articles</p>
                      <p className="text-[11px] text-muted-foreground">Per unitats sol·licitades</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Article</TableHead>
                          <TableHead className="text-right tabular-nums">U.</TableHead>
                          <TableHead className="text-right tabular-nums text-xs">% total</TableHead>
                          <TableHead className="text-right tabular-nums text-xs">Σ %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productRowsPareto.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-muted-foreground text-sm">
                              Sense dades en el període.
                            </TableCell>
                          </TableRow>
                        ) : (
                          productRowsPareto.map((r, i) => (
                            <TableRow key={r.productId}>
                              <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                              <TableCell className="max-w-[12rem]">
                                <span className="line-clamp-2" title={r.label}>
                                  {r.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {r.quantity}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.shareOfRequestedPct.toLocaleString('ca-ES', {
                                  maximumFractionDigits: 1,
                                })}
                                %
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.cumulativePct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-muted/30">
                      <p className="text-sm font-medium">Top 10 departaments</p>
                      <p className="text-[11px] text-muted-foreground">Per unitats sol·licitades</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Departament</TableHead>
                          <TableHead className="text-right tabular-nums">Sol.</TableHead>
                          <TableHead className="text-right tabular-nums">U.</TableHead>
                          <TableHead className="text-right tabular-nums text-xs">% total</TableHead>
                          <TableHead className="text-right tabular-nums text-xs">Σ %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptRowsPareto.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-muted-foreground text-sm">
                              Sense dades en el període.
                            </TableCell>
                          </TableRow>
                        ) : (
                          deptRowsPareto.map((r, i) => (
                            <TableRow key={r.department}>
                              <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                              <TableCell className="font-medium max-w-[10rem] truncate" title={r.department}>
                                {r.department}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{r.requestCount}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.requestedUnits}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.shareOfRequestedPct.toLocaleString('ca-ES', {
                                  maximumFractionDigits: 1,
                                })}
                                %
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.cumulativePct.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                Cobertura de càlcul: fins a {kpiData.datasetScanLimit} sol·licituds més recents; si el període és
                molt llarg i el volum és alt, algunes sol·licituds antigues podrien quedar fora del recompte.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <p className="font-medium">Informe a mida</p>
              <p className="text-sm text-muted-foreground mt-1">
                Talleu per dates, departament, etapa del flux i article. A `Entregues` i `Tancades`, el tall es fa per
                data d&apos;entrega; a la resta, per data de creació de la sol·licitud.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Des de</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  disabled={customLoading}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fins a</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  disabled={customLoading}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Departament sol·licitant</Label>
                <Select
                  value={customDept || '__all__'}
                  onValueChange={(v) => setCustomDept(v === '__all__' ? '' : v)}
                  disabled={customLoading}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tots" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tots</SelectItem>
                    {departmentOptions.map((department) => (
                      <SelectItem key={department.value} value={department.value}>
                        {department.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Etapa del flux</Label>
                <Select
                  value={customStatus || '__all__'}
                  onValueChange={(v) => setCustomStatus(v === '__all__' ? '' : v)}
                  disabled={customLoading}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tots" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tots</SelectItem>
                    {RRHH_STAGE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs text-muted-foreground">Article (línia inclosa)</Label>
                <InformesProductFilterCombobox
                  options={productOptions}
                  value={customProductId}
                  onChange={setCustomProductId}
                  disabled={customLoading}
                />
              </div>
            </div>
            <Button type="button" onClick={() => void runCustomReport()} disabled={customLoading}>
              {customLoading ? 'Calculant…' : 'Generar informe'}
            </Button>
            {customError ? <p className="text-sm text-destructive">{customError}</p> : null}
          </div>

          {customReady && customData ? (
            <>
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Resum del tall</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{overviewPeriodLabel(customData)}</p>
                </div>
                {customIsDeliveryFocused ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 [&>*:nth-last-child(-n+2)]:hidden">
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Entregues</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveriesCountInScope}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Treballadors</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveryWorkersInScope}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unitats lliurades</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveryUnitsInScope}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pendents firma</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveriesPendingAck}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Confirmades</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveriesConfirmed}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Incidències</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.deliveriesWithOpenDispute}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sol·licituds</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">{customData.totalRequests}</p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tancades</p>
                      <p className="text-xl font-semibold tabular-nums mt-0.5">
                        {customData.requestsClosed}
                      </p>
                    </div>
                  </div>
                ) : null}
                {!customIsDeliveryFocused ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sol·licituds</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">{customData.totalRequests}</p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A Sol·licituds</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestsInRequestsTab}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A Preparació</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestsInPreparationTab}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A Recepcions</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestsInReceptionTab}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unitats sol·lic.</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestedUnitsInPeriod}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A Entregues</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestsInDeliveriesTab}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tancades</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.requestsClosed}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unitats lliurades</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.deliveredUnitsLinked}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Compliment</p>
                    <p className="text-xl font-semibold tabular-nums mt-0.5">
                      {customData.pctDeliveredVsRequested != null
                        ? `${customData.pctDeliveredVsRequested.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`
                        : '—'}
                    </p>
                  </div>
                  </div>
                ) : null}
                <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
                  Useu la icona impressora per exportar PDF o Excel amb criteris i logo Cal Blay. Cobertura: fins a{' '}
                  {customData.datasetScanLimit} sol·licituds més recents.
                </p>
              </div>
              {(customIsDeliveryFocused ? customData.deliveriesCountInScope > 0 : customData.totalRequests > 0) ? (
                <RrhhInformesVisualCharts
                  key={customChartKey}
                  data={customData}
                  chartMountReady={chartMountReady}
                  chartKey={customChartKey}
                  deliveryFocused={customIsDeliveryFocused}
                />
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
