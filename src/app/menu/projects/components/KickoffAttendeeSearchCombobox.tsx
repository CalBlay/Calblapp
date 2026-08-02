'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ResponsibleOption } from './project-workspace-helpers'

type Props = {
  options: ResponsibleOption[]
  onPick: (user: ResponsibleOption) => void
  disabled?: boolean
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function filterOptions(options: ResponsibleOption[], query: string) {
  const normalizedQuery = fold(query.trim())
  if (!normalizedQuery) return []

  return options
    .filter((option) => {
      const haystack = fold(
        [option.name, option.email, option.department || ''].filter(Boolean).join(' ')
      )
      if (haystack.includes(normalizedQuery)) return true
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
      return tokens.length > 0 && tokens.every((token) => haystack.includes(token))
    })
    .slice(0, 20)
}

export default function KickoffAttendeeSearchCombobox({ options, onPick, disabled }: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => filterOptions(options, search), [options, search])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          disabled={disabled}
          placeholder="Cerca per nom, correu o departament per afegir…"
          className="pl-9"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value)
            setOpen(true)
          }}
        />
      </div>

      {open && search.trim() ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">Cap usuari trobat.</p>
          ) : (
            <ul className="p-1">
              {results.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-100'
                    )}
                    onClick={() => {
                      onPick(option)
                      setSearch('')
                      setOpen(false)
                    }}
                  >
                    <p className="text-sm font-medium text-slate-900">{option.name}</p>
                    <p className="text-xs text-slate-500">
                      {option.email}
                      {option.department ? ` · ${option.department}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
