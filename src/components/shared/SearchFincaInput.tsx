'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDialogComboboxPortalContainer } from '@/lib/dialogComboboxPortal'

const MIN_QUERY_LENGTH = 2

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

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function fincaLabel(finca: Finca): string {
  const nom = String(finca.nom || '').trim()
  const codi = String(finca.codi || '').trim()
  if (nom && codi) return `${nom} (${codi})`
  return nom || codi
}

/**
 * Cerca intel·ligent de finques (col·lecció `finques`).
 * Només es pot triar un registre de la llista.
 */
export default function SearchFincaInput({
  value = '',
  onChange,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(value)
  const [allFincas, setAllFincas] = useState<Finca[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectingRef = useRef(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!selectingRef.current) {
      setQuery(value || '')
    }
  }, [value])

  useEffect(() => setMounted(true), [])

  const loadFincas = useCallback(async () => {
    if (loadedRef.current || loading) return
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/fincas/search')
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const data = Array.isArray(json.data) ? json.data : []
      setAllFincas(
        data
          .map((f: Record<string, unknown>) => ({
            id: String(f.id || ''),
            nom: String(f.nom || '').trim(),
            codi: String(f.codi || '').trim(),
          }))
          .filter((f: Finca) => f.nom || f.codi)
      )
      loadedRef.current = true
    } catch (err) {
      console.error('Error carregant finques:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [loading])

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return
    const container = getDialogComboboxPortalContainer(inputRef.current)
    if (!container) return
    const r = inputRef.current.getBoundingClientRect()
    const c = container.getBoundingClientRect()
    setPos({
      top: r.bottom - c.top + 4,
      left: r.left - c.left,
      width: r.width,
    })
    setPortalContainer(container)
  }, [])

  const filtered = useMemo(() => {
    const q = fold(query.trim())
    if (q.length < MIN_QUERY_LENGTH) return []
    return allFincas.filter((f) => {
      const nom = fold(f.nom)
      const codi = fold(f.codi)
      const label = fold(fincaLabel(f))
      return nom.includes(q) || codi.includes(q) || label.includes(q)
    })
  }, [allFincas, query])

  const canShowDropdown =
    open && query.trim().length >= MIN_QUERY_LENGTH && (loading || loadError || loadedRef.current)

  useEffect(() => {
    if (!canShowDropdown) return
    updateDropdownPosition()
  }, [canShowDropdown, filtered.length, loading, updateDropdownPosition])

  const handleSelect = (finca: Finca) => {
    const label = fincaLabel(finca)
    if (!label) return
    selectingRef.current = true
    onChange(label)
    setQuery(label)
    setOpen(false)
    requestAnimationFrame(() => {
      selectingRef.current = false
    })
  }

  const handleFocus = () => {
    setOpen(true)
    void loadFincas()
    requestAnimationFrame(() => updateDropdownPosition())
  }

  const dropdown = canShowDropdown ? (
    <AnimatePresence>
      <motion.div
        key="finca-dropdown"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute z-[120] bg-white border border-gray-200 rounded-lg shadow-lg max-h-[250px] overflow-y-auto"
        data-finca-dropdown
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
        }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Carregant finques…</div>
        ) : loadError ? (
          <div className="px-3 py-2 text-sm text-red-600">
            No s&apos;han pogut carregar les finques.
          </div>
        ) : allFincas.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">
            Cap finca disponible a la col·lecció.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">
            Cap finca coincideix amb la cerca.
          </div>
        ) : (
          filtered.slice(0, 80).map((f, index) => (
            <div
              key={f.id || `${f.codi}-${f.nom}` || `finca-${index}`}
              role="option"
              aria-selected={fincaLabel(f) === value.trim()}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleSelect(f)
              }}
              className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-blue-100"
            >
              <div className="font-medium">{f.nom || f.codi}</div>
              {f.codi ? (
                <div className="text-xs text-gray-500">{f.codi}</div>
              ) : null}
            </div>
          ))
        )}
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
          setQuery(e.target.value)
          setOpen(true)
          requestAnimationFrame(() => updateDropdownPosition())
        }}
        onFocus={handleFocus}
        onBlur={() => {
          if (selectingRef.current) return
          setTimeout(() => {
            if (selectingRef.current) return
            setOpen(false)
            setQuery(value || '')
          }, 150)
        }}
        placeholder="Cerca finca (mín. 2 lletres)…"
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

      {mounted && portalContainer && dropdown
        ? createPortal(dropdown, portalContainer)
        : null}
    </div>
  )
}
