'use client'

import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  value: React.ReactNode
  note?: React.ReactNode
  className?: string
}

export default function MaintenanceKpiCard({ title, value, note, className }: Props) {
  return (
    <div className={cn('rounded-2xl border px-4 py-3', className)}>
      <div className={typography('eyebrow')}>{title}</div>
      <div className={cn('mt-2', typography('kpiValue'))}>{value}</div>
      {note ? <div className={cn('mt-2', typography('kpiNote'))}>{note}</div> : null}
    </div>
  )
}
