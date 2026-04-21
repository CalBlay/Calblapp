'use client'

import { useCallback, useMemo, useState } from 'react'
import { withAdmin } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, RefreshCw, Search } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type StageEventRow = {
  id?: string
  code?: string
  NomEvent?: string
  DataInici?: string
  DataFi?: string
  NumPax?: number
  Ubicacio?: string
  Comercial?: string
  LN?: string
}

type FullByCodePayload = {
  code: string
  matchCount: number
  alternateMatches: Array<{ id?: string; NomEvent?: string; DataInici?: string }>
  event: Record<string, unknown> & { id?: string }
  quadrants: Record<string, unknown>[]
  incidents: Record<string, unknown>[]
}

/** Error retornat pel proxy /api/mcp/* quan falla el MCP o la config. */
type McpApiErr = {
  ok?: boolean
  error?: string
  hint?: string
  raw?: string
}

type McpUiError = { message: string; hint?: string; raw?: string }

function mcpErrorFromApi(body: McpApiErr, status: number): McpUiError {
  return {
    message: body.error || `Error ${status}`,
    hint: body.hint,
    raw: body.raw,
  }
}

function McpErrorBanner({ err }: { err: McpUiError }) {
  return (
    <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p className="font-medium">{err.message}</p>
      {err.hint ? <p className="text-xs leading-snug opacity-90">{err.hint}</p> : null}
      {err.raw ? (
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/10 p-2 text-xs text-slate-900">
          {err.raw}
        </pre>
      ) : null}
    </div>
  )
}

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function ConsultesMcpPage() {
  const [limit, setLimit] = useState('10')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<McpUiError | null>(null)
  const [rows, setRows] = useState<StageEventRow[]>([])
  const [meta, setMeta] = useState<{ count?: number; ok?: boolean } | null>(null)

  const [eventCode, setEventCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(false)
  const [errorCode, setErrorCode] = useState<McpUiError | null>(null)
  const [fullEvent, setFullEvent] = useState<FullByCodePayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({ limit: limit.trim() || '10' })
      const res = await fetch(`/api/mcp/events?${q.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = (await res.json()) as {
        ok?: boolean
        count?: number
        data?: StageEventRow[]
        error?: string
        hint?: string
        raw?: string
      }
      const failed = !res.ok || data.ok === false
      if (failed) {
        setError(mcpErrorFromApi(data, res.status))
        setRows([])
        setMeta(null)
        return
      }
      setMeta({ ok: data.ok, count: data.count })
      setRows(Array.isArray(data.data) ? data.data : [])
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'Error de xarxa' })
      setRows([])
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [limit])

  const loadByCode = useCallback(async () => {
    const code = eventCode.trim()
    if (!code) {
      setErrorCode({ message: 'Introdueix un code (ex. C2500012)' })
      setFullEvent(null)
      return
    }
    setLoadingCode(true)
    setErrorCode(null)
    setFullEvent(null)
    try {
      const res = await fetch(
        `/api/mcp/event-by-code?${new URLSearchParams({ code }).toString()}`,
        { credentials: 'include', cache: 'no-store' }
      )
      const body = (await res.json()) as {
        ok?: boolean
        data?: FullByCodePayload
        error?: string
        hint?: string
        raw?: string
      }
      if (!res.ok || !body.ok || !body.data) {
        setErrorCode(mcpErrorFromApi(body, res.status))
        return
      }
      setFullEvent(body.data)
    } catch (e) {
      setErrorCode({ message: e instanceof Error ? e.message : 'Error de xarxa' })
    } finally {
      setLoadingCode(false)
    }
  }, [eventCode])

  const chartData = useMemo(() => {
    if (!fullEvent?.event) return []
    const e = fullEvent.event
    const preu = Number(e.PreuMenu)
    const imp = Number(e.Import)
    const out: { name: string; value: number }[] = []
    if (Number.isFinite(preu)) out.push({ name: 'Preu menú', value: preu })
    if (Number.isFinite(imp)) out.push({ name: 'Import total', value: imp })
    return out
  }, [fullEvent])

  const ticketMig = useMemo(() => {
    if (!fullEvent?.event) return null
    const e = fullEvent.event
    const imp = Number(e.Import)
    const pax = Number(e.NumPax)
    if (!Number.isFinite(imp) || !Number.isFinite(pax) || pax <= 0) return null
    return Math.round((imp / pax) * 100) / 100
  }, [fullEvent])

  const sortedEntries = useMemo(() => {
    if (!fullEvent?.event) return []
    return Object.entries(fullEvent.event).sort(([a], [b]) => a.localeCompare(b, 'ca'))
  }, [fullEvent])

  const ev = fullEvent?.event

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-8 max-w-6xl mx-auto">
      <ModuleHeader
        icon={<Sparkles className="w-7 h-7 text-violet-600" />}
        title="Consultes MCP"
        subtitle="Dades reals Firestore via MCP (admin). Vista per llista i detall per code."
      />

      <p className="text-sm text-muted-foreground">
        Les crides passen per <code className="text-xs bg-muted px-1 rounded">/api/mcp/*</code> amb
        clau MCP només al servidor.
      </p>

      {/* ——— Detall per code ——— */}
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
            {fullEvent.alternateMatches.map((m) => m.id).join(', ')}
          </div>
        )}

        {ev && (
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tots els camps del document</CardTitle>
                <CardDescription>
                  {sortedEntries.length} camps · dades brutes per auditoria o futura IA
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-6">
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

      {/* ——— Llista ràpida ——— */}
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
          </p>
        )}

        <div className="rounded-xl border overflow-x-auto">
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
        </div>
      </section>
    </div>
  )
}

export default withAdmin(ConsultesMcpPage)
