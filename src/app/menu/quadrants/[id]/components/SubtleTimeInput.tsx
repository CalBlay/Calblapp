'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  compact?: boolean
  width?: string
}

export default function SubtleTimeInput({
  id,
  label,
  value,
  onChange,
  compact = false,
  width = 'w-[5.75rem]',
}: Props) {
  return (
    <div className="shrink-0">
      <Label
        htmlFor={id}
        className="mb-0.5 block pl-1 text-[10px] font-medium leading-none text-slate-400"
      >
        {label}
      </Label>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          width,
          'shrink-0 px-1.5 tabular-nums',
          compact ? 'h-8 text-xs' : 'h-9 text-sm'
        )}
        aria-label={label}
        title={label}
      />
    </div>
  )
}
