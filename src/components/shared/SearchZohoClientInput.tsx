'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { LazyAnimatePresence, MotionDiv } from '@/lib/lazyMotion'
import { getDialogComboboxPortalContainer } from '@/lib/dialogComboboxPortal'

const MIN_QUERY_LENGTH = 2

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

/**
 * Cerca intel·ligent de clients (camp `nom` de spaces_zoho_accounts
 * i spaces_zoho_clients). Només es pot triar un registre de la llista.
 */
export default function SearchZohoClientInput({
  value = '',
  onChange,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(value)
  const [allClients, setAllClients] = useState<string[]>([])
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

  const loadClients = useCallback(async () => {
    if (loadedRef.current || loading) return
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/spaces/clients')
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const data = Array.isArray(json.data) ? json.data : []
      setAllClients(
        data.filter((nom: unknown) => typeof nom === 'string' && nom.trim())
      )
      loadedRef.current = true
    } catch (err) {
      console.error('Error carregant clients:', err)
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
    return allClients.filter((nom) => fold(nom).includes(q))
  }, [allClients, query])

  const canShowDropdown =
    open && query.trim().length >= MIN_QUERY_LENGTH && (loading || loadError || loadedRef.current)

  useEffect(() => {
    if (!canShowDropdown) return
    updateDropdownPosition()
  }, [canShowDropdown, filtered.length, loading, updateDropdownPosition])

  const handleSelect = (nom: string) => {
    selectingRef.current = true
    onChange(nom)
    setQuery(nom)
    setOpen(false)
    requestAnimationFrame(() => {
      selectingRef.current = false
    })
  }

  const handleFocus = () => {
    setOpen(true)
    void loadClients()
    requestAnimationFrame(() => updateDropdownPosition())
  }

  const dropdown = canShowDropdown ? (
    <LazyAnimatePresence>
      <MotionDiv
        key="zoho-client-dropdown"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute z-[120] bg-white border border-gray-200 rounded-lg shadow-lg max-h-[250px] overflow-y-auto"
        data-zoho-client-dropdown
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
        }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Carregant clients…</div>
        ) : loadError ? (
          <div className="px-3 py-2 text-sm text-red-600">
            No s&apos;han pogut carregar els clients.
          </div>
        ) : allClients.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">
            Cap client disponible. Cal importar oportunitats de Zoho.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">
            Cap client coincideix amb la cerca.
          </div>
        ) : (
          filtered.slice(0, 80).map((nom) => (
            <div
              key={nom}
              role="option"
              aria-selected={nom === value.trim()}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleSelect(nom)
              }}
              className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-blue-100"
            >
              {nom}
            </div>
          ))
        )}
      </MotionDiv>
    </LazyAnimatePresence>
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
        placeholder="Cerca client (mín. 2 lletres)…"
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

      {mounted && portalContainer && dropdown
        ? createPortal(dropdown, portalContainer)
        : null}
    </div>
  )
}
