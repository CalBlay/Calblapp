//filename: src/components/quadrants/WeeklyTable.tsx
'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import type { QuadrantData } from '@/hooks/quadrants/useQuadrantsByDept'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import useLinkedDepartmentsWeek from '@/hooks/quadrants/useLinkedDepartmentsWeek'

interface WeeklyTableProps {
  quadrants: QuadrantData[]
  loading: boolean
  error: string | null
  start?: string
  end?: string
}

type LinkedDepartmentDetail = {
  dept?: string
  startTime?: string
  responsable?: string
  conductors?: Array<{ name?: string }>
  treballadors?: Array<{ name?: string }>
}

type QuadrantDetails = {
  stage?: {
    comercial?: string
    servei?: string
    stageColor?: string
  }
  departaments?: Record<string, LinkedDepartmentDetail>
}

/**
 * 🧩 WeeklyTable
 * Vista operativa setmanal agrupada per dia
 * - Mobile-first
 * - Format taula Shadcn/UI
 * - Escalable i modular
 */
export default function WeeklyTable({
  quadrants,
  loading,
  error,
  start,
  end,
}: WeeklyTableProps) {
  const [selected, setSelected] = useState<QuadrantData | null>(null)
  const [details, setDetails] = useState<QuadrantDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const { linkedData, loading: loadingLinks } = useLinkedDepartmentsWeek(start, end)

  /** 🗂️ Agrupa els quadrants per data */
  const grouped = useMemo(() => {
    const groups: Record<string, QuadrantData[]> = {}
    quadrants.forEach((q) => {
      const key = q.displayDate || 'Sense data'
      if (!groups[key]) groups[key] = []
      groups[key].push(q)
    })
    return groups
  }, [quadrants])

  /** 🔍 Carrega detalls quan s’obre el modal */
  useEffect(() => {
    const fetchDetails = async () => {
      if (!selected?.code) return
      setLoadingDetails(true)
      try {
        const res = await fetch(`/api/quadrants/details?code=${selected.code}`)
        const json = await res.json()
        if (res.ok) setDetails(json)
        else console.error('❌ Error detalls quadrant:', json.error)
      } catch (err) {
        console.error('⚠️ Error obtenint detalls modal:', err)
      } finally {
        setLoadingDetails(false)
      }
    }
    fetchDetails()
  }, [selected])

  /** 🌀 Estat de càrrega principal */
  if (loading) {
    return (
      <div className="flex justify-center items-center py-10 text-gray-500">
        <Loader2 className="animate-spin w-5 h-5 mr-2" /> Carregant quadrants…
      </div>
    )
  }

  /** ⚠️ Error */
  if (error) {
    return <p className="text-red-600 text-center py-10">{error}</p>
  }

  /** 📭 Sense dades */
  if (!quadrants || quadrants.length === 0) {
    return (
      <p className="text-gray-400 text-center py-10">
        Cap quadrant trobat per aquesta setmana.
      </p>
    )
  }

  /** 🧾 Render taula */
  return (
    <>
      <div className="overflow-x-auto border rounded-2xl shadow-sm bg-white">
        <Table>
          <TableHeader>
  <TableRow className="bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-900 text-sm h-8">
    <TableHead className="sticky left-0 z-30 bg-emerald-50 py-1">
  Responsable
</TableHead>

    <TableHead className="py-1">Finca / Ubicació</TableHead>
    <TableHead className="py-1">Personal i Conductors</TableHead>
    <TableHead className="py-1 text-right">PAX</TableHead>
    <TableHead className="py-1">Vestimenta</TableHead>
    <TableHead className="py-1">Horari</TableHead>
    <TableHead className="py-1">Altres Departaments</TableHead>
    <TableHead className="py-1 text-right">Codi</TableHead>
  </TableRow>
</TableHeader>


          <TableBody>
            {Object.entries(grouped).map(([day, items]) => (
              <Fragment key={day}>
                {/* 🟩 Subheader per dia */}
                <TableRow className="bg-emerald-100/70 text-emerald-800 font-semibold sticky top-[2.5rem] z-10">
  <TableCell colSpan={8}>{day}</TableCell>
</TableRow>


                {/* Files d’esdeveniments */}
                {items.map((q) => (
                  <TableRow
                    key={q.id}
                    className="text-xs sm:text-sm hover:bg-emerald-50 transition cursor-pointer"
                    onClick={() => setSelected(q)}
                  >
                    {/* 👤 Responsable */}
                    <TableCell
  className="sticky left-0 z-20 bg-white font-medium text-gray-800 min-w-[130px] max-w-[150px]"
>
  {q.responsable || '—'}
</TableCell>


                    {/* 📍 Ubicació */}
                    <TableCell>{q.location || '—'}</TableCell>

                    {/* 👷 Personal i conductors */}
                    <TableCell className="max-w-[250px] truncate">
                      {[...(q.treballadors || []), ...(q.conductors || [])]
                        .map((p) => p.name)
                        .join(', ') || '—'}
                    </TableCell>

                    {/* 👥 PAX */}
                    <TableCell className="text-right">{q.pax ?? 0}</TableCell>

                    {/* 👔 Vestimenta */}
                    <TableCell>{q.dressCode || '—'}</TableCell>

                    {/* 🕒 Horari */}
                    <TableCell>
                      {q.startTime || '—'} – {q.endTime || '—'}
                    </TableCell>

                    {/* 🧩 Altres departaments */}
                    <TableCell className="text-xs text-emerald-700">
                      {loadingLinks ? (
                        <span className="text-gray-400">...</span>
                      ) : (() => {
                          const links = linkedData[q.code ?? ''] || []
                          const others = links.filter(
                            (l) => l.dept !== q.department
                          )
                          if (others.length === 0)
                            return <span className="text-gray-400">—</span>
                          return others.map((l, i) => (
                            <div key={i}>
                              {l.dept} {l.startTime || ''}
                            </div>
                          ))
                        })()}
                    </TableCell>

                    {/* 🔹 Codi (última) */}
                    <TableCell className="text-right text-emerald-700 font-semibold underline">
                      {q.code || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 🪟 Modal de detalls */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-lg mx-auto rounded-2xl p-6 bg-white shadow-lg">
            <DialogHeader>
              <DialogTitle className="text-emerald-700 font-semibold text-base sm:text-lg">
                {selected.eventName || 'Esdeveniment'}
              </DialogTitle>
            </DialogHeader>

            {loadingDetails ? (
              <div className="flex justify-center py-6 text-gray-500">
                <Loader2 className="animate-spin w-5 h-5 mr-2" /> Carregant
                detalls…
              </div>
            ) : (
              <div className="space-y-3 text-sm text-gray-700 mt-2">
                <p>
                  <strong>Codi:</strong> {selected.code || '—'}
                </p>
                <p>
                  <strong>Ubicació:</strong> {selected.location || '—'}
                </p>

                {/* 📊 Informació comercial */}
                {details?.stage && (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="font-semibold text-emerald-600 mb-1">
                      Informació comercial
                    </p>
                    <p>
                      <strong>Comercial:</strong>{' '}
                      {details.stage.comercial || '—'}
                    </p>
                    <p>
                      <strong>Servei:</strong> {details.stage.servei || '—'}
                    </p>
                    <p>
                      <strong>Stage:</strong> {details.stage.stageColor || '—'}
                    </p>
                  </div>
                )}

                {/* 🧩 Altres departaments */}
                {details?.departaments &&
                  Object.keys(details.departaments).length > 0 && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="font-semibold text-emerald-600 mb-1">
                        Altres departaments
                      </p>
                      {Object.entries(details.departaments).map(
                        ([dept, data]: [string, LinkedDepartmentDetail]) => (
                          <div key={dept} className="mt-2">
                            <p className="font-semibold capitalize">{dept}</p>
                            <p>
                              <strong>Hora inici:</strong>{' '}
                              {data.startTime || '—'}
                            </p>
                            <p>
                              <strong>Responsable:</strong>{' '}
                              {data.responsable || '—'}
                            </p>
                            <p>
                              <strong>Conductors:</strong>{' '}
                              {(data.conductors || [])
                                .map((c) => c.name)
                                .join(', ') || '—'}
                            </p>
                            <p>
                              <strong>Treballadors:</strong>{' '}
                              {(data.treballadors || [])
                                .map((t) => t.name)
                                .join(', ') || '—'}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelected(null)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5 py-1.5 text-sm shadow"
              >
                Tancar
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
