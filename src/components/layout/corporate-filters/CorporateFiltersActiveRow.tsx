'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  className?: string
}

export default function CorporateFiltersActiveRow({ children, className }: Props) {
  return (
    <div className={cn('flex w-full flex-wrap gap-2 border-t border-slate-100 pt-3', className)}>
      {children}
    </div>
  )
}
