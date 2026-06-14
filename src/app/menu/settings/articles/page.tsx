'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import EventComandaCatalogImportPanel from '@/components/events/EventComandaCatalogImportPanel'
import { ArrowLeft, ClipboardList, Plus, Ruler, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MotionDiv } from '@/lib/lazyMotion'
import { normalizeRole } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'

type Warehouse = { id: string; code: string; name: string; isActive: boolean }
type PurchaseUnit = { id: string; code: string; name: string; isActive: boolean }
type Rule = { id: string; prefix: string; warehouseId: string }
type Article = {
  articleCode: string
  articleName: string
  qtyUnit: string
  warehouseId?: string | null
  warehouseCode?: string | null
  warehouseName?: string | null
  warehouseSource?: string | null
  erpGroupCode?: string | null
  erpGroupName?: string | null
  erpFamilyCode?: string | null
  erpFamilyName?: string | null
  erpSubfamilyCode?: string | null
  erpSubfamilyName?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const CATALOG_PAGE_SIZE = 50

async function fetchCatalogArticles(params: { q: string; cursor?: string | null }) {
  const search = new URLSearchParams({ limit: String(CATALOG_PAGE_SIZE) })
  if (params.q.length >= 2) search.set('q', params.q)
  if (params.cursor) search.set('cursor', params.cursor)
  const res = await fetch(`/api/event-comanda/articles?${search.toString()}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json?.error || 'Error carregant articles'))
  }
  return json as { articles?: Article[]; nextCursor?: string | null }
}

export default function EventComandaArticlesConfigPage() {
  const { data: session } = useSession()
  const role = normalizeRole(session?.user?.role)
  const isAdmin = role === 'admin' || role === 'direccio'
  const [tab, setTab] = useState<'rules' | 'catalog' | 'units'>('rules')
  const [query, setQuery] = useState('')
  const [prefix, setPrefix] = useState('')
  const [ruleWarehouseId, setRuleWarehouseId] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [unitName, setUnitName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [catalogArticles, setCatalogArticles] = useState<Article[]>([])
  const [catalogNextCursor, setCatalogNextCursor] = useState<string | null>(null)
  const catalogNextCursorRef = useRef<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const { data: warehousesData, mutate: refreshWarehouses } = useSWR<{ warehouses?: Warehouse[] }>(
    isAdmin ? '/api/event-comanda/warehouses' : null,
    fetcher
  )
  const { data: unitsData, mutate: refreshUnits } = useSWR<{ units?: PurchaseUnit[] }>(
    isAdmin ? '/api/event-comanda/units' : null,
    fetcher
  )
  const { data: rulesData, mutate: refreshRules } = useSWR<{ rules?: Rule[] }>(
    isAdmin ? '/api/event-comanda/warehouse-rules' : null,
    fetcher
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    catalogNextCursorRef.current = catalogNextCursor
  }, [catalogNextCursor])

  const loadCatalogArticles = useCallback(
    async (opts?: { append?: boolean }) => {
      if (!isAdmin) return
      setCatalogLoading(true)
      setError('')
      try {
        const result = await fetchCatalogArticles({
          q: debouncedQuery,
          cursor: opts?.append ? catalogNextCursorRef.current : undefined,
        })
        const list = result.articles ?? []
        setCatalogArticles((prev) => (opts?.append ? [...prev, ...list] : list))
        setCatalogNextCursor(result.nextCursor ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error carregant articles')
        if (!opts?.append) {
          setCatalogArticles([])
          setCatalogNextCursor(null)
        }
      } finally {
        setCatalogLoading(false)
      }
    },
    [isAdmin, debouncedQuery]
  )

  useEffect(() => {
    if (!isAdmin || tab !== 'catalog') return
    void loadCatalogArticles()
  }, [isAdmin, tab, debouncedQuery, loadCatalogArticles])

  const warehouses = useMemo(
    () => (warehousesData?.warehouses ?? []).filter((w) => w.isActive),
    [warehousesData?.warehouses]
  )
  const units = useMemo(() => unitsData?.units ?? [], [unitsData?.units])
  const activeUnits = useMemo(() => units.filter((unit) => unit.isActive), [units])
  const rules = rulesData?.rules ?? []
  const articles = catalogArticles

  const createRule = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/event-comanda/warehouse-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, warehouseId: ruleWarehouseId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant regla'))
      setPrefix('')
      setRuleWarehouseId('')
      await refreshRules()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant regla')
    } finally {
      setBusy(false)
    }
  }

  const updateRule = async (rule: Rule, warehouseId: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/warehouse-rules/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant regla'))
      await refreshRules()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant regla')
    } finally {
      setBusy(false)
    }
  }

  const deleteRule = async (rule: Rule) => {
    if (!window.confirm(`Eliminar la regla ${rule.prefix}?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/warehouse-rules/${encodeURIComponent(rule.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error eliminant regla'))
      await refreshRules()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminant regla')
    } finally {
      setBusy(false)
    }
  }

  const createUnit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/event-comanda/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: unitCode, name: unitName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error creant unitat'))
      setUnitCode('')
      setUnitName('')
      await refreshUnits()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creant unitat')
    } finally {
      setBusy(false)
    }
  }

  const updateUnit = async (unit: PurchaseUnit, patch: Partial<PurchaseUnit>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/units/${encodeURIComponent(unit.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant unitat'))
      await refreshUnits()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant unitat')
    } finally {
      setBusy(false)
    }
  }

  const deleteUnit = async (unit: PurchaseUnit) => {
    if (!window.confirm(`Eliminar la unitat ${unit.code}?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/event-comanda/units/${encodeURIComponent(unit.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error eliminant unitat'))
      await refreshUnits()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminant unitat')
    } finally {
      setBusy(false)
    }
  }

  const updateArticle = async (article: Article, patch: { unit?: string; warehouseId?: string | null }) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/event-comanda/articles/${encodeURIComponent(article.articleCode)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error actualitzant article'))
      const updated = json.article as Article | undefined
      if (updated?.articleCode) {
        setCatalogArticles((prev) =>
          prev.map((row) => (row.articleCode === updated.articleCode ? { ...row, ...updated } : row))
        )
      } else {
        await loadCatalogArticles()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualitzant article')
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return <p className="p-4 text-sm text-red-600">No tens permís per accedir a aquesta pàgina.</p>
  }

  return (
    <div
      className={cn(
        'mx-auto w-full space-y-4 pb-8',
        tab === 'catalog' ? 'max-w-none p-4 lg:px-6 xl:px-8' : 'max-w-6xl p-4'
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/menu/settings"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Articles de comanda</h1>
          <p className="text-sm text-slate-600">
            Regles de magatzem, unitats de compra i catàleg editable.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={tab === 'rules' ? 'default' : 'outline'}
          className={tab === 'rules' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
          onClick={() => setTab('rules')}
        >
          Regles de magatzem
        </Button>
        <Button
          variant={tab === 'units' ? 'default' : 'outline'}
          className={tab === 'units' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
          onClick={() => setTab('units')}
        >
          Unitats de compra
        </Button>
        <Button
          variant={tab === 'catalog' ? 'default' : 'outline'}
          className={tab === 'catalog' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
          onClick={() => setTab('catalog')}
        >
          Catàleg
        </Button>
        <Link href="/menu/settings/magatzems" className="ml-auto">
          <Button variant="outline">Magatzems</Button>
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === 'rules' ? (
        <>
          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow"
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-lg">Nova regla</h2>
            </div>
            <p className="text-sm text-slate-600">
              Prefix de 2 a 5 caràcters del codi d&apos;article. Si hi ha diverses coincidències, guanya el prefix més llarg.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Prefix</Label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="09"
                  maxLength={5}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Magatzem</Label>
                <Select value={ruleWarehouseId} onValueChange={setRuleWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona magatzem" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.code} · {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy || prefix.trim().length < 2 || !ruleWarehouseId}
                onClick={() => void createRule()}
              >
                <Plus className="h-4 w-4" />
                Afegir regla
              </Button>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow"
          >
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Prefix</th>
                  <th className="px-4 py-2">Magatzem</th>
                  <th className="px-4 py-2 text-right">Accions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono">{rule.prefix}</td>
                    <td className="px-4 py-2">
                      <Select
                        value={rule.warehouseId}
                        onValueChange={(value) => void updateRule(rule, value)}
                        disabled={busy}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((warehouse) => (
                            <SelectItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} · {warehouse.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        disabled={busy}
                        onClick={() => void deleteRule(rule)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MotionDiv>
        </>
      ) : tab === 'units' ? (
        <>
          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow"
          >
            <div className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-lg">Nova unitat de compra</h2>
            </div>
            <p className="text-sm text-slate-600">
              Codi curt (p.ex. UN, ONU, C) i nom descriptiu. S&apos;utilitza al catàleg d&apos;articles i a les comandes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Codi</Label>
                <Input
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
                  placeholder="UN"
                  maxLength={8}
                />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Unitat" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={busy || !unitCode.trim() || !unitName.trim()}
                onClick={() => void createUnit()}
              >
                <Plus className="h-4 w-4" />
                Afegir
              </Button>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow"
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold">Llista d&apos;unitats</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Codi</th>
                    <th className="px-4 py-2">Nom</th>
                    <th className="px-4 py-2">Activa</th>
                    <th className="px-4 py-2 text-right">Accions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <UnitRow
                      key={unit.id}
                      unit={unit}
                      busy={busy}
                      onSave={(patch) => void updateUnit(unit, patch)}
                      onDelete={() => void deleteUnit(unit)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </MotionDiv>
        </>
      ) : (
        <div className="space-y-4">
          <EventComandaCatalogImportPanel
            busy={busy}
            onBusyChange={setBusy}
            onError={setError}
            onImported={() => {
              void loadCatalogArticles()
              void refreshUnits()
              void refreshWarehouses()
            }}
          />
          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow"
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <div className="space-y-2">
                <div className="relative max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca per codi o nom (mín. 2 caràcters)…"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {debouncedQuery.length >= 2
                    ? 'Cerca al servidor — només resultats coincidents.'
                    : `Mostrant ${articles.length} articles per pàgina. Escriu per cercar al catàleg complet.`}
                </p>
              </div>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto overflow-x-hidden">
              {catalogLoading && articles.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Carregant articles…</p>
              ) : articles.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  {debouncedQuery.length >= 2
                    ? 'Cap article trobat.'
                    : 'No hi ha articles al catàleg.'}
                </p>
              ) : (
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[8.5rem]" />
                  <col className="w-[26%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                  <col className="w-[3.75rem]" />
                  <col className="w-[3.75rem]" />
                  <col className="w-[4.25rem]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Codi</th>
                    <th className="px-3 py-2">Article</th>
                    <th className="px-3 py-2">Grup</th>
                    <th className="px-3 py-2">Família</th>
                    <th className="px-3 py-2">Subfamília</th>
                    <th className="px-3 py-2">U.</th>
                    <th className="px-3 py-2">Mag.</th>
                    <th className="px-3 py-2">Orig.</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => (
                    <ArticleRow
                      key={article.articleCode}
                      article={article}
                      warehouses={warehouses}
                      units={activeUnits}
                      busy={busy}
                      onUpdate={(patch) => void updateArticle(article, patch)}
                    />
                  ))}
                </tbody>
              </table>
              )}
            </div>
            {catalogNextCursor && debouncedQuery.length < 2 ? (
              <div className="border-t border-gray-100 px-4 py-3">
                <Button
                  variant="outline"
                  disabled={catalogLoading || busy}
                  onClick={() => void loadCatalogArticles({ append: true })}
                >
                  {catalogLoading ? 'Carregant…' : 'Carregar més articles'}
                </Button>
              </div>
            ) : null}
          </MotionDiv>
        </div>
      )}
    </div>
  )
}

function UnitRow({
  unit,
  busy,
  onSave,
  onDelete,
}: {
  unit: PurchaseUnit
  busy: boolean
  onSave: (patch: Partial<PurchaseUnit>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(unit.name)
  const dirty = name.trim() !== unit.name

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2 font-mono text-xs">{unit.code}</td>
      <td className="px-4 py-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </td>
      <td className="px-4 py-2">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={unit.isActive}
            disabled={busy}
            onChange={(e) => onSave({ isActive: e.target.checked })}
          />
          <span className="text-xs text-slate-600">{unit.isActive ? 'Sí' : 'No'}</span>
        </label>
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave({ name: name.trim() })}>
              Desar
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function erpLabelName(code?: string | null, name?: string | null) {
  const raw = String(name || '').trim()
  if (!raw) return '—'
  const prefix = String(code || '').trim()
  if (!prefix) return raw
  if (raw.startsWith(`${prefix}-`)) return raw.slice(prefix.length + 1).trim() || raw
  if (raw.startsWith(`${prefix} `)) return raw.slice(prefix.length + 1).trim() || raw
  return raw
}

function catalogCellClass(extra?: string) {
  return cn(
    'px-3 py-1.5 align-middle overflow-hidden text-ellipsis whitespace-nowrap',
    extra
  )
}

function ArticleRow({
  article,
  warehouses,
  units,
  busy,
  onUpdate,
}: {
  article: Article
  warehouses: Warehouse[]
  units: PurchaseUnit[]
  busy: boolean
  onUpdate: (patch: { unit?: string; warehouseId?: string | null }) => void
}) {
  const unitCodes = new Set(units.map((unit) => unit.code))
  const unitValue = unitCodes.has(article.qtyUnit) ? article.qtyUnit : `__erp__${article.qtyUnit}`
  const warehouseIds = new Set(warehouses.map((warehouse) => warehouse.id))
  const warehouseValue =
    !article.warehouseId || warehouseIds.has(article.warehouseId)
      ? article.warehouseId || '__none__'
      : `__erp__${article.warehouseId}`

  const warehouseSourceLabel =
    article.warehouseSource === 'manual'
      ? 'Manual'
      : article.warehouseSource === 'import'
        ? 'Import'
        : article.warehouseSource === 'prefix'
          ? 'Prefix'
          : '—'

  return (
    <tr className="border-t border-slate-100">
      <td className={catalogCellClass('font-mono text-xs')} title={article.articleCode}>
        {article.articleCode}
      </td>
      <td className={catalogCellClass()} title={article.articleName}>
        {article.articleName}
      </td>
      <td
        className={catalogCellClass('text-xs')}
        title={erpLabelName(article.erpGroupCode, article.erpGroupName)}
      >
        {erpLabelName(article.erpGroupCode, article.erpGroupName)}
      </td>
      <td
        className={catalogCellClass('text-xs')}
        title={erpLabelName(article.erpFamilyCode, article.erpFamilyName)}
      >
        {erpLabelName(article.erpFamilyCode, article.erpFamilyName)}
      </td>
      <td
        className={catalogCellClass('text-xs')}
        title={erpLabelName(article.erpSubfamilyCode, article.erpSubfamilyName)}
      >
        {erpLabelName(article.erpSubfamilyCode, article.erpSubfamilyName)}
      </td>
      <td className="px-2 py-1.5 align-middle">
        <Select
          value={unitValue}
          onValueChange={(value) => {
            if (value.startsWith('__erp__')) return
            onUpdate({ unit: value })
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-14 font-mono uppercase">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!unitCodes.has(article.qtyUnit) ? (
              <SelectItem value={`__erp__${article.qtyUnit}`} disabled>
                {article.qtyUnit} (ERP, no al catàleg)
              </SelectItem>
            ) : null}
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.code}>
                {unit.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5 align-middle">
        <Select
          value={warehouseValue}
          onValueChange={(value) => {
            if (value.startsWith('__erp__')) return
            onUpdate({ warehouseId: value === '__none__' ? null : value })
          }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-14 font-mono">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {article.warehouseId && !warehouseIds.has(article.warehouseId) ? (
              <SelectItem value={`__erp__${article.warehouseId}`} disabled>
                {article.warehouseCode || article.warehouseId}
              </SelectItem>
            ) : null}
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                {warehouse.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className={catalogCellClass('text-xs text-slate-500')}>{warehouseSourceLabel}</td>
    </tr>
  )
}
