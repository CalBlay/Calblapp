'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, Loader2, PenLine, Search, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import EventComandaSortableTh from '@/components/events/EventComandaSortableTh'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import {
  eventComandaWarehouseFilterBadgeClass,
  eventComandaWarehouseLabel,
} from '@/lib/eventComanda/warehouseColors'
import {
  buildArticleSearchPool,
  buildOrderLinesFromTemplate,
  filterOrderLinesByQuery,
  flattenTemplateLines,
  mergeWarehouseIntoOrderLines,
  searchArticles,
} from '@/lib/eventComanda/searchArticles'
import {
  loadOrderDraft,
  loadOrderDraftMeta,
  loadOrderDraftMode,
  saveOrderDraft,
  saveOrderDraftMeta,
  saveOrderDraftMode,
  clearOrderDraftMode,
  type OrderDraftSourceMode,
} from '@/lib/eventComanda/orderDraft'
import {
  EVENT_COMANDA_DELIVERY_SLOTS,
  formatDeliveryDateLabel,
  getAvailableDeliverySlotsForDate,
  isDeliveryDateWithinBounds,
  isDeliverySlotAvailableForDate,
  resolveDeliveryDateBounds,
  type EventComandaDeliveryDateBounds,
} from '@/lib/eventComanda/deliverySlots'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'
import type { EventComandaWarehouse } from '@/lib/eventComanda/warehouses.server'
import {
  COMANDA_LINE_DEFAULT_SORT_STACK,
  COMANDA_LINE_TEMPLATE_SORT_STACK,
  nextComandaLineSortStack,
  sortComandaLines,
  type ComandaLineSortKey,
  type ComandaLineSortSpec,
} from '@/lib/eventComanda/sortLines'
import type {
  EventComandaArticleOption,
  EventComandaLine,
  EventComandaOrderLine,
  EventComandaSendPayload,
} from '@/lib/eventComanda/types'
import {
  eventComandaActionBarClass,
  eventComandaPanelClass,
  eventComandaPrimaryButtonClass,
  eventComandaTableClass,
  eventComandaTableHeadCellClass,
  eventComandaTableRowClass,
  formatEventComandaQty,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type EditScope = {
  warehouseId: string
  batchId: string
  warehouseLabel: string
  warehouseCode?: string | null
  warehouseName?: string | null
}

const LARGE_LINE_LIST_THRESHOLD = 20

type Props = {
  eventId: string
  templateLinesByFamily: Record<string, EventComandaLine[]>
  mode?: 'create' | 'edit'
  /** Obre directament «Com començar la comanda?» sense restaurar esborrany. */
  forceSourcePick?: boolean
  initialLines?: EventComandaOrderLine[]
  initialDelivery?: {
    deliveryDate?: string | null
    deliveryTimeSlot?: string | null
    comments?: string | null
  }
  /** Modificació acotada a un lot de magatzem (sense tornar a demanar entrega). */
  editScope?: EditScope
  /** Rang de dates d'entrega (avui … fi esdeveniment). */
  deliveryDateBounds?: EventComandaDeliveryDateBounds
  onSendToWarehouse?: (payload: EventComandaSendPayload) => void
  onUpdateOrder?: (payload: EventComandaSendPayload) => void
  onCancelEdit?: () => void
  saving?: boolean
}

export default function EventComandaOrderEditor({
  eventId,
  templateLinesByFamily,
  mode = 'create',
  initialLines,
  initialDelivery,
  editScope,
  forceSourcePick = false,
  deliveryDateBounds: deliveryDateBoundsProp,
  onSendToWarehouse,
  onUpdateOrder,
  onCancelEdit,
  saving = false,
}: Props) {
  const isEditMode = mode === 'edit'
  const isWarehouseEdit = Boolean(editScope)
  const templateLines = useMemo(
    () => flattenTemplateLines(templateLinesByFamily),
    [templateLinesByFamily]
  )
  const [catalogArticles, setCatalogArticles] = useState<EventComandaArticleOption[]>([])
  const [catalogSearchLoading, setCatalogSearchLoading] = useState(false)
  const [orderLines, setOrderLines] = useState<EventComandaOrderLine[]>([])
  const [sourceMode, setSourceMode] = useState<'pick' | OrderDraftSourceMode>('pick')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightCode, setHighlightCode] = useState<string | null>(null)
  const [warehouseResolving, setWarehouseResolving] = useState(false)
  const [sortStack, setSortStack] = useState<ComandaLineSortSpec[]>(COMANDA_LINE_DEFAULT_SORT_STACK)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState('')
  const [comments, setComments] = useState('')
  const [lineFilter, setLineFilter] = useState('')
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([])
  const [warehouses, setWarehouses] = useState<EventComandaWarehouse[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const resolveRequestId = useRef(0)
  const forceSourcePickInitializedRef = useRef(false)

  const deliveryDateBounds = useMemo(
    () => deliveryDateBoundsProp ?? resolveDeliveryDateBounds(null),
    [deliveryDateBoundsProp]
  )

  const availableDeliverySlots = useMemo(
    () => getAvailableDeliverySlotsForDate(deliveryDate),
    [deliveryDate]
  )

  const availableDeliverySlotSet = useMemo(
    () => new Set(availableDeliverySlots),
    [availableDeliverySlots]
  )

  useEffect(() => {
    let cancelled = false
    setWarehousesLoading(true)
    void fetch('/api/event-comanda/warehouses')
      .then((res) => res.json())
      .then((json: { warehouses?: EventComandaWarehouse[] }) => {
        if (cancelled) return
        setWarehouses(
          Array.isArray(json.warehouses)
            ? json.warehouses.filter((warehouse) => warehouse.isActive !== false)
            : []
        )
      })
      .catch(() => {
        if (!cancelled) setWarehouses([])
      })
      .finally(() => {
        if (!cancelled) setWarehousesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const resolveTemplateWarehouses = useCallback(async (lines: EventComandaOrderLine[]) => {
    if (lines.length === 0) return

    const requestId = ++resolveRequestId.current
    setWarehouseResolving(true)

    try {
      const res = await fetch('/api/event-comanda/articles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((line) => ({
            articleCode: line.articleCode,
            articleName: line.articleName,
            family: line.family,
            qtyUnit: line.qtyUnit,
          })),
        }),
      })

      if (requestId !== resolveRequestId.current) return

      const json = (await res.json()) as {
        articles?: Array<{
          articleCode: string
          warehouseId: string | null
          warehouseCode: string | null
          warehouseName: string | null
        }>
        error?: string
      }

      if (!res.ok || !Array.isArray(json.articles)) return

      setOrderLines((prev) => mergeWarehouseIntoOrderLines(prev, json.articles!))
    } catch {
      // La taula segueix usable sense magatzem; es resoldrà en enviar.
    } finally {
      if (requestId === resolveRequestId.current) {
        setWarehouseResolving(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isEditMode) {
      forceSourcePickInitializedRef.current = false
      setOrderLines(initialLines || [])
      setSourceMode('scratch')
      setDeliveryDate(initialDelivery?.deliveryDate || '')
      setDeliveryTimeSlot(initialDelivery?.deliveryTimeSlot || '')
      setComments(initialDelivery?.comments || '')
      return
    }

    if (forceSourcePick) {
      if (!forceSourcePickInitializedRef.current) {
        forceSourcePickInitializedRef.current = true
        setOrderLines([])
        setSourceMode(templateLines.length > 0 ? 'pick' : 'scratch')
        setDeliveryDate(initialDelivery?.deliveryDate || '')
        setDeliveryTimeSlot(initialDelivery?.deliveryTimeSlot || '')
        setComments(initialDelivery?.comments || '')
      }
      return
    }

    forceSourcePickInitializedRef.current = false

    const draft = loadOrderDraft(eventId)
    const savedMode = loadOrderDraftMode(eventId)
    setOrderLines(draft)

    if (draft.length > 0) {
      const draftMode = savedMode === 'template' ? 'template' : 'scratch'
      setSourceMode(draftMode)
      if (
        draftMode === 'template' &&
        draft.some((line) => !line.warehouseId && !line.warehouseCode && !line.warehouseName)
      ) {
        void resolveTemplateWarehouses(draft)
      }
      return
    }

    if (templateLines.length === 0) {
      setSourceMode('scratch')
      return
    }

    if (savedMode === 'scratch') {
      setSourceMode('scratch')
      return
    }

    setSourceMode('pick')
  }, [eventId, forceSourcePick, initialDelivery, initialLines, isEditMode, templateLines.length, resolveTemplateWarehouses])

  useEffect(() => {
    if (isEditMode || forceSourcePick) return
    const meta = loadOrderDraftMeta(eventId)
    setDeliveryDate(meta.deliveryDate || '')
    setDeliveryTimeSlot(meta.deliveryTimeSlot || '')
    setComments(meta.comments || '')
  }, [eventId, forceSourcePick, isEditMode])

  useEffect(() => {
    if (isEditMode || forceSourcePick) return
    saveOrderDraft(eventId, orderLines)
  }, [eventId, forceSourcePick, isEditMode, orderLines])

  useEffect(() => {
    if (isEditMode || forceSourcePick) return
    saveOrderDraftMeta(eventId, {
      deliveryDate,
      deliveryTimeSlot,
      comments,
    })
  }, [comments, deliveryDate, deliveryTimeSlot, eventId, forceSourcePick, isEditMode])

  const showSearch = isEditMode || sourceMode !== 'pick'
  const showDelivery = showSearch && !isWarehouseEdit

  useEffect(() => {
    if (!showDelivery) return

    if (deliveryDate && !isDeliveryDateWithinBounds(deliveryDate, deliveryDateBounds)) {
      setDeliveryDate('')
      setDeliveryTimeSlot('')
      return
    }

    if (
      deliveryDate &&
      deliveryTimeSlot &&
      !isDeliverySlotAvailableForDate(deliveryDate, deliveryTimeSlot)
    ) {
      setDeliveryTimeSlot('')
    }
  }, [deliveryDate, deliveryTimeSlot, deliveryDateBounds, showDelivery])

  const handleDeliveryDateChange = (value: string) => {
    setDeliveryDate(value)
    if (value && deliveryTimeSlot && !isDeliverySlotAvailableForDate(value, deliveryTimeSlot)) {
      setDeliveryTimeSlot('')
    }
  }

  useEffect(() => {
    if (sourceMode === 'pick') {
      clearOrderDraftMode(eventId)
      return
    }
    saveOrderDraftMode(eventId, sourceMode)
  }, [eventId, sourceMode])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setCatalogArticles([])
      setCatalogSearchLoading(false)
      return
    }

    let cancelled = false
    setCatalogSearchLoading(true)
    const params = new URLSearchParams({ q: debouncedSearch, limit: '25' })
    void fetch(`/api/event-comanda/articles?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { articles: [] }))
      .then((json: { articles?: Array<Record<string, unknown>> }) => {
        if (cancelled) return
        const articles = Array.isArray(json.articles) ? json.articles : []
        setCatalogArticles(
          articles.map((article) => ({
            articleCode: String(article.articleCode || '').trim().toUpperCase(),
            articleName: String(article.articleName || '').trim(),
            family: String(article.family || '').trim(),
            qtyUnit: String(article.qtyUnit || ''),
            qtyTemplate: null,
            inTemplate: false,
            warehouseId: (article.warehouseId as string | null | undefined) ?? null,
            warehouseCode: (article.warehouseCode as string | null | undefined) ?? null,
            warehouseName: (article.warehouseName as string | null | undefined) ?? null,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setCatalogArticles([])
      })
      .finally(() => {
        if (!cancelled) setCatalogSearchLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  const searchPool = useMemo(
    () => buildArticleSearchPool(templateLines, catalogArticles),
    [templateLines, catalogArticles]
  )

  const searchResults = useMemo(() => searchArticles(searchPool, search), [searchPool, search])

  useEffect(() => {
    if (!searchOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [searchOpen])

  const addArticle = (article: EventComandaArticleOption) => {
    const code = article.articleCode.toUpperCase()
    const existing = orderLines.find((line) => line.articleCode.toUpperCase() === code)
    if (existing) {
      setHighlightCode(code)
      qtyRefs.current[code]?.focus()
      setSearch('')
      setSearchOpen(false)
      return
    }

    const nextLine: EventComandaOrderLine = {
      articleCode: article.articleCode,
      articleName: article.articleName,
      family: article.family,
      qtyUnit: article.qtyUnit,
      qtyTemplate: article.qtyTemplate,
      qtyRequested: null,
      warehouseId: article.warehouseId ?? null,
      warehouseCode: article.warehouseCode ?? null,
      warehouseName: article.warehouseName ?? null,
    }
    setOrderLines((prev) => [...prev, nextLine])
    setSearch('')
    setSearchOpen(false)
    setHighlightCode(code)
    window.setTimeout(() => qtyRefs.current[code]?.focus(), 0)

    if (isWarehouseEdit) {
      void resolveTemplateWarehouses([nextLine])
    }
  }

  const updateQty = (code: string, raw: string) => {
    const parsed = raw.replace(',', '.')
    if (!isEditMode && sourceMode === 'scratch' && parsed !== '') {
      const qty = Number(parsed)
      if (Number.isFinite(qty) && qty === 0) {
        removeLine(code)
        return
      }
    }
    setOrderLines((prev) =>
      prev.map((line) => {
        if (line.articleCode.toUpperCase() !== code.toUpperCase()) return line
        if (parsed === '') return { ...line, qtyRequested: null }
        const qty = Number(parsed)
        if (!Number.isFinite(qty) || qty < 0) return line
        return { ...line, qtyRequested: qty }
      })
    )
  }

  const handleQtyBlur = (code: string) => {
    if (isEditMode || sourceMode === 'template') return
    const line = orderLines.find(
      (entry) => entry.articleCode.toUpperCase() === code.toUpperCase()
    )
    if (!line) return
    if (line.qtyRequested == null || Number(line.qtyRequested) <= 0) {
      removeLine(code)
    }
  }

  const removeLine = (code: string) => {
    setOrderLines((prev) => prev.filter((line) => line.articleCode.toUpperCase() !== code.toUpperCase()))
    if (highlightCode === code) setHighlightCode(null)
  }

  const startFromTemplate = () => {
    const lines = buildOrderLinesFromTemplate(templateLines)
    setOrderLines(lines)
    setSourceMode('template')
    setSearch('')
    setSearchOpen(false)
    setLineFilter('')
    setSelectedWarehouseIds([])
    setSortStack(COMANDA_LINE_TEMPLATE_SORT_STACK)
    void resolveTemplateWarehouses(lines)
  }

  const startFromScratch = () => {
    setOrderLines([])
    setSourceMode('scratch')
    setSearch('')
    setSearchOpen(false)
    setLineFilter('')
    setSelectedWarehouseIds([])
  }

  const returnToSourcePick = () => {
    if (
      orderLines.length > 0 &&
      !window.confirm('Vols tornar a triar l\'origen? Es perdran les línies actuals de la comanda.')
    ) {
      return
    }
    resolveRequestId.current += 1
    setWarehouseResolving(false)
    setOrderLines([])
    setSourceMode('pick')
    setSearch('')
    setSearchOpen(false)
    setLineFilter('')
    setSelectedWarehouseIds([])
  }

  const validLines = orderLines.filter(
    (line) => line.qtyRequested != null && line.qtyRequested > 0
  )

  const showZeroQtyLines = isEditMode || sourceMode === 'template'

  const visibleOrderLines = useMemo(() => {
    if (showZeroQtyLines) return orderLines
    return orderLines.filter(
      (line) => line.qtyRequested == null || Number(line.qtyRequested) > 0
    )
  }, [orderLines, showZeroQtyLines])

  const warehouseLineOptions = useMemo(() => {
    const seen = new Map<
      string,
      { label: string; warehouseName: string | null; warehouseCode: string | null }
    >()
    for (const line of orderLines) {
      const key = warehouseDocId(line.warehouseId || '')
      if (!key || seen.has(key)) continue
      const warehouseName = String(line.warehouseName || '').trim() || null
      const warehouseCode = String(line.warehouseCode || '').trim() || null
      const label = eventComandaWarehouseLabel(warehouseName, warehouseCode) || key
      seen.set(key, { label, warehouseName, warehouseCode })
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ca', { sensitivity: 'base' }))
      .map(([id, meta]) => ({ id, ...meta }))
  }, [orderLines])

  const filteredOrderLines = useMemo(() => {
    let lines = filterOrderLinesByQuery(visibleOrderLines, lineFilter)
    if (!isWarehouseEdit && selectedWarehouseIds.length > 0) {
      const allowed = new Set(selectedWarehouseIds)
      lines = lines.filter((line) =>
        allowed.has(warehouseDocId(line.warehouseId || ''))
      )
    }
    return lines
  }, [isWarehouseEdit, lineFilter, selectedWarehouseIds, visibleOrderLines])

  const sortedOrderLines = useMemo(
    () => sortComandaLines(filteredOrderLines, sortStack),
    [filteredOrderLines, sortStack]
  )

  const showLineFilters =
    orderLines.length > 0 &&
    (sourceMode === 'template' ||
      visibleOrderLines.length >= LARGE_LINE_LIST_THRESHOLD ||
      warehouseLineOptions.length > 1)

  const hasActiveLineFilters =
    Boolean(lineFilter.trim()) ||
    (!isWarehouseEdit && selectedWarehouseIds.length > 0)

  const resetLineFilters = () => {
    setLineFilter('')
    setSelectedWarehouseIds([])
  }

  const toggleWarehouseLineFilter = (warehouseId: string) => {
    setSelectedWarehouseIds((prev) => {
      if (prev.includes(warehouseId)) {
        return prev.filter((id) => id !== warehouseId)
      }
      return [...prev, warehouseId]
    })
  }

  const handleSort = (key: ComandaLineSortKey) => {
    setSortStack((prev) => nextComandaLineSortStack(prev, key))
  }

  const updateLineWarehouse = (articleCode: string, warehouseId: string) => {
    const normalizedId = warehouseDocId(warehouseId)
    const warehouse = warehouses.find((entry) => warehouseDocId(entry.id) === normalizedId)
    setOrderLines((prev) =>
      prev.map((line) => {
        if (line.articleCode !== articleCode) return line
        if (!normalizedId || !warehouse) {
          return {
            ...line,
            warehouseId: null,
            warehouseCode: null,
            warehouseName: null,
          }
        }
        return {
          ...line,
          warehouseId: normalizedId,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
        }
      })
    )
  }

  const linesMissingWarehouse = useMemo(
    () =>
      validLines.some((line) => {
        const key = warehouseDocId(line.warehouseId || '')
        return !key || key === '_UNASSIGNED'
      }),
    [validLines]
  )

  const canSend =
    validLines.length > 0 &&
    !linesMissingWarehouse &&
    Boolean(deliveryDate.trim()) &&
    Boolean(deliveryTimeSlot.trim()) &&
    isDeliveryDateWithinBounds(deliveryDate, deliveryDateBounds) &&
    isDeliverySlotAvailableForDate(deliveryDate, deliveryTimeSlot)

  const templateLineCount = templateLines.length

  const deliverySection =
    showDelivery ? (
      <div className={cn(eventComandaPanelClass, 'space-y-3')}>
        <div>
          <h3 className={typography('cardTitle')}>Entrega al magatzem</h3>
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-600')}>
            Només el dia i la franja horària són obligatoris.
            {isWarehouseEdit ? ' La data d\'entrega és comuna a tots els magatzems.' : null}
            {' '}
            Entre {formatDeliveryDateLabel(deliveryDateBounds.minDate)} i{' '}
            {formatDeliveryDateLabel(deliveryDateBounds.maxDate)}.
          </p>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="space-y-1.5 shrink-0">
            <Label htmlFor={`delivery-date-${eventId}`}>Dia d&apos;entrega</Label>
            <Input
              id={`delivery-date-${eventId}`}
              type="date"
              min={deliveryDateBounds.minDate}
              max={deliveryDateBounds.maxDate}
              value={deliveryDate}
              onChange={(event) => handleDeliveryDateChange(event.target.value)}
              className="h-11 w-full min-w-[10.5rem]"
              required
            />
          </div>
          <div className="space-y-1.5 shrink-0">
            <Label htmlFor={`delivery-slot-${eventId}`}>Franja horària</Label>
            <select
              id={`delivery-slot-${eventId}`}
              value={deliveryTimeSlot}
              onChange={(event) => setDeliveryTimeSlot(event.target.value)}
              className="flex h-11 w-full min-w-[11rem] rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              required
            >
              <option value="">Tria una franja…</option>
              {EVENT_COMANDA_DELIVERY_SLOTS.filter((slot) =>
                availableDeliverySlotSet.has(slot.id)
              ).map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
            {deliveryDate && availableDeliverySlots.length === 0 ? (
              <p className={cn(typography('bodySm'), 'text-amber-700')}>
                No queden franges disponibles per avui. Tria un altre dia.
              </p>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`delivery-comments-${eventId}`}>Comentaris (opcional)</Label>
            <Input
              id={`delivery-comments-${eventId}`}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Instruccions d'entrega, accessos, contacte…"
              className="h-11"
            />
          </div>
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-4">
      {isEditMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={typography('sectionTitle')}>
            {isWarehouseEdit
              ? `Modificar comanda · ${editScope!.warehouseLabel}`
              : 'Modificar comanda'}
          </h2>
          {onCancelEdit ? (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onCancelEdit}>
              <X className="h-4 w-4" />
              Cancel·lar
            </Button>
          ) : null}
        </div>
      ) : onCancelEdit && sourceMode !== 'pick' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={typography('sectionTitle')}>Nova comanda</h2>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
            Cancel·lar
          </Button>
        </div>
      ) : null}

      {showSearch ? (
        <div ref={searchRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              placeholder="Cerca articles per afegir a la comanda…"
              className="min-h-11 pl-9 text-base"
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value)
                setSearchOpen(true)
              }}
            />
          </div>

          {searchOpen && search.trim() ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {catalogSearchLoading ? (
                <p className="px-3 py-4 text-sm text-slate-500">Cercant articles…</p>
              ) : debouncedSearch.length < 2 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Escriu almenys 2 caràcters per cercar al catàleg.</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">Cap article trobat.</p>
              ) : (
                <ul className="p-1">
                  {searchResults.map((article) => (
                    <li key={article.articleCode}>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-100"
                        onClick={() => addArticle(article)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 break-words">
                              {article.articleName}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-slate-500">
                              {article.articleCode}
                              {article.family ? ` · ${article.family}` : ''}
                            </p>
                          </div>
                          {article.qtyTemplate != null ? (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              Plantilla: {formatEventComandaQty(article.qtyTemplate, article.qtyUnit)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] text-slate-400">Fora plantilla</span>
                          )}
                        </div>
                        {article.warehouseName || article.warehouseCode ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {article.warehouseName || article.warehouseCode}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {deliverySection}

      <div className={eventComandaPanelClass}>
        {sourceMode === 'pick' ? (
          <div className="px-4 py-8 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className={typography('sectionTitle')}>Com començar la comanda?</p>
              <p className={cn(typography('bodyMd'), 'mt-2 text-slate-600')}>
                Tria si vols partir de la plantilla ERP importada o crear la comanda manualment.
              </p>
            </div>
            <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2 sm:gap-4">
              <button
                type="button"
                className="flex min-h-[9rem] flex-col items-start rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 sm:p-5"
                onClick={startFromTemplate}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span className={cn(typography('cardTitle'), 'mt-3')}>Des de la plantilla</span>
                <span className={cn(typography('bodySm'), 'mt-1.5 text-slate-600')}>
                  Carrega els {templateLineCount} articles de l&apos;Excel amb quantitat 0. Indica
                  només les que necessitis; en enviar, només es demanaran les línies amb quantitat
                  superior a 0.
                </span>
              </button>
              <button
                type="button"
                className="flex min-h-[9rem] flex-col items-start rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 sm:p-5"
                onClick={startFromScratch}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
                  <PenLine className="h-5 w-5" />
                </span>
                <span className={cn(typography('cardTitle'), 'mt-3')}>Des de zero</span>
                <span className={cn(typography('bodySm'), 'mt-1.5 text-slate-600')}>
                  Comença amb una llista buida i afegeix articles amb la cerca. La quantitat de la
                  plantilla es mostra com a referència.
                </span>
              </button>
            </div>
          </div>
        ) : orderLines.length === 0 ? (
          <div className="py-10 text-center">
            <p className={typography('sectionTitle')}>
              {isWarehouseEdit
                ? 'Cap article a la comanda'
                : sourceMode === 'template'
                  ? 'Plantilla sense línies'
                  : 'Nova comanda'}
            </p>
            <p className={cn(typography('bodyMd'), 'mt-2 text-slate-600')}>
              {isWarehouseEdit
                ? 'Encara no hi ha articles en aquest magatzem.'
                : sourceMode === 'template'
                  ? 'La plantilla importada no conté articles. Pots afegir-los manualment amb la cerca.'
                  : 'Cerca articles per afegir-los. La quantitat de la plantilla es mostra com a referència.'}
            </p>
            {templateLineCount > 0 ? (
              <button
                type="button"
                className="mt-4 text-sm font-medium text-amber-800 underline-offset-2 hover:underline"
                onClick={returnToSourcePick}
              >
                Tornar a triar origen
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {showLineFilters || warehouseResolving ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                {warehouseResolving ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Assignant magatzems…
                  </span>
                ) : null}
                {showLineFilters ? (
                  <>
                    <div className="relative min-w-[10rem] flex-1 basis-[12rem]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={lineFilter}
                        placeholder="Filtra per codi o nom…"
                        className="h-9 pl-9 text-sm"
                        onChange={(event) => setLineFilter(event.target.value)}
                      />
                    </div>
                    {!isWarehouseEdit && warehouseLineOptions.length > 1 ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {warehouseLineOptions.map((option) => {
                          const active = selectedWarehouseIds.includes(option.id)
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => toggleWarehouseLineFilter(option.id)}
                              className={eventComandaWarehouseFilterBadgeClass(
                                option.warehouseName,
                                option.warehouseCode,
                                active
                              )}
                              title={option.label}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                    {hasActiveLineFilters ? (
                      <>
                        <span className="shrink-0 text-xs text-slate-500">
                          {filteredOrderLines.length} de {visibleOrderLines.length}
                        </span>
                        <ResetFilterButton onClick={resetLineFilters} />
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            <div
              className={cn(
                'overflow-x-auto',
                sourceMode === 'template' && 'max-h-[min(32rem,55vh)] overflow-y-auto'
              )}
            >
              <table className={eventComandaTableClass}>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <EventComandaSortableTh
                      label="Codi"
                      sortKey="code"
                      sortStack={sortStack}
                      onSort={handleSort}
                    />
                    <EventComandaSortableTh
                      label="Article"
                      sortKey="name"
                      sortStack={sortStack}
                      onSort={handleSort}
                    />
                    <EventComandaSortableTh
                      label="Magatzem"
                      sortKey="warehouse"
                      sortStack={sortStack}
                      onSort={handleSort}
                    />
                    <th className={cn(eventComandaTableHeadCellClass, 'text-right')}>Plantilla</th>
                    <EventComandaSortableTh
                      label="Quantitat"
                      sortKey="qty"
                      sortStack={sortStack}
                      onSort={handleSort}
                      align="right"
                    />
                    <th className={cn(eventComandaTableHeadCellClass, 'w-16 text-right')}>U.</th>
                    <th className={cn(eventComandaTableHeadCellClass, 'w-10')} />
                  </tr>
                </thead>
                <tbody>
                  {sortedOrderLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        Cap línia coincideix amb el filtre.
                      </td>
                    </tr>
                  ) : (
                    sortedOrderLines.map((line) => {
                    const codeKey = line.articleCode.toUpperCase()
                    const qtyValue =
                      line.qtyRequested == null
                        ? ''
                        : Number.isInteger(line.qtyRequested)
                          ? String(line.qtyRequested)
                          : String(line.qtyRequested)

                    const lineWarehouseKey = warehouseDocId(line.warehouseId || '')
                    const editWarehouseKey = warehouseDocId(editScope?.warehouseId || '')
                    const lineGoesElsewhere =
                      isWarehouseEdit &&
                      Boolean(lineWarehouseKey) &&
                      Boolean(editWarehouseKey) &&
                      lineWarehouseKey !== editWarehouseKey

                    return (
                      <tr
                        key={codeKey}
                        className={cn(
                          eventComandaTableRowClass,
                          highlightCode === codeKey && 'bg-amber-50/80'
                        )}
                      >
                        <td className="px-3 py-2 align-top font-mono text-xs text-slate-600">
                          {line.articleCode}
                        </td>
                        <td className={cn(typography('bodyMd'), 'px-3 py-2 align-top break-words')}>
                          {line.articleName}
                        </td>
                        <td
                          className={cn(
                            'max-w-[9.5rem] px-3 py-2 align-top text-xs',
                            lineGoesElsewhere ? 'text-amber-800' : 'text-slate-600'
                          )}
                        >
                          <select
                            value={lineWarehouseKey || ''}
                            onChange={(event) =>
                              updateLineWarehouse(line.articleCode, event.target.value)
                            }
                            className={cn(
                              'h-9 w-full min-w-[7.5rem] rounded-lg border bg-white px-2 text-xs font-medium shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
                              lineGoesElsewhere
                                ? 'border-amber-300 text-amber-900'
                                : 'border-slate-200 text-slate-700'
                            )}
                            disabled={warehousesLoading}
                            aria-label={`Magatzem per a ${line.articleName}`}
                          >
                            <option value="">
                              {warehouseResolving && sourceMode === 'template' && !lineWarehouseKey
                                ? 'Assignant…'
                                : 'Tria magatzem…'}
                            </option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name || warehouse.code}
                              </option>
                            ))}
                          </select>
                          {lineGoesElsewhere ? (
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              Altre magatzem
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right align-top text-xs tabular-nums text-slate-500">
                          {line.qtyTemplate != null
                            ? formatEventComandaQty(line.qtyTemplate, line.qtyUnit)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <Input
                            ref={(node) => {
                              qtyRefs.current[codeKey] = node
                            }}
                            type="text"
                            inputMode="decimal"
                            value={qtyValue}
                            placeholder="0"
                            className="ml-auto h-9 w-24 text-right tabular-nums"
                            onChange={(event) => updateQty(line.articleCode, event.target.value)}
                            onBlur={() => handleQtyBlur(codeKey)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right align-top text-xs font-semibold uppercase text-slate-600">
                          {eventComandaQtyUnit(line.qtyUnit)}
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Treure ${line.articleName}`}
                            onClick={() => removeLine(line.articleCode)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showSearch ? (
        <div className={eventComandaActionBarClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isEditMode ? (
              <span />
            ) : templateLineCount > 0 ? (
              <button
                type="button"
                className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                onClick={returnToSourcePick}
              >
                Tornar a triar origen
              </button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              className={cn(eventComandaPrimaryButtonClass, 'gap-2')}
              disabled={!canSend || saving}
              title={
                validLines.length === 0
                  ? 'Indica quantitat en almenys una línia'
                  : linesMissingWarehouse
                    ? 'Selecciona magatzem en totes les línies amb quantitat'
                    : !isWarehouseEdit && (!deliveryDate.trim() || !deliveryTimeSlot.trim())
                      ? 'Indica dia i franja horària d\'entrega'
                      : undefined
              }
              onClick={() => {
                const payload: EventComandaSendPayload = {
                  lines: validLines,
                  deliveryDate: deliveryDate.trim(),
                  deliveryTimeSlot: deliveryTimeSlot.trim(),
                  comments: comments.trim() || undefined,
                  ...(isWarehouseEdit && editScope
                    ? {
                        warehouseId: editScope.warehouseId,
                        batchId: editScope.batchId,
                      }
                    : {}),
                }
                if (isEditMode) {
                  onUpdateOrder?.(payload)
                } else {
                  onSendToWarehouse?.(payload)
                }
              }}
            >
              {isEditMode ? (
                <PenLine className="h-4 w-4 shrink-0" />
              ) : (
                <Send className="h-4 w-4 shrink-0" />
              )}
              {saving
                ? isEditMode
                  ? 'Desant…'
                  : 'Enviant…'
                : isEditMode
                  ? 'Desar canvis'
                  : 'Enviar'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
