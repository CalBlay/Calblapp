'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { AlertTriangle, ChevronDown, ClipboardPen, Loader2, MessageCircle, PackagePlus, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AllowedPreparationWarehouse } from '@/components/logistics/PreparationWarehouseToggles'
import type {
  LogisticsEventPrepRow,
  PreparationArticleSelection,
  PreparationMissingArticle,
  PreparationWarehouseForm,
} from '@/lib/logistics/prepTypes'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { getPreparationEventName } from '@/lib/logistics/prepTypes'
import { cn } from '@/lib/utils'

const PreparationOpsPanel = dynamic(
  () => import('@/components/logistics/PreparationOpsPanel'),
  { ssr: false }
)

type CatalogPurpose =
  | 'machinery'
  | 'small_machinery'
  | 'logistics_pack'
  | 'pallet_jack'
  | 'assigned'

type CatalogArticle = {
  articleCode: string
  articleName: string
  warehouseId: string
  warehouseName: string
  totalStock: number
  reservedStock: number
  availableStock: number
}

type EventInterval = {
  startKey: string
  endKey: string
  startLabel: string
  endLabel: string
}

const EMPTY_INTERVAL: EventInterval = { startKey: '', endKey: '', startLabel: '', endLabel: '' }

function emptyForm(eventRowId: string, warehouseCode: PreparationWarehouseCode): PreparationWarehouseForm {
  return {
    eventRowId,
    warehouseCode,
    carts: 0,
    euroPallets: 0,
    americanPallets: 0,
    racks: 0,
    gelPileBags: 0,
    gelStoneBags: 0,
    gelMojitoBags: 0,
    machinery: [],
    smallMachinery: [],
    logisticsPacks: [],
    palletJacks: [],
    missingArticles: [],
    notes: '',
    status: 'draft',
  }
}

function QuantityField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const update = (next: number) => onChange(Math.max(0, Math.min(9999, Math.floor(next) || 0)))
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <Label className="block text-sm font-semibold text-slate-700">{label}</Label>
      <div className="grid grid-cols-[2.75rem_minmax(3.5rem,1fr)_2.75rem] gap-2">
        <Button type="button" variant="outline" className="h-11 w-full p-0 text-xl" onClick={() => update(value - 1)}>
          −
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(event) => update(Number(event.target.value))}
          className="h-11 min-w-0 px-1 text-center text-lg font-bold"
        />
        <Button type="button" variant="outline" className="h-11 w-full p-0 text-xl" onClick={() => update(value + 1)}>
          +
        </Button>
      </div>
    </div>
  )
}

