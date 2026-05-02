'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { DocumentacioSearchResult } from '@/lib/documentacio-search'

const DEBOUNCE_MS = 420
/** Evita una lectura Firestore (via API) a cada lletra; 2+ caràcters com al servidor. */
const MIN_QUERY_LEN = 2

export function DocumentacioToolbar() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DocumentacioSearchResult[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchGenRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!debounced) {
      setResults([])
      setLoading(false)
      return
    }
    if (debounced.length < MIN_QUERY_LEN) {
      setResults([])
      setLoading(false)
      return
    }

    const ac = new AbortController()
    const gen = ++fetchGenRef.current
    setLoading(true)
    setResults([])
    const url = `/api/documentacio/search?q=${encodeURIComponent(debounced)}`
    fetch(url, { signal: ac.signal })
      .then((r) => r.json())
      .then((data: { results?: DocumentacioSearchResult[] }) => {
        if (fetchGenRef.current !== gen) return
        setResults(Array.isArray(data.results) ? data.results : [])
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (fetchGenRef.current !== gen) return
        setResults([])
      })
      .finally(() => {
        if (fetchGenRef.current === gen) setLoading(false)
      })

    return () => ac.abort()
  }, [debounced])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  const onFocusField = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    setOpen(true)
  }, [])

  const onBlurField = useCallback(() => {
    blurTimer.current = setTimeout(() => setOpen(false), 180)
  }, [])

  const trimmed = query.trim()
  const showPanel = open && trimmed.length > 0
  const showTooShort = showPanel && debounced.length > 0 && debounced.length < MIN_QUERY_LEN && !loading

  return (
    <div
      ref={wrapRef}
      className="sticky top-14 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-sm"
    >
      <div className="w-full py-[3px]">
        <div className="relative py-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={onFocusField}
            onBlur={onBlurField}
            placeholder="Cercar temes i documents…"
            className="h-11 rounded-xl border-slate-200 bg-white pl-10 pr-10 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            aria-label="Cercar a documentació"
            aria-expanded={showPanel}
            aria-controls="documentacio-search-results"
          />
          {loading ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
          ) : null}

          {showPanel ? (
            <div
              id="documentacio-search-results"
              role="listbox"
              className="absolute z-50 mt-1 max-h-[min(24rem,70vh)] w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              {showTooShort ? (
                <p className="px-4 py-3 text-sm text-slate-500">
                  Escriu almenys {MIN_QUERY_LEN} caràcters per cercar.
                </p>
              ) : null}
              {!showTooShort && results.length === 0 && !loading ? (
                <p className="px-4 py-3 text-sm text-slate-500">Sense resultats.</p>
              ) : null}
              {results.map((hit) => {
                if (hit.type === 'topic') {
                  return (
                    <Link
                      key={`t-${hit.ambit}-${hit.topicSlug}`}
                      role="option"
                      aria-selected={false}
                      href={hit.href}
                      onMouseDown={(e) => e.preventDefault()}
                      className={cn(
                        'block px-4 py-3 text-left text-sm focus-visible:bg-teal-50/60 focus-visible:outline-none',
                        'hover:bg-teal-50/60'
                      )}
                    >
                      <span className="font-medium text-slate-900">{hit.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Tema · {hit.ambitTitle}
                      </span>
                    </Link>
                  )
                }
                return (
                  <a
                    key={`d-${hit.id}`}
                    role="option"
                    aria-selected={false}
                    href={hit.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                      'block px-4 py-3 text-left text-sm focus-visible:bg-teal-50/60 focus-visible:outline-none',
                      'hover:bg-teal-50/60'
                    )}
                  >
                    <span className="font-medium text-slate-900">{hit.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Document · {hit.ambitTitle} · {hit.topicTitle}
                    </span>
                  </a>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
