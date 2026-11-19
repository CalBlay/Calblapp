'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, ListChecks, TimerReset, Users } from 'lucide-react'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import {
  CorporateFilterField,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import type { PreparationsOverview } from '@/lib/informes/preparationsOverview'
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

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`
}

function formatCompletedAt(value: number): string {
  return new Date(value).toLocaleString('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildPrintHtml(report: PreparationsOverview): string {
  const businessLineRows = report.byBusinessLine
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.businessLine)}</td>
        <td>${row.preparationCount}</td>
        <td>${escapeHtml(formatMinutes(row.totalMinutes))}</td>
        <td>${row.totalHours.toLocaleString('ca-ES')}</td>
        <td>${row.sharePct.toLocaleString('ca-ES')}%</td>
      </tr>`
    )
    .join('')
  const summaryRows = report.summary
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.preparerName)}</td>
        <td>${escapeHtml(row.businessLine)}</td>
        <td>${row.preparationCount}</td>
        <td>${escapeHtml(formatMinutes(row.totalMinutes))}</td>
        <td>${row.totalHours.toLocaleString('ca-ES')}</td>
      </tr>`
    )
    .join('')
  const detailRows = report.details
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.preparationDate)}</td>
        <td>${escapeHtml(row.preparationTime)}</td>
        <td>${escapeHtml(row.preparerName)}</td>
        <td>${escapeHtml(row.businessLine)}</td>
        <td>${escapeHtml(row.eventCode)}</td>
        <td>${escapeHtml(row.eventName)}</td>
        <td>${escapeHtml(row.warehouseLabels.join(', '))}</td>
        <td>${escapeHtml(formatCompletedAt(row.completedAt))}</td>
        <td>${escapeHtml(formatMinutes(row.durationMinutes))}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html><html lang="ca"><head><meta charset="utf-8" />
    <title>Informe de temps de preparació</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; }
      h1 { margin: 0 0 4px; font-size: 18px; }
      h2 { margin: 18px 0 8px; font-size: 14px; }
      .meta { color: #64748b; font-size: 11px; }
      .kpis { display: flex; gap: 18px; margin: 12px 0; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 8px; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      th, td { border: 1px solid #cbd5e1; padding: 4px; text-align: left; }
      th { background: #ecfdf5; color: #14532d; }
    </style></head><body>
      <h1>Temps de preparació per preparador i línia de negoci</h1>
      <div class="meta">Departament: ${escapeHtml(report.department)} · Període: ${escapeHtml(report.period.dateFrom)} – ${escapeHtml(report.period.dateTo)}</div>
      <div class="kpis"><b>${report.kpis.totalHours.toLocaleString('ca-ES')} h totals</b><span>${report.kpis.preparationCount} preparacions</span><span>${report.kpis.preparerCount} preparadors</span></div>
      <h2>Distribució per línia de negoci</h2>
      <table><thead><tr><th>Línia de negoci</th><th>Preparacions</th><th>Temps</th><th>Hores</th><th>% del total</th></tr></thead><tbody>${businessLineRows}</tbody></table>
      <h2>Resum</h2>
      <table><thead><tr><th>Preparador</th><th>Línia de negoci</th><th>Preparacions</th><th>Temps</th><th>Hores</th></tr></thead><tbody>${summaryRows}</tbody></table>
      <h2>Detall</h2>
      <table><thead><tr><th>Data</th><th>Inici</th><th>Preparador</th><th>Línia de negoci</th><th>Codi</th><th>Esdeveniment</th><th>Magatzem</th><th>Final</th><th>Temps</th></tr></thead><tbody>${detailRows}</tbody></table>
    </body></html>`
}

type KpiCardProps = {
  label: string
  value: string
  hint: string
  icon: typeof Clock3
  tone: string
}

