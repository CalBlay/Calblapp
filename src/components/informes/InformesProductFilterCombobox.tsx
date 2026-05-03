'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type InformesProductOption = { id: string; label: string }

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

type Props = {
  options: InformesProductOption[]
  value: string
  onChange: (productId: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Selector cercable d’articles per filtres d’informe (sense dependre del catàleg complet de roba).
 */
export function InformesProductFilterCombobox({
  options,
  value,
  onChange,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const selected = value ? byId.get(value) : undefined

  const filtered = useMemo(() => {
    const q = fold(search.trim())
    if (!q) return options
    return options.filter((o) => fold(o.label).includes(q))
  }, [options, search])

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between font-normal px-3',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate text-left">{selected?.label ?? 'Tots els articles'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(calc(100vw-2rem),28rem)] z-[500]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
          <div className="flex items-center border-b px-3">
            <Input
              placeholder="Codi, nom, talla…"
              className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm rounded-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
            <button
              type="button"
              className={cn(
                'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-left',
                'hover:bg-accent hover:text-accent-foreground'
              )}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange('')
                setOpen(false)
              }}
            >
              <Check className={cn('mr-2 h-4 w-4 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')} />
              <span className="text-muted-foreground">Sense filtre d&apos;article</span>
            </button>
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">Cap article coincideix.</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-left',
                    'hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange(o.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === o.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate text-sm">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
