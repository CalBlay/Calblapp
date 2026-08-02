'use client'

import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { corporateFilterFieldClass } from '@/lib/corporate-filters'

type Option = {
  value: string
  label: string
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options?: Option[]
  minWidthClassName?: string
  children?: ReactNode
}

export default function CorporateFilterSelect({
  options = [],
  className,
  minWidthClassName = 'min-w-[160px]',
  children,
  ...props
}: Props) {
  return (
    <select className={cn(corporateFilterFieldClass, minWidthClassName, className)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  )
}
