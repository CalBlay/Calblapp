'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type RobaProductPick = {
  id: string
  code: string
  name: string
  /** Opcional: la talla pot anar dins la descripció de l’article. */
  size?: string
  supplier: string
  quantityOnHand?: number
  quantityReserved?: number
  grup?: string | null
  familia?: string | null
  subfamilia?: string | null
  departments?: string[] | null
}

function sizeSuffix(size: string | undefined | null) {
  const s = (size ?? '').trim()
  return s ? ` · talla ${s}` : ''
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
  /** Text del botó quan no hi ha selecció (per defecte: «Cercar producte…»). */
  placeholder?: string
  /** Placeholder del camp de cerca dins el desplegable (per defecte text d’ajuda). */
  commandInputPlaceholder?: string
  disabled?: boolean
  className?: string
  /** Mostra estoc a la llista (p. ex. entregues). */
  showStockHint?: boolean
  /**
   * `list`: llista amb botons natius (sense cmdk). Evita problemes de clic dins de
   * formularis / Popover on cmdk no rep bé la selecció amb el ratolí.
   */
  variant?: 'command' | 'list'
}

export function ProductSearchCombobox({
  products,
  value,
  onChange,
  placeholder = 'Cercar producte…',
  commandInputPlaceholder = 'Codi, nom, classificació, proveïdor…',
  disabled,
  className,
  showStockHint,
  variant = 'list',
}: Props) {
  const [open, setOpen] = useState(false)
  /** Cerca controlada: evita conflictes cmdk + Popper que impedeixen el clic a l’ítem. */
  const [search, setSearch] = useState('')
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const selected = value ? byId.get(value) : undefined

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const filteredProducts = useMemo(() => {
    const q = fold(search.trim())
    if (!q) return products
    return products.filter((p) => {
      const hay = fold(
        [
          p.code,
          p.name,
          p.size,
          p.supplier,
          p.grup,
          p.familia,
          p.subfamilia,
          ...(p.departments ?? []),
        ]
          .filter(Boolean)
          .join(' ')
      )
      if (hay.includes(q)) return true
      const tokens = q.split(/\s+/).filter(Boolean)
      return tokens.length > 0 && tokens.every((t) => hay.includes(t))
    })
  }, [products, search])

  const stockHint = (p: RobaProductPick) => {
    if (!showStockHint || p.quantityOnHand === undefined) return ''
    const hand = Math.max(0, Number(p.quantityOnHand))
    const res = Math.max(0, Number(p.quantityReserved ?? 0))
    const avail = Math.max(0, hand - res)
    return ` · físic ${hand} · disp. ${avail}${res > 0 ? ` · reservat ${res}` : ''}`
  }

  const labelSelected = selected
    ? `${selected.code} — ${selected.name}${sizeSuffix(selected.size)}${stockHint(selected)}`
    : null

  return (
    <Popover modal={variant === 'list'} open={open} onOpenChange={setOpen}>
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
          <span className="truncate text-left">
            {labelSelected ?? (placeholder === '' ? '—' : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(calc(100vw-2rem),28rem)] z-[500]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          if (variant === 'list') e.preventDefault()
        }}
      >
        {variant === 'list' ? (
          <div className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
            <div className="flex items-center border-b px-3">
              <Input
                placeholder={commandInputPlaceholder}
                className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm rounded-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
              {filteredProducts.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  Cap producte coincideix.
                </div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-left',
                      'hover:bg-accent hover:text-accent-foreground'
                    )}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onChange(p.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        value === p.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="break-words text-sm leading-snug">
                        {p.code} — {p.name}
                        {sizeSuffix(p.size)}
                      </span>
                      <span className="break-words text-xs text-muted-foreground leading-snug">
                        {p.supplier}
                        {stockHint(p)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={commandInputPlaceholder}
              className="h-10"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="py-3 text-xs">Cap producte coincideix.</CommandEmpty>
              {filteredProducts.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === p.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words text-sm leading-snug">
                      {p.code} — {p.name}
                      {sizeSuffix(p.size)}
                    </span>
                    <span className="break-words text-xs text-muted-foreground leading-snug">
                      {p.supplier}
                      {stockHint(p)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
