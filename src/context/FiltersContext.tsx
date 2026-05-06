//file: src/context/FiltersContext.tsx
'use client'

import React, { createContext, useContext, useState } from 'react'

type FiltersContextValue = {
  // CONTEXT ORIGINAL
  open: boolean
  setOpen: (v: boolean) => void
  content: React.ReactNode | null
  setContent: (c: React.ReactNode | null) => void

  // 🔥 ALIASES PER A TornsPage (sense trencar res)
  filtersOpen: boolean
  setFiltersOpen: (v: boolean) => void
  slideFilters: Record<string, unknown>
  setSlideFilters: (f: Record<string, unknown>) => void
}

const FiltersContext = createContext<FiltersContextValue | undefined>(
  undefined
)

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<React.ReactNode | null>(null)

  // 🔥 NOU ESTAT (exclusiu per Torns)
  const [slideFilters, setSlideFilters] = useState<Record<string, unknown>>({})

  return (
    <FiltersContext.Provider
      value={{
        open,
        setOpen,
        content,
        setContent,

        // Alias compatibles
        filtersOpen: open,
        setFiltersOpen: setOpen,
        slideFilters,
        setSlideFilters
      }}
    >
      {children}
    </FiltersContext.Provider>
  )
}

export function useFilters() {
  const ctx = useContext(FiltersContext)
  if (!ctx) {
    throw new Error('useFilters must be used inside <FiltersProvider>')
  }
  return ctx
}
