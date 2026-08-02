import { cn } from '@/lib/utils'

export const corporateFilterLabelClass =
  'text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600'

export const corporateFilterFieldClass =
  'h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60'

export const corporateFilterShellClass =
  'overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.12)]'

export const corporateFilterHeaderClass =
  'flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50 px-5 py-3'

export const corporateFilterTitleClass =
  'text-sm font-bold uppercase tracking-[0.12em] text-slate-800'

export const corporateFilterBodyClass =
  'flex flex-wrap items-end gap-4 px-5 py-4'

export const corporateFilterToolbarBodyClass =
  'flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap'

export const corporateFilterBadgeBaseClass =
  'rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] transition'

export const corporateFilterBadgeInactiveClass =
  'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'

export const corporateFilterBadgeActiveClass =
  'border-slate-400 bg-slate-100 text-slate-900 ring-1 ring-slate-300'

export const corporateFilterChipClass =
  'h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm'

export const corporateFilterIconButtonClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100'

export function corporateFilterBadgeClass(active: boolean, extra?: string) {
  return cn(
    corporateFilterBadgeBaseClass,
    active ? corporateFilterBadgeActiveClass : corporateFilterBadgeInactiveClass,
    extra
  )
}
