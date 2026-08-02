'use client'

import { useEffect, useMemo, useState } from 'react'

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

type Props = {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function MachineLocationSearchInput({
  options,
  value,
  onChange,
  placeholder = 'Escriu 2 lletres per cercar ubicacio',
}: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const suggestions = useMemo(() => {
    const q = normalizeText(query)
    if (q.length < 2) return []

    return options
      .map((option) => {
        const normalized = normalizeText(option)
        const compact = normalized.replace(/\s+/g, '')
        const compactQuery = q.replace(/\s+/g, '')

        let score = -1
        if (normalized.startsWith(q)) score = 0
        else if (compact.startsWith(compactQuery)) score = 1
        else if (normalized.includes(q)) score = 2
        else if (compact.includes(compactQuery)) score = 3

        return { option, score }
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score || a.option.localeCompare(b.option, 'ca', { sensitivity: 'base' }))
      .slice(0, 8)
      .map((item) => item.option)
  }, [options, query])

  const showSuggestions = open && query.trim().length >= 2

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          onChange(next)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-slate-200 px-4"
      />

      {showSuggestions ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
          {suggestions.length > 0 ? (
            suggestions.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(option)
                  onChange(option)
                  setOpen(false)
                }}
                className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500">Sense coincidencies</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
