'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
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
import type { AuditKpis, AuditOverview } from '@/lib/informes/auditOverview'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { loadXlsx } from '@/lib/loadXlsx'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const AuditInformesVisualCharts = dynamic(
  () =>
    import('@/components/informes/AuditInformesVisualCharts').then((module) => ({
      default: module.AuditInformesVisualCharts,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[360px] animate-pulse rounded-2xl border border-border bg-muted/25" />
    ),
  }
)

const ALL = '__all__'

function toYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultRange() {
  const dateTo = new Date()
  const dateFrom = new Date(dateTo)
  dateFrom.setDate(dateFrom.getDate() - 29)
  return { dateFrom: toYmd(dateFrom), dateTo: toYmd(dateTo) }
}

function statusLabel(status: string): string {
  if (status === 'draft') return 'Esborrany'
  if (status === 'completed') return 'Finalitzada'
  if (status === 'validated') return 'Validada'
  if (status === 'rejected') return 'Rebutjada'
  return status || '—'
}

function pct(value: number | null): string {
  return value == null ? '—' : `${value.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%`
}

function difference(current: number, previous: number, unit: 'number' | 'pp'): string {
  const delta = Math.round((current - previous) * 10) / 10
  if (delta === 0) return 'Sense canvi vs. període anterior'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString('ca-ES')} ${unit === 'pp' ? 'pp' : ''} vs. període anterior`
}

type KpiCardProps = {
  label: string
  value: string
  hint: string
  icon: typeof ClipboardCheck
  tone?: 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose'
}

const KPI_TONES = {
  indigo: 'border-indigo-200 bg-indigo-50/60 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/25',
  emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/25',
  cyan: 'border-cyan-200 bg-cyan-50/60 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/25',
  amber: 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-900 dark:bg-amber-950/25',
  rose: 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-900 dark:bg-rose-950/25',
} as const

function KpiCard({ label, value, hint, icon: Icon, tone = 'indigo' }: KpiCardProps) {
  return (
    <article className={cn('rounded-2xl border p-4 shadow-sm', KPI_TONES[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
        <span className="rounded-xl bg-background/70 p-2" aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-4 opacity-80">{hint}</p>
    </article>
  )
}

function kpiCards(kpis: AuditKpis, previous: AuditKpis): KpiCardProps[] {
  return [
    {
      label: 'Finalitzades',
      value: kpis.finalized.toLocaleString('ca-ES'),
      hint: difference(kpis.finalized, previous.finalized, 'number'),
      icon: ClipboardCheck,
      tone: 'indigo',
    },
    {
      label: 'Taxa de validació',
      value: pct(kpis.validationPct),
      hint: difference(kpis.validationPct, previous.validationPct, 'pp'),
      icon: FileCheck2,
      tone: 'emerald',
    },
    {
      label: 'Compliment mitjà',
      value: pct(kpis.avgCompliancePct),
      hint: difference(kpis.avgCompliancePct, previous.avgCompliancePct, 'pp'),
      icon: CheckCircle2,
      tone: 'amber',
    },
    {
      label: 'Qualitat d’emplenament',
      value: pct(kpis.avgCompletionPct),
      hint: difference(kpis.avgCompletionPct, previous.avgCompletionPct, 'pp'),
      icon: RefreshCw,
      tone: 'cyan',
    },
    {
      label: 'Amb incidència',
      value: `${kpis.withIncident} · ${pct(kpis.incidentPct)}`,
      hint: 'Context operatiu; no és una puntuació negativa.',
      icon: ShieldAlert,
      tone: 'amber',
    },
    {
      label: 'Desviacions sense seguiment',
      value: kpis.deviationsWithoutIncident.toLocaleString('ca-ES'),
      hint: difference(kpis.deviationsWithoutIncident, previous.deviationsWithoutIncident, 'number'),
      icon: AlertTriangle,
      tone: 'rose',
    },
  ]
}

export function AuditInformesPanel() {
  const initialRange = useMemo(() => defaultRange(), [])
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [department, setDepartment] = useState('')
  const [responsible, setResponsible] = useState('')
  const [template, setTemplate] = useState('')
  const [status, setStatus] = useState('')
  const [location, setLocation] = useState('')
  const [ln, setLn] = useState('')
  const [data, setData] = useState<AuditOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (department) params.set('department', department)
      if (responsible) params.set('responsible', responsible)
      if (template) params.set('template', template)
      if (status) params.set('status', status)
      if (location) params.set('location', location)
      if (ln) params.set('ln', ln)
      const response = await fetch(`/api/reports/audits/overview?${params.toString()}`, {
        cache: 'no-store',
        signal,
      })
      const json = (await response.json().catch(() => ({}))) as AuditOverview & { error?: string }
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`)
      setData(json)
    } catch (loadError: unknown) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setData(null)
      setError(loadError instanceof Error ? loadError.message : 'No s’ha pogut carregar l’informe.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [dateFrom, dateTo, department, responsible, template, status, location, ln])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const resetFilters = useCallback(() => {
    const range = defaultRange()
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setDepartment('')
    setResponsible('')
    setTemplate('')
    setStatus('')
    setLocation('')
    setLn('')
  }, [])

  const exportRef = useRef<{ data: AuditOverview | null; loading: boolean }>({ data: null, loading: true })
  exportRef.current = { data, loading }

  const exportXlsx = useCallback(async () => {
    const snapshot = exportRef.current
    if (!snapshot.data || snapshot.loading) return
    try {
      const XLSX = await loadXlsx()
      const workbook = XLSX.utils.book_new()
      const report = snapshot.data
      const summaryRows = [
        { KPI: 'Auditories iniciades', Valor: report.kpis.started },
        { KPI: 'Auditories finalitzades', Valor: report.kpis.finalized },
        { KPI: 'Taxa de validació (%)', Valor: report.kpis.validationPct },
        { KPI: 'Compliment mitjà (%)', Valor: report.kpis.avgCompliancePct },
        { KPI: 'Qualitat d’emplenament (%)', Valor: report.kpis.avgCompletionPct },
        { KPI: 'Auditories amb incidència', Valor: report.kpis.withIncident },
        { KPI: 'Desviacions sense seguiment', Valor: report.kpis.deviationsWithoutIncident },
      ]
      const responsibleRows = report.responsibles.map((row) => ({
        Responsable: row.name,
        Departament: row.department,
        Auditories: row.audits,
        'Participació (%)': row.sharePct,
        'Validació (%)': row.validationPct,
        'Compliment (%)': row.avgCompliancePct,
        'Emplenament (%)': row.avgCompletionPct,
        'Amb incidència': row.withIncident,
        'Seguiment desviacions (%)': row.followUpPct ?? '',
      }))
      const attentionRows = report.attention.map((row) => ({
        Data: row.eventDay,
        Esdeveniment: row.eventSummary,
        Codi: row.eventCode,
        Departament: row.department,
        Responsable: row.responsible,
        Estat: statusLabel(row.status),
        'Emplenament (%)': row.completionPct ?? '',
        'Compliment (%)': row.compliancePct ?? '',
        Desviacions: row.deviations,
        Incidència: row.hasIncident ? 'Sí' : 'No',
        Atenció: row.reasons.join(' · '),
      }))
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resum')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(responsibleRows), 'Responsables')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(attentionRows), 'Requereixen atenció')
      XLSX.writeFile(workbook, `informes-auditories-${report.period.dateFrom}-${report.period.dateTo}.xlsx`)
      toast({ title: 'Informe Excel descarregat', description: 'Auditories · resum, responsables i alertes' })
    } catch (exportError: unknown) {
      toast({
        title: 'No s’ha pogut generar l’Excel',
        description: exportError instanceof Error ? exportError.message : String(exportError),
        variant: 'destructive',
      })
    }
  }, [])

  useRegisterModuleExportMenu(
    useMemo(
      () => [
        {
          label: 'Excel (.xlsx) — informe d’auditories',
          onClick: () => void exportXlsx(),
          disabled: loading || !data,
        },
      ],
      [data, exportXlsx, loading]
    )
  )

  const cards = data ? kpiCards(data.kpis, data.previousKpis) : []
  const options = data?.filterOptions
  const hasFilters = Boolean(department || responsible || template || status || location || ln)

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[145px] flex-1 sm:flex-none">
            <Label htmlFor="audit-date-from">Des de</Label>
            <Input id="audit-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="min-w-[145px] flex-1 sm:flex-none">
            <Label htmlFor="audit-date-to">Fins a</Label>
            <Input id="audit-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <FilterSelect label="Departament" value={department} onChange={setDepartment} options={(options?.departments || []).map((value) => ({ value, label: value }))} />
          <FilterSelect label="Responsable" value={responsible} onChange={setResponsible} options={options?.responsibles || []} />
          <FilterSelect label="Plantilla" value={template} onChange={setTemplate} options={options?.templates || []} />
          <FilterSelect
            label="Estat"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'draft', label: 'Esborrany' },
              { value: 'completed', label: 'Finalitzada' },
              { value: 'validated', label: 'Validada' },
              { value: 'rejected', label: 'Rebutjada' },
            ]}
          />
          <FilterSelect label="LN" value={ln} onChange={setLn} options={(options?.lns || []).map((value) => ({ value, label: value }))} />
          <FilterSelect label="Ubicació" value={location} onChange={setLocation} options={(options?.locations || []).map((value) => ({ value, label: value }))} />
          <Button variant="outline" onClick={resetFilters} disabled={!hasFilters && dateFrom === initialRange.dateFrom && dateTo === initialRange.dateTo}>
            Restablir
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La participació indica el pes sobre les auditories realitzades, no una quota planificada.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          Carregant l’informe d’auditories…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {cards.map((card) => <KpiCard key={card.label} {...card} />)}
          </div>

          <AuditInformesVisualCharts data={data} />

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Responsables</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Activitat, validació, qualitat i seguiment. El compliment no es presenta com un rànquing aïllat.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Departament</TableHead>
                    <TableHead className="text-right">Auditories</TableHead>
                    <TableHead className="text-right">Participació</TableHead>
                    <TableHead className="text-right">Validació</TableHead>
                    <TableHead className="text-right">Compliment</TableHead>
                    <TableHead className="text-right">Emplenament</TableHead>
                    <TableHead className="text-right">Incidències</TableHead>
                    <TableHead className="text-right">Seguiment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.responsibles.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sense responsables en aquest període.</TableCell></TableRow>
                  ) : data.responsibles.map((row) => (
                    <TableRow key={`${row.department}-${row.id}`}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="capitalize">{row.department}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.audits}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.sharePct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.validationPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.validated ? pct(row.avgCompliancePct) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.avgCompletionPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.withIncident}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.followUpPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Requereixen atenció</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Auditories incompletes, pendents de validar, amb desviacions sense incidència o amb incidències obertes.
                </p>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                {data.attention.length} casos
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Esdeveniment</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Estat</TableHead>
                    <TableHead className="text-right">Emplenament</TableHead>
                    <TableHead className="text-right">Compliment</TableHead>
                    <TableHead>Atenció</TableHead>
                    <TableHead className="text-right">Detall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attention.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No hi ha casos que requereixin atenció.</TableCell></TableRow>
                  ) : data.attention.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{row.eventDay || '—'}</TableCell>
                      <TableCell>
                        <div className="max-w-[260px] truncate font-medium" title={row.eventSummary}>{row.eventSummary || 'Sense títol'}</div>
                        <div className="text-xs text-muted-foreground">{row.eventCode}</div>
                      </TableCell>
                      <TableCell>{row.responsible}</TableCell>
                      <TableCell>{statusLabel(row.status)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.completionPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.compliancePct)}</TableCell>
                      <TableCell>
                        <div className="flex max-w-[360px] flex-wrap gap-1">
                          {row.reasons.map((reason) => (
                            <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">{reason}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/menu/auditoria/valoracio/${encodeURIComponent(row.id)}`}>Veure</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}

type FilterSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const id = `audit-filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="min-w-[150px] flex-1 xl:max-w-[210px]">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={`Tot · ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tot · {label.toLowerCase()}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
