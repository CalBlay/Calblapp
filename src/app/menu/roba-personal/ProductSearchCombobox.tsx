'use client'

import React, { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export type RobaProductPick = {
  id: string
  code: string
  name: string
  size: string
  supplier: string
  quantityOnHand?: number
}

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

type Props = {
  products: RobaProductPick[]
  value: string
  onChange: (productId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Mostra estoc a la llista (p. ex. entregues). */
  showStockHint?: boolean
}

export function ProductSearchCombobox({
  products,
  value,
  onChange,
  placeholder = 'Cercar producte…',
  disabled,
  className,
  showStockHint,
}: Props) {
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const selected = value ? byId.get(value) : undefined

  const filterFn = (id: string, search: string) => {
    const p = byId.get(id)
    if (!p) return 0
    const q = fold(search.trim())
    if (!q) return 1
    const hay = fold([p.code, p.name, p.size, p.supplier].join(' '))
    if (hay.includes(q)) return 1
    const tokens = q.split(/\s+/).filter(Boolean)
    if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) return 1
    return 0
  }

  const labelSelected = selected
    ? `${selected.code} — ${selected.name} · talla ${selected.size}${
        showStockHint && selected.quantityOnHand !== undefined
          ? ` · estoc ${selected.quantityOnHand}`
          : ''
      }`
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <span className="truncate text-left">{labelSelected ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(calc(100vw-2rem),28rem)]"
        align="start"
        sideOffset={4}
      >
        <Command filter={filterFn}>
          <CommandInput placeholder="Codi, nom, talla, proveïdor…" className="h-10" />
          <CommandList>
            <CommandEmpty className="py-3 text-xs">Cap producte coincideix.</CommandEmpty>
            {products.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={(id) => {
                  onChange(id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn('mr-2 h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">
                    {p.code} — {p.name} · talla {p.size}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.supplier}
                    {showStockHint && p.quantityOnHand !== undefined
                      ? ` · estoc ${p.quantityOnHand}`
                      : ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
