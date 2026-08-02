'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { corporateFilterLabelClass } from '@/lib/corporate-filters'

type Props = {
  label: string
  children: ReactNode
  className?: string
  htmlFor?: string
}

export default function CorporateFilterField({
  label,
  children,
  className,
  htmlFor,
}: Props) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className={corporateFilterLabelClass}>
        {label}
      </label>
      {children}
    </div>
  )
}
