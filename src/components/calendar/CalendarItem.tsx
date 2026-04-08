//file: src/components/calendar/CalendarItem.tsx
'use client'

import React from 'react'
import { motion } from 'framer-motion'
import CalendarModal from './CalendarModal'
import type { Deal } from '@/hooks/useCalendarData'

/**
 * 🧩 CalendarItem
 * Targeta individual d’un esdeveniment
 * - Utilitzada en la vista llista i altres components
 * - Obre el CalendarModal amb tota la informació
 */
export default function CalendarItem({ event }: { event: Deal }) {
  const {
    id,
    NomEvent,
    DataInici,
    Servei,
    Comercial,
    Ubicacio,
    HoraInici,
    HoraFi,
    StageDot,
    Color,
    LN,
  } = event

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="cursor-pointer"
    >
      <CalendarModal
        deal={event}
        trigger={
          <div
            className={`border-l-4 ${Color} rounded-xl bg-white shadow-sm hover:shadow-md transition p-3 sm:p-4 flex flex-col gap-1`}
          >
            {/* Nom i etapa */}
            <div className="flex items-center gap-2 min-w-0">
              {StageDot && (
                <span className={`w-2.5 h-2.5 rounded-full ${StageDot}`} />
              )}
              <h2 className="font-semibold text-sm sm:text-base truncate">
                {NomEvent}
              </h2>
            </div>

            {/* Dades bàsiques */}
            <div className="text-xs sm:text-sm text-gray-600 leading-snug">
              {LN && (
                <p>
                  <strong>LN:</strong> {LN}
                </p>
              )}
              {Servei && (
                <p>
                  <strong>Servei:</strong> {Servei}
                </p>
              )}
              {Comercial && (
                <p>
                  <strong>Comercial:</strong> {Comercial}
                </p>
              )}
              {DataInici && (
                <p>
                  <strong>Data:</strong>{' '}
                  {new Date(DataInici).toLocaleDateString('ca-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {HoraInici
                    ? ` · ${HoraInici}${HoraFi ? ` – ${HoraFi}` : ''}`
                    : ''}
                </p>
              )}
              {Ubicacio && (
                <p>
                  <strong>Ubicació:</strong> {Ubicacio}
                </p>
              )}
            </div>
          </div>
        }
      />
    </motion.div>
  )
}
