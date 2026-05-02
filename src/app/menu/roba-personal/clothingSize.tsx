'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Totes les talles predefinides del mòdul (ordre mostrat al desplegable). */
export const CLOTHING_SIZE_PRESETS = ['S', 'M', 'L', 'XL', 'XXL'] as const

const OTHER_VALUE = '__altres__'

const selectBaseClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1'

function optionsForDisplay(size: string): string[] {
  const v = size.trim()
  const base: string[] = [...CLOTHING_SIZE_PRESETS]
  if (v && !base.includes(v)) base.push(v)
  return base
}

type ClothingSizeFieldProps = {
  id?: string
  value: string
  onChange: (next: string) => void
  label?: string
  className?: string
}

/** Desplegable editable: S…XXL + Altres amb camp manual. */
export function ClothingSizeField({
  id,
  value,
  onChange,
  label = 'Talla',
  className,
}: ClothingSizeFieldProps) {
  const presets = CLOTHING_SIZE_PRESETS as readonly string[]
  const v = value.trim()
  const isPreset = presets.includes(v)
  const [otherEmpty, setOtherEmpty] = useState(false)

  useEffect(() => {
    const t = value.trim()
    const preset = (CLOTHING_SIZE_PRESETS as readonly string[]).includes(t)
    if (preset || t !== '') setOtherEmpty(false)
  }, [value])

  const selectValue = useMemo(() => {
    if (presets.includes(v)) return v
    if (v !== '') return OTHER_VALUE
    if (otherEmpty) return OTHER_VALUE
    return ''
  }, [v, otherEmpty, presets])

  return (
    <div className={className}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <select
        id={id}
        className={selectBaseClass}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value
          if (next === '') {
            setOtherEmpty(false)
            onChange('')
            return
          }
          if (next === OTHER_VALUE) {
            setOtherEmpty(true)
            onChange('')
            return
          }
          setOtherEmpty(false)
          onChange(next)
        }}
      >
        <option value="">— Trieu —</option>
        {presets.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER_VALUE}>Altra talla o numeració del proveïdor</option>
      </select>
      {selectValue === OTHER_VALUE && (
        <div className="mt-2 space-y-1">
          <Input
            id={id ? `${id}-manual` : undefined}
            value={isPreset ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Escriu només la talla (p. ex. 38, 42, 2XL proveïdor…)"
            aria-label="Talla o numeració personalitzada"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground leading-snug">
            Escriviu només el codi de talla que vulgueu desar (p. ex. la numeració del proveïdor). No cal
            copiar cap text del desplegable.
          </p>
        </div>
      )}
    </div>
  )
}

type ClothingSizeReadOnlyProps = {
  value: string
  className?: string
}

/** Mateix aspecte de desplegable, desactivat (talla ve del producte triat). */
export function ClothingSizeReadOnly({ value, className }: ClothingSizeReadOnlyProps) {
  const v = value.trim()
  const opts = optionsForDisplay(v)
  const empty = !v

  return (
    <select
      disabled
      aria-readonly="true"
      title={empty ? 'Trieu un producte' : `Talla: ${v}`}
      className={cn(
        selectBaseClass,
        'cursor-default opacity-100 border-dashed bg-muted/40 font-medium tabular-nums',
        className
      )}
      value={empty ? '' : v}
    >
      {empty ? (
        <option value="">—</option>
      ) : (
        opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))
      )}
    </select>
  )
}
