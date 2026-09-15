'use client'

import { useMemo, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { ArrowRight, Clock3, Euro, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OpsiaTransfersMonthDoc } from '@/lib/costServeis/opsiaTransfersTypes'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((response) => response.json())

const SOURCE_LABELS = {
  CUINA: 'Cuina',
  CATERING: 'Càtering',
} as const

const DESTINATION_LABELS = {
  EMPRESA: 'Empresa',
  CASAMENTS: 'Casaments',
  FOODLOVERS: 'Foodlovers',
  CATERING: 'Càtering',
} as const

function currentYearMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthTitle(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('ca-ES', {
    month: 'long',
    year: 'numeric',
  })
}

function fmtEuro(value: number) {
  return value.toLocaleString('ca-ES', { style: 'currency', currency: 'EUR' })
}

function fmtNumber(value: number) {
  return value.toLocaleString('ca-ES', { maximumFractionDigits: 2 })
}

function DetailLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</span>
}

export function TraspassosTab() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [syncYm, setSyncYm] = useState(currentYearMonth)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const fromYm = `${year}-01`
  const toYm = `${year}-12`

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/opsia/transfers/months?from=${fromYm}&to=${toYm}`,
    fetcher
  )
  const months = useMemo(
    () =>
      [...((data?.months as OpsiaTransfersMonthDoc[] | undefined) ?? [])].sort(
        (a, b) => a.ym.localeCompare(b.ym)
      ),
    [data?.months]
  )
  const configured = Boolean(data?.configured)

  const onSync = async () => {
    setSyncMsg(null)
    const [syncYear, syncMonth] = syncYm.split('-').map(Number)
    if (!syncYear || !syncMonth) return setSyncMsg('Mes invàlid')
    setSyncing(true)
    try {
      const response = await fetch(
        `/api/cost-serveis/opsia/transfers/sync?year=${syncYear}&month=${syncMonth}`,
        { method: 'POST' }
      )
      const json = await response.json().catch(() => ({}))
      if (!response.ok) return setSyncMsg(json.error || `Error ${response.status}`)
      const month = json.month as OpsiaTransfersMonthDoc
      setSyncMsg(
        month.estat === 'CONFIRMAT'
          ? `Sincronitzat ${syncYm} · ${month.totals.moviments} moviments · ${fmtEuro(month.totals.importTotal)}`
          : `${syncYm}: traspassos ${month.estat === 'BORRADOR' ? 'encara en esborrany' : 'sense dades'} a Opsia`
      )
      await mutate()
    } catch (error) {
      setSyncMsg(error instanceof Error ? error.message : 'Error de xarxa')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Traspassos directes que poden coincidir amb el cost dels quadrants</p>
        <p className="mt-1">
          Només Cuina Central —amb tots els seus departaments— cap a Empresa,
          Casaments, Foodlovers (Fires i Festivals) o Càtering intern. Els
          moviments interns reclassifiquen el cost entre departaments; els externs
          es resten de l’estructura i del residual indirecte de la LN.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-[120px]">
          <label className={corporateFilterLabelClass}>Any</label>
          <input
            type="number"
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
            value={year}
            onChange={(event) => setYear(Number(event.target.value) || year)}
            min={2020}
            max={2100}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[170px]">
            <label className={corporateFilterLabelClass}>Mes a sincronitzar</label>
            <input
              type="month"
              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              value={syncYm}
              onChange={(event) => setSyncYm(event.target.value)}
            />
          </div>
          <Button onClick={onSync} disabled={syncing || !configured}>
            {syncing ? 'Sincronitzant…' : 'Sincronitzar traspassos'}
          </Button>
        </div>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          OpsiaFinance no està configurat. També cal desplegar l’endpoint{' '}
          <code className="text-xs">/api/external/cost-traspassos-serveis</code>.
        </p>
      ) : null}
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : months.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Encara no hi ha traspassos importats per {year}.
        </p>
      ) : (
        <div className="space-y-5">
          {months.map((month) => (
            <section key={month.ym} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="font-semibold capitalize text-slate-900">{monthTitle(month.ym)}</h2>
                  <p className="text-xs text-slate-500">
                    {month.estat === 'CONFIRMAT' ? 'Confirmat a Opsia' : month.estat}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Clock3 className="h-4 w-4" /> {fmtNumber(month.totals.hores)} h
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Route className="h-4 w-4" /> {month.totals.moviments} moviments
                  </span>
                  <strong className="inline-flex items-center gap-1.5 text-cyan-800">
                    <Euro className="h-4 w-4" /> {fmtEuro(month.totals.importTotal)}
                  </strong>
                </div>
              </header>

              {month.summary.length > 0 ? (
                <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
                  {month.summary.map((row) => (
                    <div
                      key={`${row.origenGrup}-${row.origenDeptCodi || row.origenDeptNom}-${row.destiCentreCodi}-${row.destiDeptCodi || ''}`}
                      className="bg-white p-4"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <span>{row.origenDeptNom}</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span>{DESTINATION_LABELS[row.destiGrup]}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {SOURCE_LABELS[row.origenGrup]} · {row.origenDeptCodi || 'Tot el centre'} →{' '}
                        {row.destiCentreNom} · {row.destiDeptNom || 'Tot el centre'}
                      </p>
                      <div className="mt-2 flex items-baseline justify-between gap-3">
                        <span className="text-xs text-slate-500">
                          {fmtNumber(row.hores)} h · {row.moviments} mov.
                        </span>
                        <strong className="text-base text-cyan-800">{fmtEuro(row.importTotal)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500">
                  {month.estat === 'BORRADOR'
                    ? 'Els traspassos existeixen, però encara no estan confirmats a Opsia.'
                    : 'No hi ha moviments que compleixin el filtre aquest mes.'}
                </p>
              )}

              {month.lines.length > 0 ? (
                <details className="border-t border-slate-200">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Veure el desglossament de {month.lines.length} moviments
                  </summary>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {month.lines.map((line) => (
                      <article key={line.id} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_repeat(3,minmax(90px,0.6fr))]">
                        <div>
                          <DetailLabel>Origen</DetailLabel>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {SOURCE_LABELS[line.origenGrup]} · {line.origenDeptNom || line.origenCentreNom}
                          </p>
                          <p className="text-xs text-slate-500">{line.origenDeptCodi || line.origenCentreCodi}</p>
                        </div>
                        <div>
                          <DetailLabel>Destí</DetailLabel>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {DESTINATION_LABELS[line.destiGrup]} · {line.destiCentreNom}
                          </p>
                          <p className="text-xs text-slate-500">
                            {line.destiLnCodi} · {line.destiDeptNom || line.destiCentreCodi}
                          </p>
                        </div>
                        <div>
                          <DetailLabel>Temps</DetailLabel>
                          <p className="mt-1 text-sm font-medium text-slate-900">{fmtNumber(line.hores)} h</p>
                          <p className="text-xs text-slate-500">{fmtNumber(line.minuts)} min</p>
                        </div>
                        <div>
                          <DetailLabel>Preu/hora</DetailLabel>
                          <p className="mt-1 text-sm font-medium text-slate-900">{fmtEuro(line.tarifaHora)}</p>
                        </div>
                        <div>
                          <DetailLabel>Total</DetailLabel>
                          <p className="mt-1 text-sm font-semibold text-cyan-800">{fmtEuro(line.importTotal)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
