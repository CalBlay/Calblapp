//file: src/components/shared/SearchServeiInput.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Servei {
  nom: string
  codi: string
}

interface Props {
  value?: string
  onChange: (val: string) => void
}

export default function SearchServeiInput({ value, onChange }: Props) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState<Servei[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  // 🔁 sincronitza amb el valor del pare
  useEffect(() => setQuery(value || ''), [value])
  useEffect(() => setMounted(true), [])

  // 🔍 cerca reactiva amb debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/serveis/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults(Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [])

      } catch (err) {
        console.error('❌ Error cercant serveis:', err)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  // 📏 posició del desplegable
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
    <div className="relative w-full" data-servei-search>
      <div className="absolute left-2 top-2.5 text-gray-400 pointer-events-none">
        <Search className="w-4 h-4" />
      </div>

      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca servei..."
        className="pl-8 w-full text-sm sm:text-base rounded-md border-gray-300 focus:ring-2 focus:ring-blue-500"
      />

     {/* 📋 Desplegable amb animació */}
{mounted && inputRef.current && results.length > 0 &&
  createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="servei-dropdown"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-md shadow-md max-h-[250px] overflow-y-auto scroll-smooth"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {results.map((s) => (
            <div
              key={s.codi}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(s.nom)
                setQuery(`${s.nom} (${s.codi})`)
                setOpen(false)
              }}
              className="px-3 py-2 text-sm hover:bg-blue-100 cursor-pointer transition-colors"
            >
              <div className="font-medium">{s.nom}</div>
              <div className="text-xs text-gray-500">{s.codi}</div>
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
