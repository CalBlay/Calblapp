'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { ChevronDown, Loader2, Search, Trash2 } from 'lucide-react'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow, StockOverviewRow } from './robaPersonalTypes'
import { formatDaysUntilMin } from './robaEstocFormat'
import { formatDateTimeValue } from '@/lib/date-format'
import {
  isReversibleManualStockReason,
  labelStockMovementReasonDisplay,
  stockMovementDepartmentLabel,
} from '@/lib/roba-personal/stockMovementLabels'
import { requestReferenceFromDocId } from '@/lib/roba-personal/dotacioReferenceCodes'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { robaMovimentsDefaultMonthRange, robaRequestCalendarDay } from './robaPersonalDates'

const STOCK_MOVEMENTS_PURGE_CONFIRM_PHRASE = 'ESBORRAR_TOTS_ELS_MOVIMENTS_I_RESERVA'

type StockReservedReconcileRow = {
  productId: string
  code: string
  name: string
  quantityOnHand: number
  currentReserved: number
  expectedReserved: number
}

type StockReservedReconcileResult = {
  contributingRequestCount: number
  discrepancyCount: number
  discrepancies: StockReservedReconcileRow[]
}

export function EstocPanel() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productId, setProductId] = useState('')
  const [delta, setDelta] = useState('0')
  const [movementReason, setMovementReason] = useState<string>('manual_adjust')
  const [movementNotes, setMovementNotes] = useState('')
  const [movements, setMovements] = useState<
    {
      id: string
      productId: string
      quantityDelta: number
      createdAt?: string
      reference?: string
      reason?: string
      notes?: string | null
      createdByUserName?: string | null
      quantityReservedDelta?: number | null
      productReservedAfter?: number | null
      requestingDepartment?: string | null
      workerDepartment?: string | null
      requestId?: string | null
      deliveryWorkerAckPending?: boolean | null
    }[]
  >([])
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [stockRows, setStockRows] = useState<StockOverviewRow[]>([])
  const [stockListSearch, setStockListSearch] = useState('')
  const [movListSearch, setMovListSearch] = useState('')
  const [movTypeFilters, setMovTypeFilters] = useState<string[]>([])
  const [movListRangeStart, setMovListRangeStart] = useState(() => robaMovimentsDefaultMonthRange().start)
  const [movListRangeEnd, setMovListRangeEnd] = useState(() => robaMovimentsDefaultMonthRange().end)
  const [movListFiltersResetSignal, setMovListFiltersResetSignal] = useState(0)
  const [stockOverviewOpen, setStockOverviewOpen] = useState(true)
  const [stockEntryOpen, setStockEntryOpen] = useState(true)
  const [stockMovementsOpen, setStockMovementsOpen] = useState(true)
  const [reconcileBusy, setReconcileBusy] = useState(false)
  const [reconcileApplyBusy, setReconcileApplyBusy] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<StockReservedReconcileResult>({
    contributingRequestCount: 0,
    discrepancyCount: 0,
    discrepancies: [],
  })
  const [purgeAllBusy, setPurgeAllBusy] = useState(false)

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
    } catch (e: unknown) {
      setStockRows([])
      toast({
        title: 'Error vista d’estoc',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const loadMov = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (movListRangeStart) params.set('start', movListRangeStart)
      if (movListRangeEnd) params.set('end', movListRangeEnd)
      const data = await api<typeof movements>(
        `/api/roba-personal/stock-movements${params.toString() ? `?${params.toString()}` : ''}`
      )
      setMovements(data)
    } catch {
      setMovements([])
    }
  }, [movListRangeEnd, movListRangeStart])

  useEffect(() => {
    void loadProducts()
    void loadOverview()
  }, [loadProducts, loadOverview])

  useEffect(() => {
    void loadMov()
  }, [loadMov])

  const normalizeStockHay = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

  const stockRowsFiltered = useMemo(() => {
    const q = normalizeStockHay(stockListSearch)
    if (!q) return stockRows
    return stockRows.filter((r) => {
      const hay = normalizeStockHay(
        [
          r.code,
          r.name,
          r.size,
          r.supplier,
          r.magatzem,
          r.minStock != null ? String(r.minStock) : '',
          String(r.quantityOnHand),
          String(r.quantityReserved ?? ''),
          String(r.quantityAvailable ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
      )
      const tokens = q.split(/\s+/).filter(Boolean)
      if (tokens.length === 0) return true
      return tokens.every((t) => hay.includes(t))
    })
  }, [stockRows, stockListSearch])

  const handleMovSmartDateChange = useCallback((f: SmartFiltersChange) => {
    if (f.start && f.end) {
      setMovListRangeStart(f.start)
      setMovListRangeEnd(f.end)
    }
  }, [])

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
      const notesTrim = movementNotes.trim()
      const created = await api<{ reference?: string }>('/api/roba-personal/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          quantityDelta: qty,
          reason: movementReason,
          notes: notesTrim || undefined,
        }),
      })
      toast({
        title: 'Moviment registrat',
        description: created.reference ? `Ref.: ${created.reference}` : undefined,
      })
      setDelta('0')
      setMovementNotes('')
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

  const movementsFiltered = useMemo(() => {
    const inRange = movements.filter((m) => {
      const day = robaRequestCalendarDay(m.createdAt)
      if (day) {
        if (day < movListRangeStart || day > movListRangeEnd) return false
      }
      return true
    })
    const q = normalizeStockHay(movListSearch)
    if (!q) return inRange
    const tokens = q.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return inRange
    return inRange.filter((m) => {
      const rid = String(m.requestId || '').trim()
      const hay = normalizeStockHay(
        [
          m.reference,
          m.id,
          rid ? requestReferenceFromDocId(rid) : '',
          labelStockMovementReasonDisplay(m),
          m.notes,
          String(m.createdByUserName || ''),
          prodLabel(m.productId),
          stockMovementDepartmentLabel(m),
          String(m.quantityDelta),
          String(m.quantityReservedDelta ?? ''),
          String(m.productReservedAfter ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
      )
      return tokens.every((t) => hay.includes(t))
    })
  }, [
    movements,
    movListSearch,
    movListRangeStart,
    movListRangeEnd,
    prodLabel,
  ])

  const movementTypeKey = useCallback(
    (m: (typeof movements)[number]) =>
      `${String(m.reason || '').trim() || 'unknown'}::${m.deliveryWorkerAckPending === true ? 'pending' : 'final'}`,
    []
  )

  const movementsAfterSearch = useMemo(() => movementsFiltered, [movementsFiltered])

  const movementTypeOptions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const m of movementsAfterSearch) {
      const key = movementTypeKey(m)
      const label = labelStockMovementReasonDisplay(m)
      const prev = counts.get(key)
      counts.set(key, { label, count: (prev?.count || 0) + 1 })
    }
    return [...counts.entries()]
      .map(([key, value]) => ({ key, label: value.label, count: value.count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca'))
  }, [movementTypeKey, movementsAfterSearch])

  const movementsVisible = useMemo(() => {
    if (movTypeFilters.length === 0) return movementsAfterSearch
    const selected = new Set(movTypeFilters)
    return movementsAfterSearch.filter((m) => selected.has(movementTypeKey(m)))
  }, [movementTypeKey, movTypeFilters, movementsAfterSearch])

  const toggleMovTypeFilter = useCallback((key: string) => {
    setMovTypeFilters((current) =>
      current.includes(key) ? current.filter((x) => x !== key) : [...current, key]
    )
  }, [])

  const eliminarMoviment = async (m: (typeof movements)[number]) => {
    if (!isReversibleManualStockReason(m.reason)) return
    const ref = m.reference?.trim() || m.id
    const ok = window.confirm(
      `Voleu eliminar aquest moviment i revertir l’estoc?\n\n${prodLabel(m.productId)}\nΔ ${m.quantityDelta}\n${ref}\n\nAquesta acció no es pot desfer (el moviment desapareixerà de la llista).`
    )
    if (!ok) return
    setDeleteBusyId(m.id)
    try {
      await api<{ ok?: boolean }>(`/api/roba-personal/stock-movements/${m.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Moviment eliminat', description: "S'ha revertit l'efecte sobre l'estoc físic." })
      void loadProducts()
      void loadMov()
      void loadOverview()
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut eliminar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setDeleteBusyId(null)
    }
  }

  const buildEstocVistaExportRows = useCallback(
    () =>
      stockRowsFiltered.map((r) => ({
        Codi: r.code,
        Article: (r.size ?? '').trim() ? `${r.name} · ${(r.size ?? '').trim()}` : r.name,
        Proveidor: r.supplier,
        Stock: r.quantityOnHand,
        Reservat: r.quantityReserved ?? 0,
        Disponible: r.quantityAvailable ?? r.quantityOnHand,
        PendTeoric: r.quantityPendingTheoretical ?? 0,
        DispDespresDemanda: r.quantityAvailableAfterTheoretical ?? (r.quantityAvailable ?? r.quantityOnHand),
        Minim: r.minStock ?? '',
        Deficit: r.gapToMin,
        Consum6m: r.consumption6m,
        TotalAnyActual: r.annualDeliveredCurrentYear,
        TotalAnyAnterior: r.annualDeliveredPreviousYear,
        MitjanaDia: r.hasConsumptionHistory ? r.avgDaily : '',
        DiesFinsMinim: formatDaysUntilMin(r.daysUntilMin),
        SuggeritSemestre: r.suggestedSemesterQty ?? '',
        Magatzem: r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM,
      })),
    [stockRowsFiltered]
  )

  const buildEstocMovimentsExportRows = useCallback(
    () =>
      movementsVisible.map((m) => ({
        Data: formatDateTimeValue(m.createdAt, ''),
        Tipus: labelStockMovementReasonDisplay(m),
        Departament: stockMovementDepartmentLabel(m),
        Producte: prodLabel(m.productId),
        Delta: m.quantityDelta,
        Referencia: m.reference ?? '',
        Usuari: String(m.createdByUserName || '').trim() || '—',
        Observacions: String(m.notes || '').trim() || '—',
      })),
    [movementsVisible, prodLabel]
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

  const runReservedReconcileCheck = useCallback(async (opts?: { silentCoherentToast?: boolean }) => {
    setReconcileBusy(true)
    try {
      const data = await api<StockReservedReconcileResult>(
        '/api/roba-personal/stock-reserved-reconcile'
      )
      setReconcileResult(data)
      if (data.discrepancyCount === 0 && !opts?.silentCoherentToast) {
        toast({
          title: 'Reserva coherent',
          description: `Cap diferència trobada (${data.contributingRequestCount} sol·licituds amb reserva comptades).`,
        })
      }
    } catch (e: unknown) {
      setReconcileResult({
        contributingRequestCount: 0,
        discrepancyCount: 0,
        discrepancies: [],
      })
      toast({
        title: 'No s’ha pogut analitzar la reserva',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setReconcileBusy(false)
    }
  }, [])

  const applyReservedReconcile = useCallback(async () => {
    if (!reconcileResult || reconcileResult.discrepancyCount === 0) return
    const ok = window.confirm(
      `S’actualitzarà el camp «Reservat» de ${reconcileResult.discrepancyCount} producte(s) perquè coincideixi amb les sol·licituds en preparat/recollit (reserva activa). Continuar?`
    )
    if (!ok) return
    setReconcileApplyBusy(true)
    try {
      const out = await api<StockReservedReconcileResult & { ok?: boolean; updatedCount?: number }>(
        '/api/roba-personal/stock-reserved-reconcile',
        {
          method: 'POST',
          body: JSON.stringify({ apply: true }),
        }
      )
      toast({
        title: 'Reserva actualitzada',
        description: `S’han corregit ${out.updatedCount ?? 0} producte(s).`,
      })
      setReconcileResult({
        contributingRequestCount: out.contributingRequestCount,
        discrepancyCount: out.discrepancyCount,
        discrepancies: out.discrepancies,
      })
      void loadProducts()
      void loadOverview()
      void loadMov()
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut aplicar la correcció',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setReconcileApplyBusy(false)
    }
  }, [reconcileResult, loadProducts, loadOverview, loadMov])

  const purgeAllStockMovementsAndReserved = useCallback(async () => {
    const ok1 = window.confirm(
      'Aquesta acció és irreversible: s’esborraran tots els moviments d’estoc (historial) i es posarà Reservat = 0 a tots els productes. L’estoc físic (Stock) no canvia. Voleu continuar?'
    )
    if (!ok1) return
    const typed = window.prompt(
      `Escriviu exactament (majúscules i sense espais extra):\n${STOCK_MOVEMENTS_PURGE_CONFIRM_PHRASE}`
    )
    if (typed !== STOCK_MOVEMENTS_PURGE_CONFIRM_PHRASE) {
      toast({
        title: 'Cancel·lat',
        description: 'El text de confirmació no coincideix.',
      })
      return
    }
    setPurgeAllBusy(true)
    try {
      const out = await api<{
        ok?: boolean
        deletedMovements?: number
        productsReservedZeroed?: number
      }>('/api/roba-personal/stock-movements/purge-all', {
        method: 'POST',
        body: JSON.stringify({ confirm: STOCK_MOVEMENTS_PURGE_CONFIRM_PHRASE }),
      })
      toast({
        title: 'Esborrat completat',
        description: `Moviments eliminats: ${out.deletedMovements ?? 0}. Productes amb reserva posada a 0: ${out.productsReservedZeroed ?? 0}.`,
      })
      setReconcileResult({
        contributingRequestCount: 0,
        discrepancyCount: 0,
        discrepancies: [],
      })
      void loadProducts()
      void loadOverview()
      void loadMov()
    } catch (e: unknown) {
      toast({
        title: 'Error en l’esborrat',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setPurgeAllBusy(false)
    }
  }, [loadProducts, loadOverview, loadMov])

  return (
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setStockOverviewOpen((open) => !open)}
          aria-expanded={stockOverviewOpen}
        >
          <h2 className="font-semibold text-base">Vista d’estoc i previsió</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              stockOverviewOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {stockOverviewOpen ? (
          <>
        {/* Text explicatiu retirat a petició de gestió */}
        {false ? (
        <p className="text-xs text-muted-foreground max-w-3xl">
          La columna «Reservat» són unitats que encara són físicament al magatzem, assignades a sol·licituds preparades o
          recollides (bloqueig per lliurament). No és una entrega ja registrada: quan el responsable registra l’entrega,
          l’estoc físic baixa (Δ negatiu a moviments) i la reserva disminueix. Mentre veieu reserva sense haver registrat
          cap entrega, el moviment que la explica és «Preparació · reserva al magatzem» (Δ 0), no «Entrega pel
          responsable».
        </p>
        ) : null}
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="h-10 rounded-xl border-gray-300 bg-white pl-9 dark:bg-background"
            placeholder="Cercar codi, article, proveïdor, magatzem, estoc…"
            value={stockListSearch}
            onChange={(e) => setStockListSearch(e.target.value)}
            aria-label="Cercar a la vista d’estoc"
          />
        </div>
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={taulaThText}>Codi</TableHead>
                <TableHead className={taulaThText}>Article</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Stock</TableHead>
                <TableHead
                  className={cn(taulaThText, 'text-right')}
                  title={
                    'Material encara al magatzem, bloquejat per sol·licituds preparades/recollides. ' +
                    'No indica «entrega al responsable»: aquesta es veu com a moviment d’entrega amb Δ negatiu un cop registrada. ' +
                    'La reserva inicial es registra com a «Preparació · reserva al magatzem» (Δ 0).'
                  }
                >
                  Reservat
                </TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Disp.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Pend. teòric</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Disp. després demanda</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Mín.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Dèficit</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Consum 6m</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Any actual</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Any anterior</TableHead>
                <TableHead
                  className={cn(taulaThText, 'text-right')}
                  title="Mitjana diària calculada des de l'última entrada positiva d'estoc; si no n'hi ha, es calcula sobre els últims 180 dies."
                >
                  Mitj./dia
                </TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Dies fins mín.</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Sug. sem.</TableHead>
                <TableHead className={taulaThText}>Magatzem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.length > 0 && stockRowsFiltered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={16}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Cap article coincideix amb la cerca. Proveu altres paraules o buideu el camp.
                  </TableCell>
                </TableRow>
              ) : null}
              {stockRowsFiltered.map((r) => (
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
                    {r.quantityPendingTheoretical ?? 0}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums font-medium',
                      (r.quantityAvailableAfterTheoretical ?? 0) < 0 ? 'text-destructive' : undefined
                    )}
                  >
                    {r.quantityAvailableAfterTheoretical ?? (r.quantityAvailable ?? r.quantityOnHand)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.minStock ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.gapToMin}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.consumption6m}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.annualDeliveredCurrentYear}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.annualDeliveredPreviousYear}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.hasConsumptionHistory ? (
                      <span title={r.avgDailySource === 'since_last_inbound'
                        ? `Des de l'última entrada (${r.avgDailyWindowDays ?? 0} dies)`
                        : 'Calculat sobre els últims 180 dies'}>
                        {r.avgDaily.toFixed(2)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.atOrBelowMin
                      ? '—'
                      : formatDaysUntilMin(r.daysUntilMin)}
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

        {false ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground max-w-xl">
                <span className="font-medium text-foreground">Reconciliació de «Reservat».</span> Es compara el valor
                del producte amb la suma de les sol·licituds en estat preparat o recollit que tenen reserva d’estoc.
                Això permet netejar reserves «orfenes» (per exemple, d’abans que existís el registre de moviments) sense
                endevinar l’origen.
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reconcileBusy}
                  onClick={() => void runReservedReconcileCheck()}
                >
                  {reconcileBusy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden />
                      Analitzant…
                    </>
                  ) : (
                    'Comprovar reserva'
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    reconcileApplyBusy ||
                    !reconcileResult ||
                    reconcileResult.discrepancyCount === 0
                  }
                  onClick={() => void applyReservedReconcile()}
                >
                  {reconcileApplyBusy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden />
                      Aplicant…
                    </>
                  ) : (
                    'Corregir productes'
                  )}
                </Button>
              </div>
            </div>
            {reconcileResult && reconcileResult.discrepancyCount > 0 ? (
              <div className={taulaContentidorScroll}>
                <p className="text-xs text-muted-foreground mb-2">
                  {reconcileResult.contributingRequestCount} sol·licitud(s) amb reserva comptades ·{' '}
                  {reconcileResult.discrepancyCount} producte(s) amb diferència
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={taulaThText}>Codi</TableHead>
                      <TableHead className={taulaThText}>Article</TableHead>
                      <TableHead className={cn(taulaThText, 'text-right')}>Estoc</TableHead>
                      <TableHead className={cn(taulaThText, 'text-right')}>Reservat (ara)</TableHead>
                      <TableHead className={cn(taulaThText, 'text-right')}>Reservat (calculat)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconcileResult.discrepancies.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-mono text-xs">{row.code || '—'}</TableCell>
                        <TableCell className="text-sm max-w-[200px]">{row.name || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.quantityOnHand}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.currentReserved}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {row.expectedReserved}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : reconcileResult && reconcileResult.discrepancyCount === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tots els productes coincideixen amb les sol·licituds obertes amb reserva.
              </p>
            ) : null}
          </div>
        ) : null}

        {false ? (
          <div className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Esborrat general (petició explícita de gestió): elimina tots els documents de moviments d’estoc i posa el
              camp «Reservat» a 0 en tots els productes. No modifica el «Stock» físic. Irreversible.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={purgeAllBusy}
              onClick={() => void purgeAllStockMovementsAndReserved()}
            >
              {purgeAllBusy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden />
                  Esborrant…
                </>
              ) : (
                'Esborrar tots els moviments i zero reserva'
              )}
            </Button>
          </div>
        ) : null}
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setStockEntryOpen((open) => !open)}
          aria-expanded={stockEntryOpen}
        >
          <h2 className="font-semibold text-base">Entrada / ajust d’estoc</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              stockEntryOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {stockEntryOpen ? (
          <>
        {false ? (
          <p className="text-xs text-muted-foreground">
          Quantitat <strong className="font-medium text-foreground">positiva</strong> = entrada;
          <strong className="font-medium text-foreground"> negativa</strong> = sortida. Indiqueu el{' '}
          <strong className="font-medium text-foreground">tipus</strong> de moviment per deixar constància (compra,
          devolució, etc.). Les dates es mostren amb el format de l&apos;aplicació.
          </p>
        ) : null}
        <form
          className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            void registrar()
          }}
        >
          <div className="flex flex-col gap-3 min-w-0 md:flex-row md:flex-nowrap md:items-end md:gap-x-2 md:gap-y-2 lg:gap-x-3">
            <div className="space-y-1 min-w-0 w-full md:flex-1 md:basis-0 md:min-w-[10rem]">
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
            <div className="space-y-1 w-full min-w-[11rem] sm:min-w-[12.5rem] md:w-[12.5rem] md:shrink-0">
              <Label htmlFor="stock-move-reason" className="text-xs text-muted-foreground">
                Tipus de moviment
              </Label>
              <select
                id="stock-move-reason"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
              >
                <option value="manual_purchase">Compra / entrada</option>
                <option value="manual_return">Devolució de departament</option>
                <option value="manual_adjust">Ajust / inventari</option>
                <option value="manual">Altres (motiu genèric)</option>
              </select>
            </div>
            <div className="space-y-1 w-full min-w-[4.5rem] max-w-[6.5rem] md:w-20 md:max-w-none md:shrink-0">
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
            <div className="space-y-1 min-w-0 w-full md:flex-1 md:basis-0 md:min-w-[8rem]">
              <Label htmlFor="stock-move-notes" className="text-xs text-muted-foreground">
                Observacions (opcional)
              </Label>
              <Input
                id="stock-move-notes"
                className="h-9"
                placeholder="Ex.: proveïdor, departament, albarà…"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 w-full md:w-auto md:shrink-0">
              <Label className="text-xs text-muted-foreground md:invisible md:pointer-events-none md:select-none">
                Acció
              </Label>
              <Button
                type="submit"
                className="h-9 w-full md:w-auto shrink-0"
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
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setStockMovementsOpen((open) => !open)}
          aria-expanded={stockMovementsOpen}
        >
          <h2 className="font-semibold text-base">Tots els moviments</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              stockMovementsOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {stockMovementsOpen ? (
          <>
        {false && (
        <p className="text-xs text-muted-foreground">
          Ordre real: (1) Comanda preparada → apareix «Preparació · reserva al magatzem» i la columna «Reservat» puja; el
          producte encara és al magatzem. (2) Només després que el responsable registri l’entrega → moviment amb Δ negatiu;
          el tipus pot ser «Entrega pel responsable (pendent recepció treballador)» o «Entrega a treballador». Si «Reservat»
          mostra 2 i no veieu «Entrega…», és coherent: encara no s’ha registrat l’entrega; cerqueu «Preparació» o «reserva»
          als moviments (o ampliïu dates). Si tampoc no hi ha preparació, useu «Comprovar reserva» a la vista d’estoc.
        </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <SmartFilters
            modeDefault="month"
            modeOptions={['week', 'month', 'day', 'range']}
            role="Treballador"
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showAdvanced={false}
            compact
            onChange={handleMovSmartDateChange}
            resetSignal={movListFiltersResetSignal}
            initialStart={movListRangeStart}
            initialEnd={movListRangeEnd}
          />
          <div className="relative flex min-w-[12rem] flex-1 basis-[14rem] max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-10 rounded-xl border-gray-300 bg-white pl-9 dark:bg-background"
              placeholder="Cercar tipus, producte, ref. S-…/E-…/R-…, departament, usuari…"
              value={movListSearch}
              onChange={(e) => setMovListSearch(e.target.value)}
              aria-label="Cercar moviments"
            />
          </div>
          <ResetFilterButton
            onClick={() => {
              setMovListSearch('')
              setMovTypeFilters([])
              const w = robaMovimentsDefaultMonthRange()
              setMovListRangeStart(w.start)
              setMovListRangeEnd(w.end)
              setMovListFiltersResetSignal((n) => n + 1)
            }}
          />
        </div>
        {movementTypeOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Tipus:</span>
            {movementTypeOptions.map((option) => {
              const active = movTypeFilters.includes(option.key)
              return (
                <Button
                  key={option.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 rounded-full px-3 text-xs',
                    active && 'border-primary bg-primary/10 text-primary'
                  )}
                  onClick={() => toggleMovTypeFilter(option.key)}
                >
                  <span>{option.label}</span>
                  <Badge
                    variant={active ? 'default' : 'secondary'}
                    className="ml-2 min-w-5 justify-center px-1.5 py-0 text-[10px]"
                  >
                    {option.count}
                  </Badge>
                </Button>
              )
            })}
          </div>
        ) : null}
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={taulaThText}>Data</TableHead>
                <TableHead className={cn(taulaThText, 'min-w-[8.5rem]')}>Tipus</TableHead>
                <TableHead className={cn(taulaThText, 'min-w-[7rem] max-w-[10rem]')}>
                  Departament
                </TableHead>
                <TableHead className={taulaThText}>Producte</TableHead>
                <TableHead
                  className={cn(taulaThText, 'text-right')}
                  title="Canvi d’estoc físic. És 0 quan el moviment és només de reserva (vegeu Tipus i Obs.)."
                >
                  Δ
                </TableHead>
                <TableHead className={taulaThText}>Ref.</TableHead>
                <TableHead className={taulaThText}>Usuari</TableHead>
                <TableHead className={cn(taulaThText, 'max-w-[7rem]')}>Obs.</TableHead>
                <TableHead className={cn(taulaThText, 'w-[3rem] text-right')}> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length > 0 && movementsVisible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Cap moviment coincideix amb el període, la cerca o el tipus seleccionat.
                  </TableCell>
                </TableRow>
              ) : null}
              {movementsVisible.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap tabular-nums">
                    {formatDateTimeValue(m.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs leading-snug">
                    <Badge variant="outline" className="max-w-full whitespace-normal text-left leading-snug">
                      <span className="line-clamp-2" title={labelStockMovementReasonDisplay(m)}>
                        {labelStockMovementReasonDisplay(m)}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[10rem] text-muted-foreground">
                    <span className="line-clamp-2" title={stockMovementDepartmentLabel(m)}>
                      {stockMovementDepartmentLabel(m)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{prodLabel(m.productId)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{m.quantityDelta}</TableCell>
                  <TableCell className="text-xs font-mono">{m.reference || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[9rem]">
                    <span className="line-clamp-2" title={String(m.createdByUserName || '')}>
                      {String(m.createdByUserName || '').trim() || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-[7rem] text-muted-foreground">
                    <span className="line-clamp-2" title={String(m.notes || '')}>
                      {String(m.notes || '').trim() || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right p-1">
                    {isReversibleManualStockReason(m.reason) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deleteBusyId === m.id}
                        title="Eliminar moviment i revertir estoc"
                        aria-label="Eliminar moviment manual"
                        onClick={() => void eliminarMoviment(m)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground px-1" title={String(m.reason || '')}>
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
