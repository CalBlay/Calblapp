'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const ModuleNotificationsBellContext = createContext<(() => void) | null>(null)

export function useCloseModuleNotificationsBell() {
  return useContext(ModuleNotificationsBellContext)
}

type Props = {
  title: string
  count: number
  children: ReactNode
  headerActions?: ReactNode
  footer?: ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
  /** Mostra la campaneta encara que no hi hagi avisos pendents. */
  showWhenEmpty?: boolean
  emptyMessage?: string
}

export default function ModuleNotificationsBell({
  title,
  count,
  children,
  headerActions,
  footer,
  align = 'end',
  className,
  showWhenEmpty = false,
  emptyMessage = 'Cap avís pendent',
}: Props) {
  const [open, setOpen] = useState(false)

  if (count <= 0 && !showWhenEmpty) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50',
            className
          )}
          aria-label={count > 0 ? `${title} (${count})` : title}
        >
          <Bell className="h-4 w-4" />
          {count > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(100vw-2rem,28rem)] overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ModuleNotificationsBellContext.Provider value={() => setOpen(false)}>
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                <p className="text-xs text-gray-500">
                  {count > 0
                    ? `${count} ${count === 1 ? 'pendent' : 'pendents'}`
                    : emptyMessage}
                </p>
              </div>
              {headerActions && count > 0 ? (
                <div className="shrink-0">{headerActions}</div>
              ) : null}
            </div>
          </div>
          <div className="max-h-[min(60vh,24rem)] space-y-1 overflow-y-auto p-2">
            {count > 0 ? children : (
              <p className="px-2 py-6 text-center text-sm text-gray-500">{emptyMessage}</p>
            )}
          </div>
          {footer ? (
            <div className="border-t border-gray-100 px-3 py-2">{footer}</div>
          ) : null}
        </ModuleNotificationsBellContext.Provider>
      </PopoverContent>
    </Popover>
  )
}
