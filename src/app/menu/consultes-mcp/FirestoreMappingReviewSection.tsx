'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database, RefreshCw } from 'lucide-react'
import { McpErrorBanner } from './mcp-helpers'

type MappingRow = {
  collection: string
  domain?: string
  domainSource?: string
  needsManualReview?: boolean
  queryAllowed?: boolean
  fieldNames?: string[]
  sensitivity?: string
}

type MappingPayload = {
  ok?: boolean
  manualCoverage?: { percent?: number; documented?: number; missing?: number }
  rowsNeedingManualReview?: string[]
  totalCollections?: number
  rows?: MappingRow[]
  error?: string
}

type DeltaPayload = {
  ok?: boolean
  run?: {
    newCollections?: string[]
    removedCollections?: string[]
    at?: string
    manualCoverage?: { percent?: number }
  }
  error?: string
}

function FirestoreMappingReviewSectionInner() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MappingPayload | null>(null)
  const [delta, setDelta] = useState<DeltaPayload['run'] | null>(null)

  const loadStatus = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/mcp/firestore/mapping-status?limit=500&sampleLimit=6')
    const body = (await res.json().catch(() => ({}))) as MappingPayload & { error?: string }
    if (!res.ok || body.ok === false) {
      throw new Error(body.error || `${res.status} ${res.statusText}`)
    }
    setData(body)
  }, [])

  const runDelta = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp/firestore/mapping-delta-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, sampleLimit: 8 }),
      })
      const body = (await res.json().catch(() => ({}))) as DeltaPayload
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `${res.status}`)
      }
      setDelta(body.run || null)
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en repàs delta')
    } finally {
      setRefreshing(false)
    }
  }, [loadStatus])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await loadStatus()
        if (!cancelled) {
          const deltaRes = await fetch('/api/mcp/firestore/mapping-delta-status')
          const deltaBody = (await deltaRes.json().catch(() => ({}))) as {
            ok?: boolean
            latest?: DeltaPayload['run']
          }
          if (deltaRes.ok && deltaBody.latest) {
            setDelta(deltaBody.latest)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No s ha pogut carregar el mapping')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadStatus])

  const needsReview = data?.rowsNeedingManualReview || []
  const newFromDelta = delta?.newCollections || []
  const reviewRows = (data?.rows || []).filter((r) => r.needsManualReview).slice(0, 40)

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Database className="h-6 w-6 text-slate-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Repàs automàtic Firestore</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Detecta col·leccions noves i mòduls sense documentar al diccionari. No cal anunciar-les una a
              una: el MCP les llegeix via catàleg genèric; aquí veus quines falten documentar per governança.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || refreshing}
          onClick={() => void runDelta()}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Actualitzar repàs
        </Button>
      </div>

      {error ? <McpErrorBanner err={{ message: error }} /> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Escanejant col·leccions Firestore…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg border bg-white p-3">
            <p className="text-muted-foreground">Col·leccions totals</p>
            <p className="text-2xl font-semibold">{data?.totalCollections ?? '—'}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-muted-foreground">Documentades (manual)</p>
            <p className="text-2xl font-semibold">
              {data?.manualCoverage?.percent != null ? `${data.manualCoverage.percent}%` : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-muted-foreground">Sense documentar</p>
            <p className="text-2xl font-semibold text-amber-800">{needsReview.length}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-muted-foreground">Noves (últim delta)</p>
            <p className="text-2xl font-semibold text-violet-800">{newFromDelta.length}</p>
          </div>
        </div>
      )}

      {newFromDelta.length > 0 ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <p className="text-sm font-medium text-violet-950 mb-2">Col·leccions noves des del darrer repàs</p>
          <p className="text-xs font-mono text-violet-900 break-all">{newFromDelta.join(', ')}</p>
        </div>
      ) : null}

      {reviewRows.length > 0 ? (
        <div className="overflow-auto max-h-72 rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2">Col·lecció</th>
                <th className="text-left p-2">Domini</th>
                <th className="text-left p-2">Fonts</th>
                <th className="text-left p-2">Camps (mostra)</th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((row) => (
                <tr key={row.collection} className="border-t">
                  <td className="p-2 font-mono">{row.collection}</td>
                  <td className="p-2">{row.domain || '—'}</td>
                  <td className="p-2">{row.domainSource || 'auto'}</td>
                  <td className="p-2 text-muted-foreground">
                    {(row.fieldNames || []).slice(0, 6).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <p className="text-sm text-emerald-800">Totes les col·leccions escanejades tenen entrada al diccionari manual.</p>
      ) : null}

      {delta?.at ? (
        <p className="text-[10px] text-muted-foreground">Últim repàs delta: {delta.at}</p>
      ) : null}
    </section>
  )
}

export const FirestoreMappingReviewSection = memo(FirestoreMappingReviewSectionInner)
