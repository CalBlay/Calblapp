'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, ListChecks, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import {
  CorporateFilterField,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { loadXlsx } from '@/lib/loadXlsx'
import type { IncidentsOverview } from '@/lib/informes/incidentsOverview'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const ALL = '__all__'

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaultRange() {
  const dateTo = new Date()
  const dateFrom = new Date(dateTo)
  dateFrom.setDate(dateFrom.getDate() - 29)
  return { dateFrom: toYmd(dateFrom), dateTo: toYmd(dateTo) }
}

const statusLabels: Record<string, string> = {
  obert: 'Oberta',
  en_curs: 'En curs',
  resolt: 'Resoltes',
  tancat: 'Tancades',
}

const importanceLabels: Record<string, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgent: 'Urgent',
}

function delta(current: number, previous: number, suffix = '') {
  const value = Math.round((current - previous) * 10) / 10
  if (!value) return 'Sense canvi vs. període anterior'
  return `${value > 0 ? '+' : ''}${value.toLocaleString('ca-ES')}${suffix} vs. període anterior`
}

type CardProps = { label: string; value: string; hint: string; icon: typeof ListChecks; tone: string }
function KpiCard({ label, value, hint, icon: Icon, tone }: CardProps) {
  return (
    <article className={cn('rounded-2xl border p-4 shadow-sm', tone)}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p></div>
        <span className="rounded-xl bg-background/70 p-2" aria-hidden><Icon className="h-5 w-5" /></span>
      </div>
      <p className="mt-2 text-[11px] leading-4 opacity-80">{hint}</p>
    </article>
  )
}

