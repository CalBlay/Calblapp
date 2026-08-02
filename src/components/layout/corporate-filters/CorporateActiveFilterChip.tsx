'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { corporateFilterBadgeClass } from '@/lib/corporate-filters'

type Variant = 'default' | 'active' | 'amber' | 'rose'

const variantClass: Record<Variant, string | undefined> = {
  default: undefined,
  active: undefined,
  amber: 'border-amber-200 bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'border-rose-200 bg-rose-50 text-rose-800 ring-rose-200',
}

type Props = {
  children: ReactNode
  variant?: Variant
  className?: string
}

export default function CorporateActiveFilterChip({
  children,
  variant = 'default',
  className,
}: Props) {
  const isActive = variant === 'active'
  return (
    <span
      className={cn(
        corporateFilterBadgeClass(isActive),
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
