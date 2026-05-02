'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow, StockOverviewRow } from './robaPersonalTypes'
import { formatDaysUntilMin } from './robaEstocFormat'

export function EstocPanel() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productId, setProductId] = useState('')
  const [delta, setDelta] = useState('1')
  const [movements, setMovements] = useState<
    { id: string; productId: string; quantityDelta: number; createdAt?: string; reference?: string }[]
  >([])
  const [stockRows, setStockRows] = useState<StockOverviewRow[]>([])
  const [stockMeta, setStockMeta] = useState<{
    alertsAtOrBelowMin: number
    consumptionWindowDays: number
    generatedAt: string
  } | null>(null)

  const loadProducts = useCallback(async () => {
    try {
      const data = await api<ProductRow[]>('/api/roba-personal/products')
      setProducts(data.filter((p) => p.isActive !== false))
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{
        rows: StockOverviewRow[]
        alertsAtOrBelowMin: number
        consumptionWindowDays: number
        generatedAt: string
      }>('/api/roba-personal/stock-overview')
      setStockRows(data.rows)
      setStockMeta({
        alertsAtOrBelowMin: data.alertsAtOrBelowMin,
        consumptionWindowDays: data.consumptionWindowDays,
        generatedAt: data.generatedAt,
      })
    } catch (e: unknown) {
      setStockRows([])
      setStockMeta(null)
      toast({
        title: 'Error vista d’estoc',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const loadMov = useCallback(async () => {
    try {
      const data = await api<typeof movements>('/api/roba-personal/stock-movements')
      setMovements(data)
    } catch {
      setMovements([])
    }
  }, [])

  useEffect(() => {
    void loadProducts()
    void loadMov()
    void loadOverview()
  }, [loadProducts, loadMov, loadOverview])

  const registrar = async () => {
    const qty = Number(delta)
    if (!Number.isFinite(qty) || qty === 0) {
      toast({
        title: 'Quantitat no vàlida',
        description: 'Indiqueu un número diferent de zero (positiu = entrada, negatiu = sortida).',
        variant: 'destructive',
      })
      return
    }
    try {
      const created = await api<{ reference?: string }>('/api/roba-personal/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          quantityDelta: qty,
          reason: 'manual',
        }),
      })
      toast({
        title: 'Moviment registrat',
        description: created.reference ? `Ref.: ${created.reference}` : undefined,
      })
      void loadProducts()
      void loadMov()
      void loadOverview()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const prodLabel = useCallback((id: string) => {
    const p = products.find((x) => x.id === id)
    if (!p) return id
    const t = (p.size ?? '').trim()
    return t ? `${p.code} — ${p.name} (${t})` : `${p.code} — ${p.name}`
  }, [products])

  const buildEstocVistaExportRows = useCallback(
    () =>
      stockRows.map((r) => ({
        Codi: r.code,
        Article: (r.size ?? '').trim() ? `${r.name} · ${(r.size ?? '').trim()}` : r.name,
        Proveidor: r.supplier,
        EstocFisic: r.quantityOnHand,
        Reservat: r.quantityReserved ?? 0,
        Disponible: r.quantityAvailable ?? r.quantityOnHand,
        Minim: r.minStock ?? '',
        Deficit: r.gapToMin,
        Consum6m: r.consumption6m,
        MitjanaDia: r.hasConsumptionHistory ? r.avgDaily : '',
        DiesFinsMinim: formatDaysUntilMin(r.daysUntilMin),
        SuggeritSemestre: r.suggestedSemesterQty ?? '',
        Magatzem: r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM,
      })),
    [stockRows]
  )

  const buildEstocMovimentsExportRows = useCallback(
    () =>
      movements.map((m) => ({
        Data: m.createdAt ? new Date(m.createdAt).toLocaleString('ca-ES') : '',
        Producte: prodLabel(m.productId),
        Delta: m.quantityDelta,
        Referencia: m.reference ?? '',
      })),
    [movements, prodLabel]
  )

  const buildEstocPdfRows = useCallback(
    () => [
      ...buildEstocVistaExportRows().map((r) => ({ ...r, Seccio: 'Vista' })),
      ...buildEstocMovimentsExportRows().map((r) => ({ ...r, Seccio: 'Moviments' })),
    ],
    [buildEstocVistaExportRows, buildEstocMovimentsExportRows]
  )

  const handleEstocExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-estoc')
      await exportRowsToXlsx(
        [
          { name: 'Vista', rows: buildEstocVistaExportRows() },
          { name: 'Moviments', rows: buildEstocMovimentsExportRows() },
        ],
        base
      )
      toast({ title: 'Exportació XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildEstocVistaExportRows, buildEstocMovimentsExportRows])

  const handleEstocExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-estoc')
      await exportRowsToPdf(
        buildEstocPdfRows(),
        'Roba personal · Estoc (vista i moviments visibles)',
        base
      )
      toast({ title: 'Exportació PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildEstocPdfRows])

  const estocExportMenuItems = useMemo(
    () => [
      { label: 'Exportar PDF', onClick: handleEstocExportPdf },
      { label: 'Exportar XLSX', onClick: handleEstocExportXlsx },
    ],
    [handleEstocExportPdf, handleEstocExportXlsx]
  )
  useRegisterModuleExportMenu(estocExportMenuItems)

  return (
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Vista d’estoc i previsió</h2>
        {stockMeta && stockMeta.alertsAtOrBelowMin > 0 ? (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-500/15 rounded-md px-2 py-1.5 w-fit">
            Avís: {stockMeta.alertsAtOrBelowMin} article(s) amb estoc ≤ mínim definit.
          </p>
        ) : null}
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={taulaThText}>Codi</TableHead>
                <TableHead className={taulaThText}>Article</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Físic</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Res.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Disp.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Mín.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Dèficit</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Consum 6m</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Mitj./dia</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Dies fins mín.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Sug. sem.</TableHead>
                <TableHead className={taulaThText}>Magatzem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.map((r) => (
                <TableRow
                  key={r.productId}
                  className={
                    r.atOrBelowMin
                      ? 'bg-destructive/10'
                      : r.daysUntilMin != null &&
                          Number.isFinite(r.daysUntilMin) &&
                          r.daysUntilMin > 0 &&
                          r.daysUntilMin <= 30
                        ? 'bg-amber-500/10'
                        : undefined
                  }
                >
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-sm max-w-[200px]">
                    {(r.size ?? '').trim() ? `${r.name} · ${(r.size ?? '').trim()}` : r.name}
                    <span className="block text-xs text-muted-foreground">{r.supplier}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantityOnHand}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.quantityReserved ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.quantityAvailable ?? r.quantityOnHand}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.minStock ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.gapToMin}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.consumption6m}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.hasConsumptionHistory ? r.avgDaily.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatDaysUntilMin(r.daysUntilMin)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.suggestedSemesterQty ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Entrada / ajust d’estoc</h2>
        <p className="text-xs text-muted-foreground">
          Quantitat <strong className="font-medium text-foreground">positiva</strong> = entrada;
          <strong className="font-medium text-foreground"> negativa</strong> = sortida. Després de triar
          producte i quantitat, premeu el botó per desar.
        </p>
        <form
          className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            void registrar()
          }}
        >
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(5rem,6.5rem)_auto] sm:items-end sm:gap-3">
            <div className="space-y-1 min-w-0">
              <Label className="text-xs text-muted-foreground">Producte</Label>
              <ProductSearchCombobox
                products={products}
                value={productId}
                onChange={setProductId}
                placeholder="Trieu producte…"
                commandInputPlaceholder="Codi, nom, proveïdor…"
                showStockHint
                variant="list"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stock-delta" className="text-xs text-muted-foreground">
                Quantitat
              </Label>
              <Input
                id="stock-delta"
                className="h-9"
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                aria-label="Quantitat del moviment: positiu entrada, negatiu sortida"
              />
            </div>
            <div className="space-y-1 sm:pb-0.5">
              <Label className="text-xs text-muted-foreground sm:invisible sm:pointer-events-none sm:select-none">
                Acció
              </Label>
              <Button
                type="submit"
                className="h-9 w-full sm:w-auto shrink-0"
                disabled={
                  !productId ||
                  !Number.isFinite(Number(delta)) ||
                  Number(delta) === 0
                }
              >
                Aplicar moviment
              </Button>
            </div>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Moviments recents</h2>
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={taulaThText}>Data</TableHead>
                <TableHead className={taulaThText}>Producte</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Δ</TableHead>
                <TableHead className={taulaThText}>Ref.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {m.createdAt
                      ? new Date(m.createdAt).toLocaleString('ca-ES')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{prodLabel(m.productId)}</TableCell>
                  <TableCell className="text-right font-mono">{m.quantityDelta}</TableCell>
                  <TableCell className="text-xs">{m.reference || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