function KpiCard({ label, value, hint, icon: Icon, tone }: KpiCardProps) {
  return (
    <article className={cn('rounded-2xl border p-4 shadow-sm', tone)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
        <span className="rounded-xl bg-background/70 p-2" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-xs opacity-80">{hint}</p>
    </article>
  )
}

export function PreparationsInformesPanel() {
  const initialRange = useMemo(defaultRange, [])
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [department, setDepartment] = useState('Logística')
  const [preparer, setPreparer] = useState('')
  const [businessLine, setBusinessLine] = useState('')
  const [smartFiltersKey, setSmartFiltersKey] = useState(0)
  const [data, setData] = useState<PreparationsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, department })
      if (preparer) params.set('preparer', preparer)
      if (businessLine) params.set('businessLine', businessLine)
      const response = await fetch(`/api/reports/preparations/overview?${params}`, {
        cache: 'no-store',
        signal,
      })
      const json = (await response.json().catch(() => ({}))) as PreparationsOverview & { error?: string }
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`)
      setData(json)
    } catch (loadError: unknown) {
      if (signal?.aborted || (loadError instanceof Error && loadError.name === 'AbortError')) return
      setData(null)
      setError(loadError instanceof Error ? loadError.message : 'No s\'ha pogut carregar l\'informe.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [businessLine, dateFrom, dateTo, department, preparer])

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
    setDepartment('Logística')
    setPreparer('')
    setBusinessLine('')
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
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.byBusinessLine.map((row) => ({
            'Línia de negoci': row.businessLine,
            Preparacions: row.preparationCount,
            Minuts: row.totalMinutes,
            Hores: row.totalHours,
            '% del total': row.sharePct,
          }))
        ),
        'Per línia de negoci'
      )
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.summary.map((row) => ({
            Preparador: row.preparerName,
            'Línia de negoci': row.businessLine,
            Preparacions: row.preparationCount,
            Minuts: row.totalMinutes,
            Hores: row.totalHours,
          }))
        ),
        'Resum'
      )
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.details.map((row) => ({
            Data: row.preparationDate,
            'Hora inici': row.preparationTime,
            Preparador: row.preparerName,
            'Línia de negoci': row.businessLine,
            Magatzem: row.warehouseLabels.join(', '),
            Codi: row.eventCode,
            Esdeveniment: row.eventName,
            Servei: row.serviceName,
            Finalització: formatCompletedAt(row.completedAt),
            Minuts: row.durationMinutes,
            Hores: Number((row.durationMinutes / 60).toFixed(2)),
          }))
        ),
        'Detall'
      )
      XLSX.writeFile(
        workbook,
        `informe-preparacions-${report.department.toLocaleLowerCase('ca')}-${report.period.dateFrom}-${report.period.dateTo}.xlsx`
      )
      toast({ title: 'Informe Excel descarregat', description: `Preparacions · ${report.department}` })
    } catch (exportError: unknown) {
      toast({
        title: 'No s\'ha pogut generar l\'Excel',
        description: exportError instanceof Error ? exportError.message : String(exportError),
        variant: 'destructive',
      })
    }
  }, [])

  const exportPdf = useCallback(() => {
    const report = exportRef.current
    if (report) printBrandedHtmlInNewWindow(buildPrintHtml(report))
  }, [])

  const exportItems = useMemo(
    () => [
      { label: 'PDF — informe de preparacions', onClick: exportPdf, disabled: loading || !data },
      { label: 'Excel (.xlsx) — informe de preparacions', onClick: () => void exportXlsx(), disabled: loading || !data },
    ],
    [data, exportPdf, exportXlsx, loading]
  )
  useRegisterModuleExportMenu(exportItems)

  const cards: KpiCardProps[] = data ? [
    { label: 'Hores totals', value: `${data.kpis.totalHours.toLocaleString('ca-ES')} h`, hint: 'Temps acumulat del període', icon: Clock3, tone: 'border-indigo-200 bg-indigo-50/60 text-indigo-700' },
    { label: 'Preparacions', value: data.kpis.preparationCount.toLocaleString('ca-ES'), hint: 'Preparador i preparació completada', icon: ListChecks, tone: 'border-emerald-200 bg-emerald-50/60 text-emerald-700' },
    { label: 'Preparadors', value: data.kpis.preparerCount.toLocaleString('ca-ES'), hint: 'Persones amb temps registrat', icon: Users, tone: 'border-sky-200 bg-sky-50/60 text-sky-700' },
    { label: 'Temps mitjà', value: formatMinutes(data.kpis.averageMinutes), hint: 'Mitjana per preparació i persona', icon: TimerReset, tone: 'border-amber-200 bg-amber-50/60 text-amber-700' },
  ] : []

  return (
    <section className="space-y-4">
      <CorporateFiltersShell variant="toolbar" showHeader={false} bodyClassName="items-end overflow-x-auto sm:flex-wrap">
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
          <CorporateFilterField label="Departament" htmlFor="preparations-report-department">
            <CorporateFilterSelect id="preparations-report-department" value={department} onChange={(event) => setDepartment(event.target.value)}>
              {(data?.filterOptions.departments.length ? data.filterOptions.departments : ['Logística', 'Decoracions']).map((value) => <option key={value} value={value}>{value}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <CorporateFilterField label="Preparador" htmlFor="preparations-report-preparer">
            <CorporateFilterSelect id="preparations-report-preparer" value={preparer || ALL} onChange={(event) => setPreparer(event.target.value === ALL ? '' : event.target.value)}>
              <option value={ALL}>Tots els preparadors</option>
              {(data?.filterOptions.preparers || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <CorporateFilterField label="Línia de negoci" htmlFor="preparations-report-business-line">
            <CorporateFilterSelect id="preparations-report-business-line" value={businessLine || ALL} onChange={(event) => setBusinessLine(event.target.value === ALL ? '' : event.target.value)}>
              <option value={ALL}>Totes les línies</option>
              {(data?.filterOptions.businessLines || []).map((value) => <option key={value} value={value}>{value}</option>)}
            </CorporateFilterSelect>
          </CorporateFilterField>
          <div className="pb-0.5" title="Restablir filtres"><ResetFilterButton onClick={resetFilters} /></div>
        </div>
        <p className="basis-full text-xs text-muted-foreground">
          L&apos;inici és la data i hora planificades; el final, la darrera finalització del preparador en aquella preparació.
        </p>
      </CorporateFiltersShell>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading && !data ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Carregant l&apos;informe de preparacions…</div> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <KpiCard key={card.label} {...card} />)}</div>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4"><h3 className="text-sm font-semibold">Distribució per línia de negoci</h3><p className="mt-1 text-xs text-muted-foreground">Percentatge calculat sobre {formatMinutes(data.kpis.totalMinutes)} totals del període filtrat.</p></div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Línia de negoci</TableHead><TableHead className="text-right">Preparacions</TableHead><TableHead className="text-right">Temps total</TableHead><TableHead className="text-right">Hores</TableHead><TableHead className="min-w-[180px]">% del total</TableHead></TableRow></TableHeader>
              <TableBody>{data.byBusinessLine.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sense dades per calcular la distribució.</TableCell></TableRow> : data.byBusinessLine.map((row) => <TableRow key={row.businessLine}><TableCell className="font-medium">{row.businessLine}</TableCell><TableCell className="text-right tabular-nums">{row.preparationCount}</TableCell><TableCell className="text-right tabular-nums">{formatMinutes(row.totalMinutes)}</TableCell><TableCell className="text-right tabular-nums">{row.totalHours.toLocaleString('ca-ES')} h</TableCell><TableCell><div className="flex items-center gap-3"><div className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, row.sharePct))}%` }} /></div><span className="w-16 text-right font-semibold tabular-nums">{row.sharePct.toLocaleString('ca-ES')}%</span></div></TableCell></TableRow>)}</TableBody>
            </Table></div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4"><h3 className="text-sm font-semibold">Temps per preparador i línia de negoci</h3><p className="mt-1 text-xs text-muted-foreground">{data.summary.length} agrupacions en el període seleccionat.</p></div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Preparador</TableHead><TableHead>Línia de negoci</TableHead><TableHead className="text-right">Preparacions</TableHead><TableHead className="text-right">Temps total</TableHead><TableHead className="text-right">Hores</TableHead></TableRow></TableHeader>
              <TableBody>{data.summary.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sense preparacions finalitzades en aquest període.</TableCell></TableRow> : data.summary.map((row) => <TableRow key={`${row.preparerId || row.preparerName}-${row.businessLine}`}><TableCell className="font-medium">{row.preparerName}</TableCell><TableCell>{row.businessLine}</TableCell><TableCell className="text-right tabular-nums">{row.preparationCount}</TableCell><TableCell className="text-right tabular-nums">{formatMinutes(row.totalMinutes)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{row.totalHours.toLocaleString('ca-ES')} h</TableCell></TableRow>)}</TableBody>
            </Table></div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4"><h3 className="text-sm font-semibold">Detall de preparacions</h3><p className="mt-1 text-xs text-muted-foreground">{data.details.length} registres calculats.</p></div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Inici</TableHead><TableHead>Preparador</TableHead><TableHead>Línia de negoci</TableHead><TableHead>Esdeveniment</TableHead><TableHead>Magatzem</TableHead><TableHead>Final</TableHead><TableHead className="text-right">Temps</TableHead></TableRow></TableHeader>
              <TableBody>{data.details.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sense detall disponible.</TableCell></TableRow> : data.details.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{row.preparationDate}</TableCell><TableCell>{row.preparationTime}</TableCell><TableCell className="font-medium">{row.preparerName}</TableCell><TableCell>{row.businessLine}</TableCell><TableCell><div className="max-w-[280px]"><p className="truncate" title={row.eventName}>{row.eventName}</p><p className="text-xs text-muted-foreground">{row.eventCode}{row.serviceName ? ` · ${row.serviceName}` : ''}</p></div></TableCell><TableCell>{row.warehouseLabels.join(', ')}</TableCell><TableCell className="whitespace-nowrap">{formatCompletedAt(row.completedAt)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatMinutes(row.durationMinutes)}</TableCell></TableRow>)}</TableBody>
            </Table></div>
          </section>
        </>
      ) : null}
    </section>
  )
}
