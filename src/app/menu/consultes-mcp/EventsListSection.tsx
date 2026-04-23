'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { McpErrorBanner } from './mcp-helpers'
import type { McpUiError, StageEventRow } from './types'
import {
  STAGE_EVENT_VIRTUAL_THRESHOLD,
  VirtualizedStageEventRows,
} from './VirtualizedStageEventRows'

function EventsListSectionInner({
  limit,
  setLimit,
  loading,
  load,
  error,
  meta,
  rows,
}: {
  limit: string
  setLimit: (v: string) => void
  loading: boolean
  load: () => void
  error: McpUiError | null
  meta: { count?: number; ok?: boolean } | null
  rows: StageEventRow[]
}) {
  const useVirtual = rows.length > STAGE_EVENT_VIRTUAL_THRESHOLD

  return (
    <section className="space-y-4 border-t pt-8">
      <h2 className="text-lg font-semibold">Llista ràpida (últims per data)</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="mcp-limit" className="text-sm font-medium">
            Quantitat màx.
          </label>
          <Input
            id="mcp-limit"
            type="number"
            min={1}
            max={500}
            className="w-28 border-2 border-slate-400 bg-white text-slate-900 shadow-sm"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="lg"
          onClick={load}
          disabled={loading}
          className={cn(
            'min-h-11 min-w-[12rem] border-2 border-blue-900 bg-blue-600 text-base font-semibold text-white shadow-md',
            'hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
          )}
        >
          {loading ? (
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-5 w-5" />
          )}
          Carregar esdeveniments
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link
            href="/menu"
            className={cn(
              'min-h-11 border-2 border-slate-600 bg-slate-100 font-semibold text-slate-900 shadow-sm',
              'hover:bg-slate-200 hover:text-slate-900'
            )}
          >
            Tornar al menú
          </Link>
        </Button>
      </div>

      {error ? <McpErrorBanner err={error} /> : null}

      {meta?.ok === true && (
        <p className="text-sm text-muted-foreground">
          Resposta MCP: <strong>{meta.count ?? rows.length}</strong> documents (mostrant{' '}
          {rows.length}).
          {useVirtual ? (
            <>
              {' '}
              <span className="text-xs">(llista virtualitzada per rendiment)</span>
            </>
          ) : null}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        {useVirtual && rows.length > 0 ? (
          <>
            <div className="grid min-w-[44rem] grid-cols-[6rem_minmax(10rem,1fr)_5.5rem_3rem_7rem_3.5rem] border-b bg-muted/50 text-left text-sm font-medium">
              <div className="p-2">Data</div>
              <div className="p-2">Esdeveniment</div>
              <div className="p-2">Code</div>
              <div className="p-2">Pax</div>
              <div className="p-2">Ubicació</div>
              <div className="p-2">Línia</div>
            </div>
            <VirtualizedStageEventRows rows={rows} />
          </>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left border-b">
                <th className="p-2 font-medium">Data</th>
                <th className="p-2 font-medium">Esdeveniment</th>
                <th className="p-2 font-medium">Code</th>
                <th className="p-2 font-medium">Pax</th>
                <th className="p-2 font-medium">Ubicació</th>
                <th className="p-2 font-medium">Línia</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && !error && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Prem «Carregar esdeveniments» per veure dades reals.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id || String(r.NomEvent)}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="p-2 whitespace-nowrap">{r.DataInici ?? '—'}</td>
                  <td className="p-2 min-w-[12rem] max-w-[24rem] truncate" title={r.NomEvent}>
                    {r.NomEvent ?? '—'}
                  </td>
                  <td className="p-2 font-mono text-xs">{r.code ?? '—'}</td>
                  <td className="p-2">{r.NumPax ?? '—'}</td>
                  <td className="p-2 max-w-[10rem] truncate" title={r.Ubicacio}>
                    {r.Ubicacio ?? '—'}
                  </td>
                  <td className="p-2">{r.LN ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export const EventsListSection = memo(EventsListSectionInner)
