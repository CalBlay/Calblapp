import React, { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { OrderLine, OrderState } from '../types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

interface Props {
  orderSummary: { items: number; services: number; templates: number }
  showAllGroups: boolean
  setShowAllGroups: React.Dispatch<React.SetStateAction<boolean>>
  actionLog: string[]
  exportItems: { label: string; onClick: () => void; disabled?: boolean }[]
  duplicateSources: { id: string; label: string }[]
  handleDuplicateFrom: (id: string) => void
  orderSearch: string
  setOrderSearch: (value: string) => void
  filteredGroupedLines: Array<{
    key: string
    service: string
    template: string
    items: OrderLine[]
  }>
  activeGroup?: { key: string; items: OrderLine[] } | null
  showActiveOnly: boolean
  setActiveGroupKey: (key: string) => void
  groupRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>
  editingLineId: string | null
  editingQty: number
  setEditingLineId: (id: string | null) => void
  setEditingQty: (qty: number) => void
  currentOrder?: OrderState
  updateLineQty: (lineId: string, qty: number) => void
  removeLine: (lineId: string) => void
  clearOrder?: () => void
  showAllGroupsLabel: string
  serviceMeta: Record<string, { time?: string; location?: string }>
}

export default function OrderPanel({
  orderSummary,
  showAllGroups,
  setShowAllGroups,
  actionLog,
  exportItems,
  duplicateSources,
  handleDuplicateFrom,
  orderSearch,
  setOrderSearch,
  filteredGroupedLines,
  activeGroup,
  showActiveOnly,
  setActiveGroupKey,
  groupRefs,
  editingLineId,
  editingQty,
  setEditingLineId,
  setEditingQty,
  currentOrder,
  updateLineQty,
  removeLine,
  showAllGroupsLabel,
  serviceMeta,
}: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (!showActiveOnly) {
      setCollapsedGroups({})
    }
  }, [showActiveOnly])

  const renderLine = (line: OrderLine) => (
    <div key={line.id} className="cmd-line border rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">{line.concept}</div>
        <div className="flex items-center gap-2">
          {editingLineId === line.id ? (
            <input
              type="number"
              min={0}
              className="h-6 w-16 rounded-md border border-slate-200 bg-white px-2 text-xs text-center"
              value={editingQty}
              onChange={(e) => setEditingQty(Number(e.target.value))}
              onBlur={() => {
                updateLineQty(line.id, Number(editingQty) || 0)
                setEditingLineId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateLineQty(line.id, Number(editingQty) || 0)
                  setEditingLineId(null)
                }
                if (e.key === 'Escape') {
                  setEditingLineId(null)
                }
              }}
              autoFocus
            />
          ) : (
            <button
              className="h-6 px-2 rounded-md border border-slate-200 bg-white text-xs text-slate-600"
              onClick={() => {
                setEditingLineId(line.id)
                setEditingQty(line.qty ?? currentOrder?.pax ?? 0)
              }}
            >
              {line.qty ?? currentOrder?.pax ?? 0}
            </button>
          )}
          <button
            className="h-6 w-6 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
            onClick={() => removeLine(line.id)}
            aria-label="Elimina"
          >
            <Trash2 className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <aside className="cmd-panel rounded-2xl border p-4 md:p-5 flex flex-col min-h-[320px] sm:min-h-[420px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div className="text-[11px] md:text-[10px] text-slate-500">
          {orderSummary.items} ítems · {orderSummary.services} serveis · {orderSummary.templates} plantilles
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] md:text-[10px] text-slate-500"
            onClick={() => setShowAllGroups((v) => !v)}
          >
            {showAllGroupsLabel}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-500 flex items-center gap-1"
                disabled={duplicateSources.length === 0}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {duplicateSources.map((src) => (
                <DropdownMenuItem key={src.id} onClick={() => handleDuplicateFrom(src.id)}>
                  {src.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm md:text-xs"
          placeholder="Cerca dins la comanda"
          value={orderSearch}
          onChange={(e) => setOrderSearch(e.target.value)}
        />
      </div>

      <div className="mt-2 flex-1 overflow-y-auto">
        {!filteredGroupedLines.length ? (
          <p className="text-sm text-gray-500">Encara no hi ha plats.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(
              filteredGroupedLines.reduce<Record<string, typeof filteredGroupedLines>>(
                (acc, group) => {
                  acc[group.service] = acc[group.service] || []
                  acc[group.service].push(group)
                  return acc
                },
                {}
              )
            ).map(([service, groups]) => (
              <div key={service} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2 px-1">
                  <div className="flex flex-col">
                    <span>{service}</span>
                    {(serviceMeta[service]?.time || serviceMeta[service]?.location) && (
                      <span className="text-[10px] font-normal text-slate-400">
                        {serviceMeta[service]?.time || '--:--'}
                        {serviceMeta[service]?.location
                          ? ` · ${serviceMeta[service]?.location}`
                          : ''}
                      </span>
                    )}
                  </div>
                  <button
                    className="text-[11px] text-slate-400 hover:text-slate-600"
                    onClick={() => toggleGroup(`service:${service}`)}
                  >
                    {collapsedGroups[`service:${service}`] ? '＋' : '－'}
                  </button>
                </div>
                {!collapsedGroups[`service:${service}`] && (
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const defaultCollapsed = showActiveOnly && group.key !== activeGroup?.key
                      const isCollapsed = collapsedGroups[group.key] ?? defaultCollapsed
                      const isActive = group.key === activeGroup?.key
                      return (
                        <div key={group.key}>
                          <button
                            className={`w-full flex items-center justify-between text-left text-[11px] mb-1 cmd-group ${
                              isActive ? 'cmd-group-active' : ''
                            }`}
                            onClick={() => toggleGroup(group.key)}
                            ref={(el) => {
                              groupRefs.current[group.key] = el
                            }}
                          >
                            <span>
                              {group.template} ({group.items.length})
                            </span>
                            <span className="text-slate-400">
                              {isCollapsed ? '＋' : '－'}
                            </span>
                          </button>
                          {!isCollapsed && (
                            <div className="space-y-2">{group.items.map(renderLine)}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
