'use client'

import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  prefix?: ReactNode
  primary: string
  secondary?: string
  detail?: string
  onOpen?: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
  dismissible?: boolean
  className?: string
}

export default function NotificationListItem({
  prefix,
  primary,
  secondary,
  detail,
  onOpen,
  onDismiss,
  dismissible = true,
  className,
}: Props) {
  const hasLink = Boolean(onOpen)
  const showDismiss = dismissible && Boolean(onDismiss)

  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm',
        className
      )}
    >
      {prefix ? <div className="shrink-0">{prefix}</div> : null}

      <div className="min-w-0 flex-1">
        {hasLink ? (
          <button
            type="button"
            className="w-full min-w-0 text-left"
            onClick={() => void onOpen?.()}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate font-semibold text-slate-900 hover:text-violet-700 hover:underline">
                {primary}
              </span>
              {secondary ? <span className="text-slate-400">·</span> : null}
              {secondary ? (
                <span className="truncate text-sm text-slate-500">{secondary}</span>
              ) : null}
            </div>
            {detail ? <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p> : null}
          </button>
        ) : (
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate font-semibold text-slate-900">{primary}</span>
              {secondary ? <span className="text-slate-400">·</span> : null}
              {secondary ? (
                <span className="truncate text-sm text-slate-500">{secondary}</span>
              ) : null}
            </div>
            {detail ? <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p> : null}
          </div>
        )}
      </div>

      {showDismiss ? (
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200"
          aria-label="Marcar com a llegit"
          onClick={() => void onDismiss?.()}
        >
          <CheckCircle2 className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  )
}
