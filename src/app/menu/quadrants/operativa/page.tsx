// ✅ file: src/app/menu/quadrants/operativa/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import useQuadrantsByDept from '@/hooks/quadrants/useQuadrantsByDept'
import ModuleHeader from '@/components/layout/ModuleHeader'
import WeeklyFilters from '@/components/quadrants/WeeklyFilters'
import WeeklyTable from '@/components/quadrants/WeeklyTable'
import { ClipboardList } from 'lucide-react'
import { SlidersHorizontal } from 'lucide-react'

type SessionUser = { department?: string }

export default function QuadrantsOperativaPage() {
  // 🧩 Sessió usuari i departament
  const { data: session } = useSession()

  let userDept = 'serveis'
  if (session && typeof session.user === 'object' && session.user) {
    const u = session.user as SessionUser
    if (typeof u.department === 'string') {
      userDept = u.department.toLowerCase()
    }
  }

  const departament =
    userDept === 'total' || userDept === 'direccio' ? 'serveis' : userDept

  // 🗓 Inicialitza la setmana actual
  const today = new Date()
  const monday = new Date(today)
  const dow = monday.getDay() || 7
  if (dow !== 1) monday.setDate(monday.getDate() - (dow - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const [mode, setMode] = useState<'week' | 'day' | 'range'>('week')
  const [filters, setFilters] = useState({
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    departament,
    responsable: '',
    treballador: '',
    finca: '',
  })

  const [filtersOpen, setFiltersOpen] = useState(false)

  // 🔹 Carrega quadrants per rang i departament
  const { quadrants, loading, error } = useQuadrantsByDept(
    filters.departament,
    filters.start,
    filters.end
  )

  // 🔹 Filtratge local (Responsable / Finca / Treballador)
  const filtered = useMemo(() => {
    return quadrants.filter((q) => {
      const matchResponsable = filters.responsable
        ? q.responsable?.toLowerCase().includes(filters.responsable.toLowerCase())
        : true

      const matchFinca = filters.finca
        ? q.location?.toLowerCase().includes(filters.finca.toLowerCase())
        : true

      const matchTreballador = filters.treballador
        ? (q.treballadors || [])
            .map((t) => t.name.toLowerCase())
            .join(' ')
            .includes(filters.treballador.toLowerCase())
        : true

      return matchResponsable && matchFinca && matchTreballador
    })
  }, [quadrants, filters])

  // 🔄 Funcions de navegació segons mode
  const shiftWeek = (direction: 'prev' | 'next') => {
    const base = new Date(filters.start)
    base.setDate(base.getDate() + (direction === 'next' ? 7 : -7))
    const newStart = base.toISOString().split('T')[0]
    const newEnd = new Date(base)
    newEnd.setDate(base.getDate() + 6)
    setFilters((prev) => ({
      ...prev,
      start: newStart,
      end: newEnd.toISOString().split('T')[0],
    }))
  }

  const setDay = (date: string) => {
    setFilters((prev) => ({ ...prev, start: date, end: date }))
  }

  const _setRange = (start: string, end: string) => {
    setFilters((prev) => ({ ...prev, start, end }))
  }

  // 🏷 Etiqueta per pantalla
  const rangeLabel = (() => {
    const start = new Date(filters.start)
    const end = new Date(filters.end)
    const format = (d: Date) =>
      d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' })

    if (mode === 'day') return `Dia: ${format(start)}`
    if (mode === 'range') return `${format(start)} — ${format(end)}`
    return `${format(start)} — ${format(end)}`
  })()

  // 🖼 Render
  return (
    <section className="relative w-full h-full bg-white">
      {/* Header */}
      <ModuleHeader
        icon={<ClipboardList className="w-6 h-6 text-emerald-600" />}
        title="Vista operativa"
        subtitle={`Consulta per període – ${departament}`}
      />

     
            {/* Botó de filtres (clarament diferent del menú) */}
      <div className="flex justify-end px-4 mt-2">
        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Obrir filtres"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white px-3 py-1 text-xs sm:text-sm shadow-md active:scale-95 transition"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filtres</span>
        </button>
      </div>

      {/* Panell de filtres per Responsable / Finca */}
      <WeeklyFilters
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
        fixedDepartment={departament}
        role="Cap Departament"
        quadrants={quadrants}
      />

      {/* Selector de mode i data */}
      <div className="flex flex-col items-center gap-3 mt-4 mb-3">
        {/* 🔘 Mode: setmana / dia / rang */}
        <div className="flex justify-center gap-2">
          {(['week', 'day', 'range'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                mode === m
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {m === 'week' ? 'Setmana' : m === 'day' ? 'Dia' : 'Rang'}
            </button>
          ))}
        </div>

        {/* 📅 Controls segons mode */}
        {mode === 'week' && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => shiftWeek('prev')}
              className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            >
              ◀
            </button>
            <span className="font-semibold text-gray-700 text-sm sm:text-base">
              {rangeLabel}
            </span>
            <button
              onClick={() => shiftWeek('next')}
              className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            >
              ▶
            </button>
          </div>
        )}

        {mode === 'day' && (
          <input
            type="date"
            value={filters.start}
            onChange={(e) => setDay(e.target.value)}
            className="border rounded-lg px-3 py-1 text-sm text-gray-700"
          />
        )}

        {mode === 'range' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.start}
              onChange={(e) => setFilters((p) => ({ ...p, start: e.target.value }))}
              className="border rounded-lg px-2 py-1 text-sm text-gray-700"
            />
            <span>–</span>
            <input
              type="date"
              value={filters.end}
              onChange={(e) => setFilters((p) => ({ ...p, end: e.target.value }))}
              className="border rounded-lg px-2 py-1 text-sm text-gray-700"
            />
          </div>
        )}
      </div>

      {/* 📊 Taula */}
      <WeeklyTable
        quadrants={filtered}
        loading={loading}
        error={error}
        start={filters.start}
        end={filters.end}
      />
    </section>
  )
}
