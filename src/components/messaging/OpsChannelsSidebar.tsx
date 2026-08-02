'use client'

import { Search } from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import { chatTheme } from '@/components/messaging/chatTheme'
import type { OpsSidebarFilter, OpsSidebarItem } from '@/components/messaging/opsSidebarTypes'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  eyebrow?: string
  description?: string
  items: OpsSidebarItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  emptyMessage?: string
  className?: string
  listClassName?: string
  filters?: OpsSidebarFilter[]
  activeFilter?: string
  onFilterChange?: (key: string) => void
  showSearch?: boolean
  searchQuery?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  footer?: React.ReactNode
}

function itemButtonClass(item: OpsSidebarItem, selected: boolean) {
  if (selected) {
    return item.closed ? chatTheme.sidebarItemActiveMuted : chatTheme.sidebarItemActive
  }
  return item.closed ? chatTheme.sidebarItemIdleMuted : chatTheme.sidebarItemIdle
}

function SidebarItemButton({
  item,
  selected,
  onSelect,
}: {
  item: OpsSidebarItem
  selected: boolean
  onSelect: (id: string) => void
}) {
  const avatarText = item.avatarLabel || initials(item.label)

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        'mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
        itemButtonClass(item, selected)
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          item.closed ? chatTheme.avatarMuted : chatTheme.avatar
        )}
      >
        {avatarText}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold text-slate-900">{item.label}</div>
          {item.unreadCount && item.unreadCount > 0 && !item.closed ? (
            <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </span>
          ) : null}
        </div>
        {item.meta ? (
          <div className="truncate text-[11px] text-slate-500">{item.meta}</div>
        ) : null}
        {item.preview ? (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">{item.preview}</span>
            {item.timeLabel && !item.closed ? (
              <span className="shrink-0 text-[11px] text-slate-400">{item.timeLabel}</span>
            ) : null}
          </div>
        ) : item.timeLabel && !item.closed ? (
          <div className="mt-0.5 text-right text-[11px] text-slate-400">{item.timeLabel}</div>
        ) : null}
      </div>
    </button>
  )
}

export default function OpsChannelsSidebar({
  eyebrow,
  description,
  items,
  selectedId,
  onSelect,
  loading = false,
  emptyMessage = 'No tens canals subscrits.',
  className,
  listClassName,
  filters,
  activeFilter,
  onFilterChange,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Cerca canal, projecte, finca, restaurant o event...',
  footer,
}: Props) {
  const hasHeader = Boolean(eyebrow || description || filters?.length || showSearch || footer)

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-slate-200 bg-slate-50/70',
        className
      )}
    >
      {hasHeader ? (
        <div className="shrink-0 space-y-3 border-b border-slate-200 p-3">
          {eyebrow ? <p className={typography('eyebrow')}>{eyebrow}</p> : null}
          {description ? (
            <p className={cn(typography('bodySm'), !eyebrow && 'mt-0', 'text-slate-500')}>
              {description}
            </p>
          ) : null}

          {showSearch && onSearchChange ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                className="w-full bg-transparent text-sm text-slate-800 outline-none"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
          ) : null}

          {filters && filters.length > 0 && onFilterChange ? (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => {
                const active = activeFilter === filter.key
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => onFilterChange(filter.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      active
                        ? chatTheme.sidebarChipActive
                        : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/60'
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      {filter.label}
                      {filter.badge && filter.badge > 0 ? (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] text-white">
                          {filter.badge}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {footer}
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-2', listClassName)}>
        {loading ? (
          <p className="px-2 py-3 text-sm text-slate-500">Carregant…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <SidebarItemButton
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  )
}
