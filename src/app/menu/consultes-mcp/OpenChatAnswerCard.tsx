'use client'

import { memo, useCallback, useEffect, useState } from 'react'
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
  const [feedbackState, setFeedbackState] = useState<
    'idle' | 'sending' | 'sent' | 'error'
  >('idle')
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackCorrected, setFeedbackCorrected] = useState('')

  useEffect(() => {
    setFeedbackNote('')
    setFeedbackCorrected('')
    setFeedbackState('idle')
    setFeedbackMsg(null)
  }, [openAnswer.traceId])

  const sendFeedback = useCallback(
    async (helpful: boolean) => {
      const traceId = openAnswer.traceId?.trim()
      if (!traceId) return
      setFeedbackState('sending')
      setFeedbackMsg(null)
      try {
        const res = await fetch('/api/mcp/chat/feedback', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            traceId,
            helpful,
            note: feedbackNote.trim(),
            correctedAnswer: feedbackCorrected.trim(),
            tags: ['consultes-mcp-ui'],
          }),
        })
        const data = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || data.ok === false) {
          setFeedbackState('error')
          setFeedbackMsg(data.error || `Error ${res.status}`)
          return
        }
        setFeedbackState('sent')
        setFeedbackMsg(
          helpful
            ? "S'ha registrat com a útil."
            : "S'ha registrat com a no útil (amb correcció si n'has indicat)."
        )
      } catch (e) {
        setFeedbackState('error')
        setFeedbackMsg(e instanceof Error ? e.message : 'Error de xarxa')
      }
    },
    [openAnswer.traceId, feedbackNote, feedbackCorrected]
  )

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
                {openAnswer.toolChoiceSource ? (
                  <>
                    {' '}
                    · Ruta:{' '}
                    <span className="font-mono text-xs">{openAnswer.toolChoiceSource}</span>
                  </>
                ) : null}
              </>
            ) : null}
            {openAnswer.traceId ? (
              <span className="mt-1 block font-mono text-[10px] text-muted-foreground break-all">
                Trace: {openAnswer.traceId}
              </span>
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
        {openAnswer.report?.kpis?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Indicadors (KPI)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {openAnswer.report.kpis.map((k) => (
                <div
                  key={k.id}
                  className="rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-3 py-2.5 shadow-sm"
                >
                  <p className="text-xs font-medium leading-snug text-slate-700">{k.label}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground">{k.periodALabel}</span>
                    <span className="text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {k.valueA}
                    </span>
                    <span className="text-muted-foreground">{k.periodBLabel}</span>
                    <span className="text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {k.valueB}
                    </span>
                  </div>
                  {k.delta != null || k.deltaPct != null ? (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                      Δ{' '}
                      <span className="font-mono font-medium text-slate-800 tabular-nums">
                        {k.delta ?? '—'}
                      </span>
                      {k.deltaPct ? (
                        <span className="ml-2 text-violet-800">({k.deltaPct})</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
        {openAnswer.traceId ? (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
            <p className="mb-2 text-xs font-medium text-slate-600">
              Avaluació per millorar el sistema (opcional)
            </p>
            <div className="mb-3 space-y-2">
              <label className="block text-xs text-slate-600" htmlFor="mcp-feedback-note">
                Nota o context
              </label>
              <textarea
                id="mcp-feedback-note"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                disabled={feedbackState === 'sending' || feedbackState === 'sent'}
                rows={2}
                className="w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                placeholder="Ex.: esperava la mètrica X, o el període Y"
              />
              <label className="block text-xs text-slate-600" htmlFor="mcp-feedback-corrected">
                Resposta correcta (si la saps)
              </label>
              <textarea
                id="mcp-feedback-corrected"
                value={feedbackCorrected}
                onChange={(e) => setFeedbackCorrected(e.target.value)}
                disabled={feedbackState === 'sending' || feedbackState === 'sent'}
                rows={2}
                className="w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                placeholder="Opcional; s’usa com a objectiu d’entrenament al dataset ETL"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={feedbackState === 'sending' || feedbackState === 'sent'}
                onClick={() => void sendFeedback(true)}
                className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
              >
                Útil
              </button>
              <button
                type="button"
                disabled={feedbackState === 'sending' || feedbackState === 'sent'}
                onClick={() => void sendFeedback(false)}
                className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 shadow-sm hover:bg-rose-50 disabled:opacity-50"
              >
                No útil
              </button>
              {feedbackState === 'sending' ? (
                <span className="text-xs text-muted-foreground">Enviant…</span>
              ) : null}
            </div>
            {feedbackMsg ? (
              <p
                className={`mt-2 text-xs ${feedbackState === 'error' ? 'text-rose-700' : 'text-emerald-800'}`}
              >
                {feedbackMsg}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export const OpenChatAnswerCard = memo(OpenChatAnswerCardInner)
