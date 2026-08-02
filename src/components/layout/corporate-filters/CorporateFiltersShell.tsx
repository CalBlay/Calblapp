'use client'

import type { ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  corporateFilterBodyClass,
  corporateFilterHeaderClass,
  corporateFilterShellClass,
  corporateFilterTitleClass,
  corporateFilterToolbarBodyClass,
} from '@/lib/corporate-filters'

type Props = {
  children: ReactNode
  title?: string
  variant?: 'panel' | 'toolbar'
  className?: string
  bodyClassName?: string
  sticky?: boolean
  showHeader?: boolean
}

export default function CorporateFiltersShell({
  children,
  title = 'Filtres de cerca',
  variant = 'panel',
  className,
  bodyClassName,
  sticky = false,
  showHeader = true,
}: Props) {
  return (
    <section
      className={cn(
        corporateFilterShellClass,
        sticky && 'sticky top-[56px] z-40',
        !showHeader && 'shadow-sm',
        className
      )}
    >
      {showHeader ? (
        <div className={corporateFilterHeaderClass}>
          <SlidersHorizontal className="h-4 w-4 text-slate-600" />
          <h2 className={corporateFilterTitleClass}>{title}</h2>
        </div>
      ) : null}
      <div
        className={cn(
          variant === 'toolbar' ? corporateFilterToolbarBodyClass : corporateFilterBodyClass,
          !showHeader && variant === 'toolbar' && 'px-3 py-2',
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
