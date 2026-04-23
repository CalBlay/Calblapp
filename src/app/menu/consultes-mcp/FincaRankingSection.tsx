'use client'

import type { Dispatch, SetStateAction } from 'react'
import { memo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { McpErrorBanner } from './mcp-helpers'
import type { FincaRankingRow, McpUiError } from './types'

const FincaRankingBarChartLazy = dynamic(() => import('./FincaRankingBarChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
      Carregant gràfic…
    </div>
  ),
})

function FincaRankingSectionInner({
  fincaStart,
  fincaEnd,
  setFincaRange,
  fincaLn,
  setFincaLn,
  fincaLines,
  fincaLoading,
  fincaError,
  fincaMeta,
  fincaChartData,
  loadFincaRanking,
}: {
  fincaStart: string
  fincaEnd: string
  setFincaRange: Dispatch<SetStateAction<{ start: string; end: string }>>
  fincaLn: string
  setFincaLn: (v: string) => void
  fincaLines: string[]
  fincaLoading: boolean
  fincaError: McpUiError | null
  fincaMeta: {
    totalImportSum: number
    eventDocsInRange: number
    note?: string
  } | null
  fincaChartData: FincaRankingRow[]
  loadFincaRanking: () => void
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Top 10 finques per facturació (agenda)</h2>
      <p className="text-sm text-muted-foreground">
        Suma del camp <strong>Import</strong> de <code className="text-xs">stage_verd</code> per{' '}
        <strong>finca</strong> (codi finca, id o ubicació) en un període. Filtre opcional per{' '}
        <strong>línia de negoci</strong> (<code className="text-xs">LN</code>). No substitueix
        facturació SAP.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="finca-start" className="text-sm font-medium">
            Des de
          </label>
          <Input
            id="finca-start"
            type="date"
            className="border-2 border-slate-400 bg-white shadow-sm w-[11rem]"
            value={fincaStart}
            onChange={(e) =>
              setFincaRange((r) => ({ ...r, start: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="finca-end" className="text-sm font-medium">
            Fins a
          </label>
          <Input
            id="finca-end"
            type="date"
            className="border-2 border-slate-400 bg-white shadow-sm w-[11rem]"
            value={fincaEnd}
            onChange={(e) =>
              setFincaRange((r) => ({ ...r, end: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1 min-w-[12rem]">
          <label htmlFor="finca-ln" className="text-sm font-medium">
            Línia de negoci (LN)
          </label>
          <select
            id="finca-ln"
            className="flex h-10 w-full rounded-md border-2 border-slate-400 bg-white px-3 text-sm shadow-sm"
            value={fincaLn}
            onChange={(e) => setFincaLn(e.target.value)}
          >
            <option value="">Totes les línies</option>
            {fincaLines.map((ln) => (
              <option key={ln} value={ln}>
                {ln}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={loadFincaRanking}
          disabled={fincaLoading}
          className={cn(
            'min-h-11 border-2 border-emerald-900 bg-emerald-600 text-base font-semibold text-white shadow-md',
            'hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2'
          )}
        >
          {fincaLoading ? (
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          ) : null}
          Carregar rànking
        </Button>
      </div>

      {fincaError ? <McpErrorBanner err={fincaError} /> : null}

      {fincaMeta ? (
        <p className="text-sm text-muted-foreground">
          <strong>{fincaMeta.eventDocsInRange}</strong> esdeveniments al període · Import total
          agrupat (top 10 mostrat):{' '}
          <strong>
            {fincaMeta.totalImportSum.toLocaleString('ca-ES', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            €
          </strong>
          {fincaMeta.note ? (
            <>
              <br />
              <span className="text-xs">{fincaMeta.note}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {fincaChartData.length > 0 ? (
        <div className="h-[380px] w-full min-w-0 rounded-lg border bg-white p-2">
          <FincaRankingBarChartLazy data={fincaChartData} />
        </div>
      ) : null}
    </section>
  )
}

export const FincaRankingSection = memo(FincaRankingSectionInner)