function SelectedArticleRows({
  items,
  onChange,
}: {
  items: PreparationArticleSelection[]
  onChange: (items: PreparationArticleSelection[]) => void
}) {
  if (!items.length) return null
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.articleCode} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">{item.articleName}</div>
            <div className="text-xs text-slate-500">{item.articleCode}</div>
          </div>
          <Input
            aria-label={`Quantitat de ${item.articleName}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={item.quantity}
            onChange={(event) => {
              const quantity = Math.max(1, Math.floor(Number(event.target.value)) || 1)
              onChange(items.map((row) => row.articleCode === item.articleCode ? { ...row, quantity } : row))
            }}
            className="h-11 w-20 bg-white text-center font-bold"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-11 w-11 text-red-600"
            aria-label={`Eliminar ${item.articleName}`}
            onClick={() => onChange(items.filter((row) => row.articleCode !== item.articleCode))}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function ArticlePicker({
  rowId,
  warehouseCode,
  purpose,
  title,
  description,
  selected,
  onChange,
  allowCreate = false,
  showSelectedItems = true,
}: {
  rowId: string
  warehouseCode: PreparationWarehouseCode
  purpose: CatalogPurpose
  title: string
  description: string
  selected: PreparationArticleSelection[]
  onChange: (items: PreparationArticleSelection[]) => void
  allowCreate?: boolean
  showSelectedItems?: boolean
}) {
  const [query, setQuery] = useState('')
  const [articles, setArticles] = useState<CatalogArticle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStock, setNewStock] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const requiresSearch = purpose === 'assigned'

  const load = useCallback(async () => {
    if (requiresSearch && query.trim().length < 2) {
      setArticles([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ rowId, warehouse: warehouseCode, purpose })
      if (query.trim()) params.set('q', query.trim())
      const response = await fetch(`/api/logistics/preparation-catalog?${params.toString()}`, { cache: 'no-store' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut carregar el catàleg.'))
      setArticles(Array.isArray(json.articles) ? json.articles : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No s’ha pogut carregar el catàleg.')
    } finally {
      setLoading(false)
    }
  }, [purpose, query, requiresSearch, rowId, warehouseCode])

  useEffect(() => {
    if (!expanded) return
    const timer = window.setTimeout(() => void load(), 450)
    return () => window.clearTimeout(timer)
  }, [expanded, load])

  useEffect(() => {
    setExpanded(false)
    setQuery('')
    setArticles([])
    setError('')
  }, [purpose, rowId, warehouseCode])

  const addArticle = (article: CatalogArticle) => {
    if (selected.some((item) => item.articleCode === article.articleCode)) return
    onChange([...selected, { articleCode: article.articleCode, articleName: article.articleName, quantity: 1 }])
  }

  const createArticle = async () => {
    if (!newName.trim() || purpose === 'assigned') return
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/logistics/preparation-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, name: newName.trim(), stock: newStock, warehouse: warehouseCode }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut crear l’article.'))
      const article = json.article as CatalogArticle
      addArticle(article)
      setNewName('')
      setNewStock(1)
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No s’ha pogut crear l’article.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        className="flex min-h-11 w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          <span className="block font-semibold text-slate-900">{title}</span>
          <span className="block text-xs text-slate-500">{description}</span>
          {selected.length ? (
            <span className="mt-1 block text-xs font-semibold text-emerald-700">
              {selected.length} {selected.length === 1 ? 'article seleccionat' : 'articles seleccionats'}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            'mt-1 h-5 w-5 shrink-0 text-slate-500 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {showSelectedItems ? <SelectedArticleRows items={selected} onChange={onChange} /> : null}
      {expanded ? <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca per nom o codi…"
          className="h-12 pl-9"
        />
      </div>
      {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregant…</div> : null}
      {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {!loading && requiresSearch && query.trim().length < 2 ? (
          <p className="text-sm text-slate-500">Escriu almenys 2 caràcters per cercar.</p>
        ) : null}
        {!loading && (!requiresSearch || query.trim().length >= 2) && !articles.length ? (
          <p className="text-sm text-slate-500">No s’han trobat articles.</p>
        ) : null}
        {articles.map((article) => {
          const isSelected = selected.some((item) => item.articleCode === article.articleCode)
          const unavailable = purpose !== 'assigned' && article.availableStock < 1
          return (
            <button
              key={article.articleCode}
              type="button"
              disabled={isSelected || unavailable}
              onClick={() => addArticle(article)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{article.articleName}</span>
                <span className="block text-xs text-slate-500">{article.articleCode}</span>
              </span>
              {purpose === 'assigned' ? (
                <Plus className="h-5 w-5 text-emerald-600" />
              ) : (
                <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs font-semibold', unavailable ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                  {article.availableStock}/{article.totalStock}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {allowCreate ? (
        <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><PackagePlus className="h-4 w-4" /> Crear article nou</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nom de l’article" className="h-11 bg-white" />
            <Input type="number" min={1} inputMode="numeric" value={newStock} onChange={(event) => setNewStock(Math.max(1, Number(event.target.value) || 1))} className="h-11 bg-white" aria-label="Unitats totals" />
            <Button type="button" variant="outline" className="h-11" disabled={creating || !newName.trim()} onClick={() => void createArticle()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear
            </Button>
          </div>
        </div>
      ) : null}
      </> : null}
    </section>
  )
}

function MissingArticlesEditor({
  items,
  onChange,
}: {
  items: PreparationMissingArticle[]
  onChange: (items: PreparationMissingArticle[]) => void
}) {
  if (!items.length) return null
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      {items.map((item) => (
        <div
          key={item.articleCode}
          className={cn(
            'space-y-2 rounded-xl border p-3 transition-colors',
            item.prepared
              ? 'border-emerald-200 bg-emerald-50/80'
              : 'border-transparent bg-white'
          )}
        >
          <div className="flex flex-wrap items-start gap-2">
            <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={item.prepared === true}
                onChange={(event) => onChange(items.map((row) =>
                  row.articleCode === item.articleCode
                    ? { ...row, prepared: event.target.checked }
                    : row
                ))}
                className="h-5 w-5 accent-emerald-600"
              />
              Preparat
            </label>
            <div className={cn('min-w-32 flex-1 text-sm font-semibold', item.prepared && 'text-emerald-800 line-through')}>
              {item.articleName}
              <div className={cn('text-xs font-normal text-slate-500', item.prepared && 'line-through')}>
                {item.articleCode}
              </div>
            </div>
            <Input type="number" min={1} inputMode="numeric" value={item.quantity} onChange={(event) => onChange(items.map((row) => row.articleCode === item.articleCode ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row))} className="h-10 w-20 text-center" aria-label={`Quantitat no preparada de ${item.articleName}`} />
            <Button type="button" size="icon" variant="ghost" className="text-red-600" onClick={() => onChange(items.filter((row) => row.articleCode !== item.articleCode))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <select value={item.reason || 'pendent'} onChange={(event) => onChange(items.map((row) => row.articleCode === item.articleCode ? { ...row, reason: event.target.value as PreparationMissingArticle['reason'] } : row))} className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option value="pendent">Pendent</option><option value="sense_estoc">Sense estoc</option><option value="trencat">Trencat</option><option value="no_localitzat">No localitzat</option><option value="altre">Altre</option>
          </select>
          <Input value={item.note || ''} onChange={(event) => onChange(items.map((row) => row.articleCode === item.articleCode ? { ...row, note: event.target.value } : row))} placeholder="Observació opcional" className="h-11" />
        </div>
      ))}
    </div>
  )
}

export default function PreparationFormDialog({
  event,
  allowedWarehouses,
  onSaved,
}: {
  event: LogisticsEventPrepRow
  allowedWarehouses: AllowedPreparationWarehouse[]
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [warehouseCode, setWarehouseCode] = useState<PreparationWarehouseCode>(allowedWarehouses[0]?.code || 'BODEGA')
  const [form, setForm] = useState<PreparationWarehouseForm>(() => emptyForm(event.id, warehouseCode))
  const [interval, setInterval] = useState<EventInterval>(EMPTY_INTERVAL)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [message, setMessage] = useState('')
  const selectedWarehouse = useMemo(() => allowedWarehouses.find((item) => item.code === warehouseCode), [allowedWarehouses, warehouseCode])

  const loadForm = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(`/api/logistics/${encodeURIComponent(event.id)}/preparation-form?warehouse=${warehouseCode}`, { cache: 'no-store' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut carregar la fitxa.'))
      setForm(json.form as PreparationWarehouseForm)
      setInterval((json.interval || EMPTY_INTERVAL) as EventInterval)
      setDirty(false)
    } catch (loadError) {
      setForm(emptyForm(event.id, warehouseCode))
      setDirty(false)
      setMessage(loadError instanceof Error ? loadError.message : 'No s’ha pogut carregar la fitxa.')
    } finally {
      setLoading(false)
    }
  }, [event.id, warehouseCode])

  useEffect(() => {
    if (open) void loadForm()
  }, [loadForm, open])

  const save = async (status: 'draft' | 'completed') => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(`/api/logistics/${encodeURIComponent(event.id)}/preparation-form`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse: warehouseCode, form: { ...form, status } }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut desar la fitxa.'))
      setForm(json.form as PreparationWarehouseForm)
      setDirty(false)
      setMessage(status === 'completed' ? 'Preparació finalitzada i reservada correctament.' : 'Esborrany desat correctament.')
      onSaved?.()
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'No s’ha pogut desar la fitxa.')
    } finally {
      setSaving(false)
    }
  }

  const updateCount = (key: keyof PreparationWarehouseForm, value: number) => {
    setDirty(true)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const selectWarehouse = (code: PreparationWarehouseCode) => {
    if (code === warehouseCode) return
    if (dirty && !window.confirm('Hi ha canvis sense desar. Vols canviar de magatzem i descartar-los?')) return
    setChatOpen(false)
    setWarehouseCode(code)
  }

  const changeDialogOpen = (nextOpen: boolean) => {
    if (!nextOpen && dirty && !window.confirm('Hi ha canvis sense desar. Vols tancar la fitxa i descartar-los?')) return
    setOpen(nextOpen)
  }

  if (!allowedWarehouses.length) return null

  return (
    <>
      <Button type="button" variant="outline" className="h-11 gap-2 border-emerald-300 bg-white text-emerald-800" onClick={() => setOpen(true)}>
        <ClipboardPen className="h-4 w-4" /> Fitxa de preparació
      </Button>
      <Dialog open={open} onOpenChange={changeDialogOpen}>
        <DialogContent className="h-[96dvh] max-h-[96dvh] gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] lg:max-w-6xl">
          <DialogHeader className="border-b bg-slate-50 px-4 py-4 text-left sm:px-6">
            <DialogTitle className="pr-8 text-xl">{getPreparationEventName(event) || 'Preparació'}</DialogTitle>
            <DialogDescription>{event.EventCode} · {event.Ubicacio || 'Sense ubicació'}{interval.startLabel ? ` · ${interval.startLabel} → ${interval.endLabel}` : ''}</DialogDescription>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 overflow-x-auto">
                {allowedWarehouses.map((warehouse) => (
                  <button key={warehouse.code} type="button" onClick={() => selectWarehouse(warehouse.code)} className={cn('min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold', warehouse.code === warehouseCode ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                    {warehouse.label}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                aria-label={`Obrir el xat Ops de ${selectedWarehouse?.label || warehouseCode}`}
                title={`Xat Ops · ${selectedWarehouse?.label || warehouseCode}`}
                onClick={() => setChatOpen(true)}
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-3 sm:p-5">
            {loading ? <div className="flex min-h-52 items-center justify-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Carregant fitxa…</div> : (
              <div className="mx-auto min-w-0 max-w-6xl space-y-4">
                {message ? <div className={cn('rounded-xl border p-3 text-sm', message.includes('correctament') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700')}>{message}</div> : null}
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-3 font-semibold text-slate-900">Càrrega · {selectedWarehouse?.label}</h3>
                  <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-4">
                    <QuantityField label="Carros" value={form.carts} onChange={(value) => updateCount('carts', value)} />
                    <QuantityField label="Palets EU" value={form.euroPallets} onChange={(value) => updateCount('euroPallets', value)} />
                    <QuantityField label="Palets AM" value={form.americanPallets} onChange={(value) => updateCount('americanPallets', value)} />
                    <QuantityField label="Racks" value={form.racks} onChange={(value) => updateCount('racks', value)} />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-3 font-semibold text-slate-900">Gel</h3>
                  <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 lg:grid-cols-3">
                    <QuantityField label="Sacs gel pilé" value={form.gelPileBags} onChange={(value) => updateCount('gelPileBags', value)} />
                    <QuantityField label="Sacs gel pedra" value={form.gelStoneBags} onChange={(value) => updateCount('gelStoneBags', value)} />
                    <QuantityField label="Gel mojito" value={form.gelMojitoBags} onChange={(value) => updateCount('gelMojitoBags', value)} />
                  </div>
                </section>

                <ArticlePicker rowId={event.id} warehouseCode={warehouseCode} purpose="machinery" title="Maquinària" description="Només mostra les unitats disponibles durant l’horari de l’esdeveniment. Els articles nous reben codi MAQ." selected={form.machinery} onChange={(machinery) => { setDirty(true); setForm((current) => ({ ...current, machinery })) }} allowCreate />
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  <ArticlePicker rowId={event.id} warehouseCode={warehouseCode} purpose="small_machinery" title="Maquinària petita" description="Catàleg independent amb codis MAP. Inicialment només mostra els articles creats aquí." selected={form.smallMachinery} onChange={(smallMachinery) => { setDirty(true); setForm((current) => ({ ...current, smallMachinery })) }} allowCreate />
                  <ArticlePicker rowId={event.id} warehouseCode={warehouseCode} purpose="logistics_pack" title="Packs de logística" description="Catàleg independent amb codis PKL, guardat al magatzem Mobiliari." selected={form.logisticsPacks} onChange={(logisticsPacks) => { setDirty(true); setForm((current) => ({ ...current, logisticsPacks })) }} allowCreate />
                  <ArticlePicker rowId={event.id} warehouseCode={warehouseCode} purpose="pallet_jack" title="Transpalets" description="Selecciona o crea transpalets amb codis TRP dins del magatzem Maquinària." selected={form.palletJacks} onChange={(palletJacks) => { setDirty(true); setForm((current) => ({ ...current, palletJacks })) }} allowCreate />
                </div>

                <section className="space-y-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><h3 className="font-semibold text-slate-900">Articles no preparats</h3><p className="text-xs text-slate-500">Selecciona articles del magatzem {selectedWarehouse?.label} i indica’n el motiu.</p></div></div>
                  <MissingArticlesEditor items={form.missingArticles} onChange={(missingArticles) => { setDirty(true); setForm((current) => ({ ...current, missingArticles })) }} />
                  <ArticlePicker rowId={event.id} warehouseCode={warehouseCode} purpose="assigned" title="Cercar articles del magatzem" description="Selecciona un altre article per afegir-lo a la llista superior." selected={form.missingArticles} onChange={(items) => { setDirty(true); setForm((current) => ({ ...current, missingArticles: items.map((item) => ({ ...item, reason: current.missingArticles.find((row) => row.articleCode === item.articleCode)?.reason || 'pendent', note: current.missingArticles.find((row) => row.articleCode === item.articleCode)?.note || '', prepared: current.missingArticles.find((row) => row.articleCode === item.articleCode)?.prepared === true })) })) }} showSelectedItems={false} />
                </section>

                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Observacions</h3>
                  {event.PreparacioObservacions ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Indicacions de planificació</div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{event.PreparacioObservacions}</p>
                    </div>
                  ) : null}
                  <Label htmlFor={`preparation-notes-${event.id}-${warehouseCode}`} className="font-semibold">Observacions del preparador</Label>
                  <Textarea id={`preparation-notes-${event.id}-${warehouseCode}`} value={form.notes} onChange={(event) => { setDirty(true); setForm((current) => ({ ...current, notes: event.target.value })) }} className="min-h-28 text-base" placeholder="Incidències, material pendent o altres indicacions…" />
                </section>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t bg-white p-3 sm:flex-row sm:items-center sm:p-4">
            <div className={cn('text-sm font-semibold sm:mr-auto', dirty ? 'text-amber-700' : message.includes('correctament') ? 'text-emerald-700' : 'text-slate-500')}>
              {dirty ? 'Canvis sense desar' : message}
            </div>
            <Button type="button" variant="outline" className="h-12 gap-2" disabled={saving || loading} onClick={() => void save('draft')}><Save className="h-4 w-4" /> Desar esborrany</Button>
            <Button type="button" className="h-12 bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving || loading} onClick={() => void save('completed')}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Finalitzar preparació</Button>
          </div>
        </DialogContent>
      </Dialog>
      <PreparationOpsPanel
        rowId={event.id}
        eventTitle={getPreparationEventName(event) || 'Preparació'}
        warehouseCode={warehouseCode}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </>
  )
}
