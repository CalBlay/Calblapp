//filename: src/components/calendar/CalendarList.tsx
'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Deal } from '@/hooks/useCalendarData'
import CalendarModal from './CalendarModal'

interface CalendarListProps {
  deals: Deal[]
  loading?: boolean
}

/**
 * 📋 CalendarList
 * Mostra els esdeveniments agrupats per dia (vista cronològica)
 * - Basat en Firestore
 * - Totalment mòbil-first
 */
export default function CalendarList({ deals, loading }: CalendarListProps) {
  const grouped = useMemo(() => {
    const acc: Record<string, Deal[]> = {}
    deals.forEach((d) => {
      const key = String(d.DataInici || '').slice(0, 10)
      if (!acc[key]) acc[key] = []
      acc[key].push(d)
    })
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b))
  }, [deals])

  if (loading) return <p className="text-center text-gray-500 mt-6">Carregant esdeveniments...</p>
  if (!deals.length) return <p className="text-center text-gray-500 mt-6">No hi ha esdeveniments disponibles.</p>

  return (
    <div className="space-y-6">
      {grouped.map(([day, events]) => (
        <div key={day} className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {new Date(day).toLocaleDateString('ca-ES', {
                weekday: 'long',
                day: '2-digit',
                month: 'short',
              })}
            </h3>
          </div>

          <div className="divide-y">
            {events.map((ev) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="p-3 hover:bg-gray-50 transition cursor-pointer"
              >
                <CalendarModal
                  deal={ev} // ✅ canviat de event → deal
                  trigger={
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {ev.StageDot && (
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ev.StageDot}`}
                          />
                        )}
                        <span
                          className={`truncate text-sm font-medium ${ev.Color.replace(
                            'bg-',
                            'text-'
                          )}`}
                        >
                          {ev.NomEvent}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 truncate sm:text-right">
                        {ev.Servei} • {ev.Ubicacio || '—'}
                      </div>
                    </div>
                  }
                />
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
