// ✅ file: src/components/quadrants/WeeklyFilters.tsx
'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'

interface WeeklyFiltersProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (filters: SmartFiltersChange) => void
  fixedDepartment?: string
  role?: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
  quadrants?: Array<{ responsable?: string; location?: string }>
}

/**
 * 🎛️ WeeklyFilters – versió simplificada
 * - Només filtra per Responsable i Finca
 * - Sense control de dates (gestionat externament a page.tsx)
 */
export default function WeeklyFilters({
  open,
  onOpenChange,
  onChange,
  quadrants = [],
}: WeeklyFiltersProps) {
  const [responsables, setResponsables] = useState<string[]>([])
  const [finques, setFinques] = useState<string[]>([])
  const [selectedResponsable, setSelectedResponsable] = useState('')
  const [selectedFinca, setSelectedFinca] = useState('')

  // 🧭 Extreu Responsables i Finques dels quadrants disponibles
  useEffect(() => {
    if (!Array.isArray(quadrants) || quadrants.length === 0) return
    const respSet = new Set<string>()
    const fincaSet = new Set<string>()
    for (const q of quadrants) {
      if (typeof q.responsable === 'string' && q.responsable.trim())
        respSet.add(q.responsable.trim())
      if (typeof q.location === 'string' && q.location.trim())
        fincaSet.add(q.location.trim())
    }
    setResponsables([...respSet].sort((a, b) => a.localeCompare(b, 'ca')))
    setFinques([...fincaSet].sort((a, b) => a.localeCompare(b, 'ca')))
  }, [quadrants])

  // 🟢 Aplica filtres
const handleApply = () => {
  onChange(
    {
      responsable: selectedResponsable,
      finca: selectedFinca,
    } as unknown as SmartFiltersChange
  )
  onOpenChange(false)
}


  // 🧱 Render
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="w-screen h-[100dvh] bg-white rounded-t-3xl p-6 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold text-emerald-700">
            Filtres
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Responsable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Responsable
            </label>
            <select
              value={selectedResponsable}
              onChange={(e) => setSelectedResponsable(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Tots</option>
              {responsables.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Finca / Ubicació */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Finca / Ubicació
            </label>
            <select
              value={selectedFinca}
              onChange={(e) => setSelectedFinca(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Totes</option>
              {finques.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end mt-10 pb-4">
          <Button
            onClick={handleApply}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6 py-2 text-sm w-full sm:w-auto shadow"
          >
            Aplicar filtres
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
