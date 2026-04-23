'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFieldValue, McpErrorBanner } from './mcp-helpers'
import type { FullByCodePayload, McpUiError, StageVerdEventByCode } from './types'
import {
  DOCUMENT_FIELDS_VIRTUAL_THRESHOLD,
  VirtualizedDocumentFields,
} from './VirtualizedDocumentFields'

const EventEconomicBarChartLazy = dynamic(() => import('./EventEconomicBarChart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
      Carregant gràfic…
    </div>
  ),
})

function EventByCodeSectionInner({
  eventCode,
  setEventCode,
  loadingCode,
  loadByCode,
  errorCode,
  fullEvent,
  ev,
  chartData,
  ticketMig,
  sortedEntries,
}: {
  eventCode: string
  setEventCode: (v: string) => void
  loadingCode: boolean
  loadByCode: () => void
  errorCode: McpUiError | null
  fullEvent: FullByCodePayload | null
  ev: StageVerdEventByCode | undefined
  chartData: { name: string; value: number }[]
  ticketMig: number | null
  sortedEntries: [string, unknown][]
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Vista completa per code</h2>
      <p className="text-sm text-muted-foreground">
        Introdueix el camp <strong>code</strong> de l&apos;esdeveniment (ex.{' '}
        <span className="font-mono">C2500012</span>). Es mostren tots els camps del document,
        quadrants i incidències enllaçades (quan n&apos;hi ha).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[12rem] flex-1">
          <label htmlFor="event-code" className="text-sm font-medium">
            Code
          </label>
          <Input
            id="event-code"
            placeholder="C2500012"
            className="font-mono border-2 border-slate-400 bg-white text-slate-900 shadow-sm"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="lg"
          onClick={loadByCode}
          disabled={loadingCode}
          className={cn(
            'min-h-11 min-w-[10.5rem] border-2 border-violet-900 bg-violet-600 text-base font-semibold text-white shadow-md',
            'hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2'
          )}
        >
          {loadingCode ? (
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Search className="mr-2 h-5 w-5" />
          )}
          Carregar fitxa
        </Button>
      </div>

      {errorCode ? <McpErrorBanner err={errorCode} /> : null}

      {fullEvent && fullEvent.matchCount > 1 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hi ha <strong>{fullEvent.matchCount}</strong> documents amb aquest code. Es mostra el
          primer; altres:{' '}
          {fullEvent.alternateMatches
            .map((m) => m.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .join(', ')}
        </div>
      )}

      {ev && fullEvent && (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">
                {String(ev.NomEvent ?? 'Esdeveniment')}
              </CardTitle>
              <CardDescription className="font-mono text-violet-700">
                code {String(ev.code ?? fullEvent?.code ?? '—')} · id {String(ev.id ?? '—')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Data inici', ev.DataInici],
                ['Data fi', ev.DataFi],
                ['Pax', ev.NumPax],
                ['Import', ev.Import],
                ['Preu menú', ev.PreuMenu],
                ['Ticket mig / pax', ticketMig ?? '—'],
                ['Ubicació', ev.Ubicacio],
                ['Comercial', ev.Comercial],
                ['Servei', ev.Servei],
                ['Línia negoci', ev.LN],
                ['Stage', ev.Stage],
                ['Stage grup', ev.StageGroup],
                ['Origen', ev.origen],
              ].map(([label, val]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="text-muted-foreground text-xs">{label}</div>
                  <div className="font-medium break-words">{formatFieldValue(val)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Indicadors econòmics (resum)</CardTitle>
                <CardDescription>Preu menú vs import total (mateixa escala aprox.)</CardDescription>
              </CardHeader>
              <CardContent className="h-64 pl-0">
                <EventEconomicBarChartLazy data={chartData} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tots els camps del document</CardTitle>
              <CardDescription>
                {sortedEntries.length} camps · dades brutes per auditoria o futura IA
                {sortedEntries.length > DOCUMENT_FIELDS_VIRTUAL_THRESHOLD ? (
                  <span className="text-xs"> · vista virtualitzada</span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {sortedEntries.length > DOCUMENT_FIELDS_VIRTUAL_THRESHOLD ? (
                <VirtualizedDocumentFields entries={sortedEntries} />
              ) : (
                <div className="max-h-[28rem] overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      {sortedEntries.map(([k, v]) => (
                        <tr key={k} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-2 font-mono text-xs text-violet-700 align-top w-[40%]">
                            {k}
                          </td>
                          <td className="p-2 align-top whitespace-pre-wrap break-words">
                            {formatFieldValue(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Quadrants relacionats ({fullEvent.quadrants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {fullEvent.quadrants.length === 0 ? (
                  <p>Cap quadrant enllaçat amb aquest id/code (o col·lecció buida).</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-auto">
                    {fullEvent.quadrants.slice(0, 20).map((q, i) => (
                      <li key={i} className="rounded border px-2 py-1 font-mono text-xs">
                        {JSON.stringify(q).slice(0, 200)}
                        {JSON.stringify(q).length > 200 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Incidències relacionades ({fullEvent.incidents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {fullEvent.incidents.length === 0 ? (
                  <p>Cap incidència enllaçada.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-auto">
                    {fullEvent.incidents.slice(0, 20).map((inc, i) => (
                      <li key={i} className="rounded border px-2 py-1 font-mono text-xs">
                        {JSON.stringify(inc).slice(0, 200)}
                        {JSON.stringify(inc).length > 200 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  )
}

export const EventByCodeSection = memo(EventByCodeSectionInner)