export function IncidentsInformesPanel() {
  const initialRange = useMemo(defaultRange, [])
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [department, setDepartment] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [importance, setImportance] = useState('')
  const [smartFiltersKey, setSmartFiltersKey] = useState(0)
  const [data, setData] = useState<IncidentsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (department) params.set('department', department)
      if (category) params.set('category', category)
      if (status) params.set('status', status)
      if (importance) params.set('importance', importance)
      const response = await fetch(`/api/reports/incidents/overview?${params}`, { cache: 'no-store', signal })
      const json = (await response.json().catch(() => ({}))) as IncidentsOverview & { error?: string }
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`)
      setData(json)
    } catch (loadError: unknown) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setData(null)
      setError(loadError instanceof Error ? loadError.message : 'No s’ha pogut carregar l’informe.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [category, dateFrom, dateTo, department, importance, status])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const handleSmartFiltersChange = useCallback((filters: SmartFiltersChange) => {
    if (!filters.start || !filters.end) return
    setDateFrom(filters.start)
    setDateTo(filters.end)
  }, [])

  const resetFilters = useCallback(() => {
    const range = defaultRange()
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setDepartment('')
    setCategory('')
    setStatus('')
    setImportance('')
    setSmartFiltersKey((current) => current + 1)
  }, [])

  const exportRef = useRef(data)
  exportRef.current = data
  const exportXlsx = useCallback(async () => {
    const report = exportRef.current
    if (!report) return
    try {
      const XLSX = await loadXlsx()
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { KPI: 'Incidències', Valor: report.kpis.total },
        { KPI: 'Obertes', Valor: report.kpis.open },
        { KPI: 'En curs', Valor: report.kpis.inProgress },
        { KPI: 'Resoltes', Valor: report.kpis.resolved },
        { KPI: 'Tancades', Valor: report.kpis.closed },
        { KPI: 'Prioritat alta o urgent', Valor: report.kpis.highPriority },
        { KPI: 'Taxa de resolució (%)', Valor: report.kpis.resolutionPct },
        { KPI: 'Temps mitjà de resolució (h)', Valor: report.kpis.averageResolutionHours ?? '' },
      ]), 'Resum')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.rows.map((row) => ({
        Incidència: row.incidentNumber,
        Data: new Date(row.createdAt).toLocaleDateString('ca-ES'),
        Departament: row.department,
        Estat: statusLabels[row.status] || row.status,
        Prioritat: importanceLabels[row.importance] || row.importance,
        Tipologia: row.categoryLabel,
        Esdeveniment: row.eventTitle,
        Codi: row.eventCode,
        Ubicació: row.eventLocation,
        Creador: row.createdBy,
        Descripció: row.description,
      }))), 'Detall')
      XLSX.writeFile(workbook, `informe-incidencies-${report.period.dateFrom}-${report.period.dateTo}.xlsx`)
      toast({ title: 'Informe Excel descarregat', description: 'Incidències · resum i detall' })
    } catch (exportError: unknown) {
      toast({ title: 'No s’ha pogut generar l’Excel', description: exportError instanceof Error ? exportError.message : String(exportError), variant: 'destructive' })
    }
  }, [])

  useRegisterModuleExportMenu(useMemo(() => [{ label: 'Excel (.xlsx) — informe d’incidències', onClick: () => void exportXlsx(), disabled: loading || !data }], [data, exportXlsx, loading]))

  const cards: CardProps[] = data ? [
    { label: 'Incidències', value: data.kpis.total.toLocaleString('ca-ES'), hint: delta(data.kpis.total, data.previousKpis.total), icon: ListChecks, tone: 'border-indigo-200 bg-indigo-50/60 text-indigo-700' },
    { label: 'Obertes', value: data.kpis.open.toLocaleString('ca-ES'), hint: delta(data.kpis.open, data.previousKpis.open), icon: ShieldAlert, tone: 'border-rose-200 bg-rose-50/60 text-rose-700' },
    { label: 'En curs', value: data.kpis.inProgress.toLocaleString('ca-ES'), hint: delta(data.kpis.inProgress, data.previousKpis.inProgress), icon: RefreshCw, tone: 'border-cyan-200 bg-cyan-50/60 text-cyan-700' },
    { label: 'Resolució', value: `${data.kpis.resolutionPct.toLocaleString('ca-ES')}%`, hint: delta(data.kpis.resolutionPct, data.previousKpis.resolutionPct, ' pp '), icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50/60 text-emerald-700' },
    { label: 'Alta o urgent', value: data.kpis.highPriority.toLocaleString('ca-ES'), hint: delta(data.kpis.highPriority, data.previousKpis.highPriority), icon: AlertTriangle, tone: 'border-amber-200 bg-amber-50/60 text-amber-700' },
    { label: 'Temps resolució', value: data.kpis.averageResolutionHours == null ? '—' : `${data.kpis.averageResolutionHours.toLocaleString('ca-ES')} h`, hint: 'Mitjana de casos resolts o tancats', icon: Clock3, tone: 'border-slate-200 bg-slate-50/60 text-slate-700' },
  ] : []

  return (
    <section className="space-y-4">
      <CorporateFiltersShell
        variant="toolbar"
        showHeader={false}
        bodyClassName="items-end overflow-x-auto sm:flex-wrap"
      >
        <div className="flex w-max min-w-full items-end gap-3 sm:flex-wrap">
          <SmartFilters
            key={smartFiltersKey}
            role="Direcció"
            modeDefault="range"
            modeOptions={['week', 'month', 'year', 'range']}
            initialStart={dateFrom}
            initialEnd={dateTo}
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showImportance={false}
            showAdvanced={false}
            compact
            onChange={handleSmartFiltersChange}
          />
          {data?.scope.allDepartments ? (
            <CorporateFilterField label="Departament" htmlFor="incidents-report-department">
              <CorporateFilterSelect
                id="incidents-report-department"
                value={department || ALL}
                onChange={(event) => setDepartment(event.target.value === ALL ? '' : event.target.value)}
              >
                <option value={ALL}>Tots els departaments</option>
                {data.filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}
              </CorporateFilterSelect>
            </CorporateFilterField>
          ) : null}
          <CorporateFilterField label="Tipologia" htmlFor="incidents-report-category">
            <CorporateFilterSelect id="incidents-report-category" value={category || ALL} onChange={(event) => setCategory(event.target.value === ALL ? '' : event.target.value)}>
              <option value={ALL}>Totes les tipologies</option>
              {(data?.filterOptions.categories || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <CorporateFilterField label="Estat" htmlFor="incidents-report-status">
            <CorporateFilterSelect id="incidents-report-status" value={status || ALL} onChange={(event) => setStatus(event.target.value === ALL ? '' : event.target.value)}>
              <option value={ALL}>Tots els estats</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <CorporateFilterField label="Prioritat" htmlFor="incidents-report-importance">
            <CorporateFilterSelect id="incidents-report-importance" value={importance || ALL} onChange={(event) => setImportance(event.target.value === ALL ? '' : event.target.value)}>
              <option value={ALL}>Totes les prioritats</option>
              {Object.entries(importanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <div className="pb-0.5" title="Restablir filtres">
            <ResetFilterButton onClick={resetFilters} />
          </div>
        </div>
        <p className="basis-full text-xs text-muted-foreground">
          {data?.scope.allDepartments ? 'Vista global amb filtre per departament.' : `Informe limitat al teu departament: ${data?.scope.department || '—'}.`} El període correspon a la data de creació de la incidència.
        </p>
      </CorporateFiltersShell>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading && !data ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Carregant l’informe d’incidències…</div> : null}

      {data ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{cards.map((card) => <KpiCard key={card.label} {...card} />)}</div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SummaryTable title="Per estat" rows={data.byStatus.map((row) => ({ label: statusLabels[row.status] || row.status, value: row.count, extra: '' }))} />
          <SummaryTable title="Per tipologia" rows={data.byCategory.map((row) => ({ label: row.label, value: row.count, extra: `${row.open} pendents` }))} />
        </div>
        {data.scope.allDepartments ? <SummaryTable title="Per departament" rows={data.byDepartment.map((row) => ({ label: row.department, value: row.count, extra: `${row.open} pendents · ${row.resolutionPct}% resolució` }))} /> : null}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4"><h3 className="text-sm font-semibold">Detall d’incidències</h3><p className="mt-1 text-xs text-muted-foreground">{data.rows.length} resultats en el període seleccionat.</p></div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Incidència</TableHead><TableHead>Departament</TableHead><TableHead>Tipologia</TableHead><TableHead>Estat</TableHead><TableHead>Prioritat</TableHead><TableHead>Esdeveniment</TableHead><TableHead className="text-right">Detall</TableHead></TableRow></TableHeader>
            <TableBody>{data.rows.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sense incidències en aquest període.</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString('ca-ES')}</TableCell><TableCell className="font-medium">{row.incidentNumber || '—'}</TableCell><TableCell>{row.department || '—'}</TableCell><TableCell>{row.categoryLabel || '—'}</TableCell><TableCell>{statusLabels[row.status] || row.status}</TableCell><TableCell>{importanceLabels[row.importance] || row.importance}</TableCell><TableCell><div className="max-w-[260px] truncate" title={row.eventTitle}>{row.eventTitle || row.eventCode || '—'}</div></TableCell><TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link href={`/menu/incidents?incidentId=${encodeURIComponent(row.id)}`}>Veure</Link></Button></TableCell>
            </TableRow>)}</TableBody></Table></div>
        </section>
      </> : null}
    </section>
  )
}

function SummaryTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number; extra: string }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-4 space-y-3">{rows.length === 0 ? <p className="text-sm text-muted-foreground">Sense dades.</p> : rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><span className="whitespace-nowrap font-semibold tabular-nums">{row.value}{row.extra ? <span className="ml-2 text-xs font-normal text-muted-foreground">{row.extra}</span> : null}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</div></section>
}
