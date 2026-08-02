'use client'

import { Search } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { corporateFilterFieldClass } from '@/lib/corporate-filters'

type Props = InputHTMLAttributes<HTMLInputElement>

export default function CorporateFilterSearch({ className, ...props }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input className={cn(corporateFilterFieldClass, 'w-full pl-10', className)} {...props} />
    </div>
  )
}
