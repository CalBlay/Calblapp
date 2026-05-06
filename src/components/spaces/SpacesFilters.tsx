// file: src/components/spaces/SpacesFilters.tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ResetFilterButton from '@/components/ui/ResetFilterButton'

export interface SpacesFilterState {
  stage?: 'confirmat' | 'pressupost' | 'calentet' | 'all'
  finca?: string
  comercial?: string
  ln?: string
}

interface SpacesFiltersProps {
  fincas?: string[]
  comercials?: string[]
  lns?: string[]
  onChange: (patch: SpacesFilterState) => void
}

export default function SpacesFilters({
  fincas = [],
  comercials = [],
  lns = [],
  onChange,
}: SpacesFiltersProps) {
  const [filters, setFilters] = useState<SpacesFilterState>({
    stage: 'all',
    finca: '',
    comercial: '',
    ln: '',
  })

  // 🔁 Propagar canvis al pare
  useEffect(() => {
    onChange(filters)
  }, [filters, onChange])

  // 🔄 Reset
  const resetAll = () => {
    setFilters({
      stage: 'all',
      finca: '',
      comercial: '',
      ln: '',
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 w-full border-b pb-3 px-2"
    >
      {/* 🎨 Estat */}
      <select
        value={filters.stage}
        onChange={(e) =>
          setFilters(prev => ({
            ...prev,
            stage: e.target.value as SpacesFilterState['stage'],
          }))
        }
        className="border rounded-md px-2 py-2 text-sm bg-white w-full"
      >
        <option value="all">Tots els estats</option>
        <option value="confirmat">Confirmats</option>
        <option value="pressupost">Pressupost enviat</option>
        <option value="calentet">Prereserva / Calentet</option>
      </select>

      {/* 🧩 Línia de negoci */}
      <select
        value={filters.ln}
        onChange={(e) =>
          setFilters(prev => ({
            ...prev,
            ln: e.target.value,
          }))
        }
        className="border rounded-md px-2 py-2 text-sm bg-white w-full"
      >
        <option value="">Totes les línies de negoci</option>
        {lns.map(ln => (
          <option key={ln} value={ln}>
            {ln}
          </option>
        ))}
      </select>

      {/* 🏡 Finca */}
      <select
        value={filters.finca}
        onChange={(e) =>
          setFilters(prev => ({
            ...prev,
            finca: e.target.value,
            comercial: '', // reset comercial
          }))
        }
        className="border rounded-md px-2 py-2 text-sm bg-white w-full"
      >
        <option value="">Totes les finques</option>
        {fincas.map(f => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {/* 👤 Comercial */}
      <select
        value={filters.comercial}
        onChange={(e) =>
          setFilters(prev => ({
            ...prev,
            comercial: e.target.value,
          }))
        }
        className="border rounded-md px-2 py-2 text-sm bg-white w-full"
      >
        <option value="">Tots els comercials</option>
        {comercials.map(c => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* 🔄 Reset */}
      <div className="flex justify-end mt-2">
        <ResetFilterButton onClick={resetAll} />
      </div>
    </motion.div>
  )
}
