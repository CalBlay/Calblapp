'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDialogComboboxPortalContainer } from '@/lib/dialogComboboxPortal'

interface Props {
  value?: string
  onChange: (val: string) => void
  disabled?: boolean
}

/**
 * Cerca de clients (noms Zoho desats a Firestore) amb entrada lliure.
 * Dins modals Radix, el desplegable es renderitza dins DialogContent (no a body).
 */
export default function SearchZohoClientInput({
  value = '',
  onChange,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<string[]>([])
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
    const t = setTimeout(async () => {
      try {
        const trimmed = query.trim()
        const url =
          trimmed.length >= 1
            ? `/api/spaces/clients?q=${encodeURIComponent(trimmed)}`
            : '/api/spaces/clients'
        const res = await fetch(url)
        const json = await res.json()
        const data = Array.isArray(json.data) ? json.data : []
        setResults(data.slice(0, 50))
      } catch (err) {
        console.error('Error cercant clients:', err)
        setResults([])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const handleSelect = (name: string) => {
    selectingRef.current = true
    onChange(name)
    setQuery(name)
    setOpen(false)
    requestAnimationFrame(() => {
      selectingRef.current = false
    })
  }

  const dropdown =
    open && results.length > 0 ? (
      <AnimatePresence>
        <motion.div
          key="zoho-client-dropdown"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-[120] bg-white border border-gray-200 rounded-lg shadow-lg max-h-[220px] overflow-y-auto"
          data-zoho-client-dropdown
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          {results.map((name) => (
            <div
              key={name}
              role="option"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleSelect(name)
              }}
              className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-blue-100"
            >
              {name}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    ) : null

  return (
    <div className="relative w-full" data-zoho-client-search>
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
        placeholder="Cerca o escriu el nom del client…"
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

      {mounted && portalContainer && dropdown
        ? createPortal(dropdown, portalContainer)
        : null}
    </div>
  )
}
