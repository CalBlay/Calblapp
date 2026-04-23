'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import ExportMenu, { type ExportMenuItem } from '@/components/export/ExportMenu'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { OpenChatAnswer } from './types'
import {
  REPORT_TABLE_VIRTUAL_THRESHOLD,
  VirtualizedReportTable,
} from './VirtualizedReportTable'

const OpenChatReportChartLazy = dynamic(() => import('./OpenChatReportChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground">
      Carregant gràfic…
    </div>
  ),
})

function OpenChatAnswerCardInner({
  openAnswer,
  exportItems,
}: {
  openAnswer: OpenChatAnswer
  exportItems: ExportMenuItem[]
}) {
  const chart = openAnswer.report?.chart
  return (
    <Card id="consultes-mcp-open-print-root" className="border-violet-200 bg-white">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="text-base">Resposta</CardTitle>
          <CardDescription>
            {openAnswer.model ? (
              <>
                Model: <span className="font-mono">{openAnswer.model}</span>
                {openAnswer.toolCallsUsed != null ? (
                  <>
                    {' '}
                    · Eines MCP: <strong>{openAnswer.toolCallsUsed}</strong>
                  </>
                ) : null}
                {openAnswer.cached ? (
                  <>
                    {' '}
                    · <span className="text-emerald-700">Cache (sense cost OpenAI)</span>
                  </>
                ) : null}
              </>
            ) : null}
          </CardDescription>
        </div>
        <ExportMenu
          items={exportItems}
          ariaLabel="Exportar informe de consulta"
          align="end"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
          {openAnswer.text || '—'}
        </p>
        {openAnswer.report?.highlights?.length ? (
          <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-900">
              Punts clau
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-900">
              {openAnswer.report.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {openAnswer.report?.tables?.map((t, ti) => (
          <div
            key={`${t.title}-${ti}`}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
          >
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
              {t.title}
              {t.rows.length > REPORT_TABLE_VIRTUAL_THRESHOLD ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({t.rows.length} files · virtualitzat)
                </span>
              ) : null}
            </p>
            {t.rows.length > REPORT_TABLE_VIRTUAL_THRESHOLD ? (
              <VirtualizedReportTable table={t} />
            ) : (
              <table className="w-full min-w-[20rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    {t.columns.map((c) => (
                      <th
                        key={c}
                        className="px-3 py-2 text-left text-xs font-semibold text-slate-700"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-slate-100 last:border-0">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-slate-800">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {chart && chart.data.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <p className="mb-1 px-1 text-sm font-semibold text-slate-900">
              {chart.title || 'Gràfic'}
            </p>
            <div className="h-[300px] w-full min-w-0">
              <OpenChatReportChartLazy chart={chart} />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export const OpenChatAnswerCard = memo(OpenChatAnswerCardInner)
