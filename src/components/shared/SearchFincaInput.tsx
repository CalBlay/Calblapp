// ✅ file: src/components/shared/SearchFincaInput.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Finca {
  nom: string
  codi: string
}

interface Props {
  value?: string
  onChange: (val: string) => void
}

/**
 * 🔍 Input amb cerca intel·ligent de finques
 * - Cerca a partir del segon caràcter
 * - Canvia color al passar-hi el ratolí
 * - Selecciona la finca amb un clic
 */
export default function SearchFincaInput({ value = '', onChange }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Finca[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const selectingRef = useRef(false)

  // 🔄 Sincronitza amb el valor del pare
  useEffect(() => {
    if (!selectingRef.current && value !== query) {
      setQuery(value)
    }
  }, [value])
  useEffect(() => setMounted(true), [])

  // 🔍 Cerca amb debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/fincas/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        const data = Array.isArray(json.data) ? json.data : []
        setResults(data)
      } catch (err) {
        console.error('❌ Error cercant finques:', err)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // 📏 Calcula posició del desplegable
  useEffect(() => {
    if (open && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setPos({
        top: r.bottom + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
      })
    }
  }, [open])

  return (
    <div className="relative w-full" data-finca-search>
      {/* Icona lupa */}
      <div className="absolute left-2 top-2.5 text-gray-400 pointer-events-none">
        <Search className="w-4 h-4" />
      </div>

      {/* Input principal */}
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!document.activeElement?.closest('[data-finca-search]')) {
              setOpen(false)
            }
          }, 150)
        }}
        placeholder="Cerca finca..."
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

      {/* Desplegable amb resultats */}
      {mounted && inputRef.current && results.length > 0 &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="finca-dropdown"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg max-h-[250px] overflow-y-auto"
                style={{
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {results.map((f) => (
                  <div
                    key={f.codi}
                    onMouseEnter={(e) => e.currentTarget.classList.add('bg-gray-100')}
                    onMouseLeave={(e) => e.currentTarget.classList.remove('bg-gray-100')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      selectingRef.current = true

                      onChange(f.nom)
                      setQuery(f.nom)
                      setOpen(false)

                      requestAnimationFrame(() => {
                        selectingRef.current = false
                      })
                    }}
                    className="px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-blue-100"
                  >
                    <div className="font-medium">{f.nom}</div>
                    <div className="text-xs text-gray-500">{f.codi}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
