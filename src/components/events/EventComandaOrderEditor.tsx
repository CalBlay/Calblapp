'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  buildArticleSearchPool,
  flattenTemplateLines,
  searchArticles,
} from '@/lib/eventComanda/searchArticles'
import { loadOrderDraft, saveOrderDraft } from '@/lib/eventComanda/orderDraft'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import type {
  EventComandaArticleOption,
  EventComandaLine,
  EventComandaOrderLine,
} from '@/lib/eventComanda/types'
import {
  eventComandaActionBarClass,
  eventComandaPanelClass,
  eventComandaPrimaryButtonClass,
  eventComandaTableClass,
  eventComandaTableHeadCellClass,
  eventComandaTableQtyCellClass,
  eventComandaTableRowClass,
  formatEventComandaQty,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  eventId: string
  templateLinesByFamily: Record<string, EventComandaLine[]>
  onSendToWarehouse?: (lines: EventComandaOrderLine[]) => void
}

export default function EventComandaOrderEditor({
  eventId,
  templateLinesByFamily,
  onSendToWarehouse,
}: Props) {
  const templateLines = useMemo(
    () => flattenTemplateLines(templateLinesByFamily),
    [templateLinesByFamily]
  )
  const [catalogArticles, setCatalogArticles] = useState<EventComandaArticleOption[]>([])
  const [orderLines, setOrderLines] = useState<EventComandaOrderLine[]>([])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightCode, setHighlightCode] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    setOrderLines(loadOrderDraft(eventId))
  }, [eventId])

  useEffect(() => {
    saveOrderDraft(eventId, orderLines)
  }, [eventId, orderLines])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/event-comanda/articles')
      .then((res) => (res.ok ? res.json() : { articles: [] }))
      .then((json: { articles?: Array<Record<string, string>> }) => {
        if (cancelled) return
        const articles = Array.isArray(json.articles) ? json.articles : []
        setCatalogArticles(
          articles.map((article) => ({
            articleCode: String(article.articleCode || '').trim().toUpperCase(),
            articleName: String(article.articleName || '').trim(),
            family: String(article.family || '').trim(),
            qtyUnit: article.qtyUnit,
            qtyTemplate: null,
            inTemplate: false,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setCatalogArticles([])
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    }
    setOrderLines((prev) =>
      [...prev, nextLine].sort((a, b) => a.articleCode.localeCompare(b.articleCode))
    )
    setSearch('')
    setSearchOpen(false)
    setHighlightCode(code)
    window.setTimeout(() => qtyRefs.current[code]?.focus(), 0)
  }

  const updateQty = (code: string, raw: string) => {
    const parsed = raw.replace(',', '.')
    const qty = parsed === '' ? null : Number(parsed)
    setOrderLines((prev) =>
      prev.map((line) =>
        line.articleCode.toUpperCase() === code.toUpperCase()
          ? { ...line, qtyRequested: qty != null && Number.isFinite(qty) && qty > 0 ? qty : null }
          : line
      )
    )
  }

  const removeLine = (code: string) => {
    setOrderLines((prev) => prev.filter((line) => line.articleCode.toUpperCase() !== code.toUpperCase()))
    if (highlightCode === code) setHighlightCode(null)
  }

  const validLines = orderLines.filter(
    (line) => line.qtyRequested != null && line.qtyRequested > 0
  )

  return (
    <div className="space-y-4">
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            placeholder="Cerca per codi o nom d'article…"
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
            {searchResults.length === 0 ? (
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
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className={eventComandaPanelClass}>
        {orderLines.length === 0 ? (
          <div className="py-10 text-center">
            <p className={typography('sectionTitle')}>Nova comanda</p>
            <p className={cn(typography('bodyMd'), 'mt-2 text-slate-600')}>
              Cerca articles per afegir-los. La quantitat de la plantilla es mostra com a referència.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={eventComandaTableClass}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={eventComandaTableHeadCellClass}>Codi</th>
                  <th className={eventComandaTableHeadCellClass}>Article</th>
                  <th className={cn(eventComandaTableHeadCellClass, 'text-right')}>Plantilla</th>
                  <th className={cn(eventComandaTableHeadCellClass, 'text-right')}>Quantitat</th>
                  <th className={cn(eventComandaTableHeadCellClass, 'w-16 text-right')}>U.</th>
                  <th className={cn(eventComandaTableHeadCellClass, 'w-10')} />
                </tr>
              </thead>
              <tbody>
                {orderLines.map((line) => {
                  const codeKey = line.articleCode.toUpperCase()
                  const qtyValue =
                    line.qtyRequested == null
                      ? ''
                      : Number.isInteger(line.qtyRequested)
                        ? String(line.qtyRequested)
                        : String(line.qtyRequested)

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
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={eventComandaActionBarClass}>
        <div className="flex justify-end">
          <Button
            type="button"
            className={cn(eventComandaPrimaryButtonClass, 'gap-2')}
            disabled={validLines.length === 0}
            title={validLines.length === 0 ? 'Afegeix articles amb quantitat' : undefined}
            onClick={() => onSendToWarehouse?.(validLines)}
          >
            <Send className="h-4 w-4 shrink-0" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}
