import { corporateFilterBadgeClass } from '@/lib/corporate-filters'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import { cn } from '@/lib/utils'
import type { EventComandaStatus } from './types'

/** Badges d'estat alineats amb la paleta corporativa (`colors.ts`, manteniment, filtres). */
export const EVENT_COMANDA_STATUS_BADGES: Record<EventComandaStatus, string> = {
  no_template: 'border-slate-200 bg-slate-50 text-slate-700',
  template_ready: 'border-amber-200 bg-amber-50 text-amber-900',
  order_draft: 'border-amber-200 bg-amber-50 text-amber-900',
  order_sent: 'border-sky-200 bg-sky-50 text-sky-900',
  order_in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  order_closed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  replenishment_pending: 'border-rose-200 bg-rose-50 text-rose-900',
}

export const EVENT_COMANDA_ICON_CLASS: Record<EventComandaStatus, string> = {
  no_template: 'text-slate-400',
  template_ready: 'text-amber-600',
  order_draft: 'text-amber-600',
  order_sent: 'text-sky-600',
  order_in_progress: 'text-indigo-600',
  order_closed: 'text-emerald-600',
  replenishment_pending: 'text-rose-600',
}

export function eventComandaStatusBadgeClass(status: EventComandaStatus) {
  return corporateFilterBadgeClass(true, EVENT_COMANDA_STATUS_BADGES[status])
}

export function eventComandaIconClass(status?: EventComandaStatus | null) {
  return EVENT_COMANDA_ICON_CLASS[status || 'no_template']
}

export const eventComandaPageShellClass =
  'flex w-full max-w-none flex-col gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-4 sm:pb-8'

export const eventComandaModuleShellClass =
  'w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.12)] sm:rounded-[24px]'

export const eventComandaHeaderBarClass =
  'border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50 px-3 py-3.5 sm:px-5 sm:py-4 lg:px-6 xl:px-8'

export const eventComandaBodyClass = 'w-full p-3 sm:p-5 lg:p-6 xl:px-8 xl:py-7'

/** Layout plantilla: metadades | llista ampla; accions sota metadades en desktop. */
export const eventComandaTemplateLayoutClass =
  'flex w-full flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-x-8'

export const eventComandaTemplateMetaClass = 'order-1 min-w-0 lg:col-start-1 lg:row-start-1'

export const eventComandaTemplateActionsClass =
  'order-3 min-w-0 space-y-4 lg:sticky lg:top-4 lg:col-start-1 lg:row-start-2 lg:self-start'

export const eventComandaTemplateMainClass =
  'order-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2'

/** Fila intro + contingut principal en desktop (import sense plantilla). */
export const eventComandaDesktopSplitClass =
  'w-full space-y-4 sm:space-y-5 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-8'

export const eventComandaSidebarClass = 'w-full min-w-0 space-y-4 lg:sticky lg:top-4'

export const eventComandaMainColumnClass = 'w-full min-w-0'

export const eventComandaPanelClass =
  'w-full space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:space-y-4 sm:p-4 lg:p-5'

export const eventComandaPreviewMetaClass =
  'space-y-2 lg:flex lg:items-start lg:justify-between lg:gap-6 lg:space-y-0'

export const eventComandaActionBarClass =
  'sticky bottom-0 z-10 -mx-3 border-t border-slate-200/80 bg-slate-50/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none lg:static'

export const eventComandaActionGridClass =
  'grid grid-cols-2 gap-2 lg:flex lg:justify-start xl:justify-end'

export const eventComandaPrimaryButtonClass =
  'min-h-11 w-full touch-manipulation lg:w-auto'

export const eventComandaLinesScrollClass =
  'max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-contain pr-0.5 touch-pan-y sm:max-h-[min(55dvh,32rem)] lg:max-h-none lg:overflow-visible'

export const eventComandaPrefixListClass = 'w-full'

export const eventComandaTableClass = 'w-full min-w-[20rem] border-collapse text-sm'

export const eventComandaTableHeadCellClass =
  'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'

export const eventComandaTableGroupRowClass = 'border-t border-slate-200 bg-slate-100/80 first:border-t-0'

export const eventComandaTableRowClass = 'border-t border-slate-100 hover:bg-slate-50/60'

export const eventComandaTableQtyCellClass =
  'px-3 py-2 text-right align-top text-sm font-semibold tabular-nums text-slate-800'

export const eventComandaFamilyGridClass =
  'grid grid-cols-1 gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

export const eventComandaFamilySectionClass =
  'h-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3'

export const eventComandaFamilyHeaderClass =
  'mb-2 flex items-start justify-between gap-2 border-b border-slate-100 pb-2'

export const eventComandaLinesListClass = 'space-y-2 sm:space-y-1.5'

export const eventComandaLineRowClass = cn(
  'flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2',
  'md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0'
)

export const eventComandaLineQtyClass =
  'shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 md:px-2'

export function formatEventComandaQty(qty: number, unit?: string) {
  const normalizedUnit = eventComandaQtyUnit(unit)
  const formattedQty = Number.isInteger(qty)
    ? String(qty)
    : qty.toLocaleString('ca-ES', { maximumFractionDigits: 3 })
  return `${formattedQty} ${normalizedUnit}`
}

export function formatEventComandaGroupSummary(lines: Array<{ qtyInitial: number; qtyUnit?: string }>) {
  const units = new Set(lines.map((line) => eventComandaQtyUnit(line.qtyUnit)))
  if (units.size === 1) {
    const unit = [...units][0]
    const total = lines.reduce((sum, line) => sum + line.qtyInitial, 0)
    return `${lines.length} articles · ${formatEventComandaQty(total, unit)}`
  }
  return `${lines.length} articles`
}

export function eventComandaStatsClass(className?: string) {
  return cn(
    'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 sm:text-sm',
    className
  )
}
