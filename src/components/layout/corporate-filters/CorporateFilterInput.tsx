'use client'

import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { corporateFilterFieldClass } from '@/lib/corporate-filters'

type Props = InputHTMLAttributes<HTMLInputElement>

export default function CorporateFilterInput({ className, ...props }: Props) {
  return <input className={cn(corporateFilterFieldClass, className)} {...props} />
}
