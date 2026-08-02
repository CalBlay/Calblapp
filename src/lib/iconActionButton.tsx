'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type IconActionButtonTone = 'default' | 'danger'

const toneClasses: Record<IconActionButtonTone, string> = {
  default:
    'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700',
  danger:
    'border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700',
}

export interface IconActionButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'children' | 'size' | 'variant'> {
  icon: LucideIcon
  label: string
  tone?: IconActionButtonTone
}

export function IconActionButton({
  icon: Icon,
  label,
  tone = 'default',
  className,
  ...props
}: IconActionButtonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
            className={cn(
              'h-8 w-8 rounded-full shadow-sm transition-all duration-150',
              toneClasses[tone],
              className
            )}
            {...props}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
