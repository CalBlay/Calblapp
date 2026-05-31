'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDialogComboboxPortalContainer } from '@/lib/dialogComboboxPortal'

const MIN_QUERY_LENGTH = 3

interface Finca {
  id: string
  nom: string
  codi: string
}

interface Props {
  value?: string
  onChange: (val: string) => void
  disabled?: boolean
}

function selectFinca(
  finca: Finca,
  onChange: (val: string) => void,
  setQuery: (val: string) => void,
  setOpen: (open: boolean) => void,
  selectingRef: React.MutableRefObject<boolean>
) {
  const label = String(finca.nom || '').trim() || String(finca.codi || '').trim()
  if (!label) return

  selectingRef.current = true
  onChange(label)
  setQuery(label)
  setOpen(false)
  requestAnimationFrame(() => {
    selectingRef.current = false
  })
}

/**
 * Cerca intel·ligent de finques.
 * Dins modals Radix, el desplegable es renderitza dins DialogContent (no a body).
 */
export default function SearchFincaInput({
  value = '',
  onChange,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Finca[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectingRef = useRef(false)

  useEffect(() => {
    if (!selectingRef.current) {
      setQuery(value || '')
    }
  }, [value])

  useEffect(() => setMounted(true), [])

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({
      top: r.bottom,
      left: r.left,
      width: r.width,
    })
    setPortalContainer(getDialogComboboxPortalContainer(inputRef.current))
  }, [])

  useEffect(() => {
    if (!open) return
    updateDropdownPosition()
  }, [open, results.length, updateDropdownPosition])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/fincas/search?q=${encodeURIComponent(trimmed)}`
        )
        const json = await res.json()
        const data = Array.isArray(json.data) ? json.data : []
        setResults(data)
      } catch (err) {
        console.error('Error cercant finques:', err)
        setResults([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  const handleSelect = (finca: Finca) => {
    selectFinca(finca, onChange, setQuery, setOpen, selectingRef)
  }

  const handleOptionPointerDown = (e: React.PointerEvent, finca: Finca) => {
    e.preventDefault()
    e.stopPropagation()
    handleSelect(finca)
  }

  const dropdown =
    open && results.length > 0 ? (
      <AnimatePresence>
        <motion.div
          key="finca-dropdown"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-[120] bg-white border border-gray-200 rounded-lg shadow-lg max-h-[250px] overflow-y-auto"
          data-finca-dropdown
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          {results.map((f, index) => {
            const label = String(f.nom || '').trim() || String(f.codi || '').trim()
            return (
            <div
              key={f.id || `${f.codi}-${f.nom}` || `finca-${index}`}
              role="option"
              aria-selected={label === query.trim()}
              onPointerDown={(e) => handleOptionPointerDown(e, f)}
              className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-blue-100"
            >
              <div className="font-medium">{f.nom}</div>
              <div className="text-xs text-gray-500">{f.codi}</div>
            </div>
            )
          })}
        </motion.div>
      </AnimatePresence>
    ) : null

  return (
    <div className="relative w-full" data-finca-search>
      <div className="absolute left-2 top-2.5 text-gray-400 pointer-events-none">
        <Search className="w-4 h-4" />
      </div>

      <Input
        ref={inputRef}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          onChange(next)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (selectingRef.current) return
          setTimeout(() => {
            if (!selectingRef.current) setOpen(false)
          }, 150)
        }}
        placeholder="Cerca finca (mín. 3 lletres)…"
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

      {mounted && portalContainer && dropdown
        ? createPortal(dropdown, portalContainer)
        : null}
    </div>
  )
}
