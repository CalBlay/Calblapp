// file: src/components/calendar/CalendarLegend.tsx
'use client'

import React from 'react'
import { COLORS_LN, COLORS_STAGE } from '@/lib/colors'

type CodeCounts = {
  confirmed: number
  review: number
  missing: number
}

export default function CalendarLegend({
  showCodeStatus,
  codeCounts,
}: {
  showCodeStatus?: boolean
  codeCounts?: CodeCounts
}) {
  // Linies de negoci (etiqueta visible -> clau a COLORS_LN)
  const lnItems: { label: string; key: string }[] = [
    { label: 'Empresa', key: 'empresa' },
    { label: 'Casaments', key: 'casaments' },
    { label: 'Grups Restaurants', key: 'grups restaurants' },
    { label: 'Foodlovers', key: 'foodlovers' },
    { label: 'Agenda', key: 'agenda' },
    { label: 'Altres', key: 'altres' },
  ]

  // Etapes (etiqueta visible -> clau a COLORS_STAGE)
  const stageItems: { label: string; key: string }[] = [
    { label: 'Prereserva / Calentet', key: 'prereserva' },
    { label: 'Pressupost / Proposta / Pendent', key: 'pendent' },
    { label: 'Confirmat / Cerrada ganada', key: 'confirmat' },
  ]


  return (
    <div className="w-full border border-gray-200 rounded-lg bg-white/70 backdrop-blur-sm shadow-sm px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
      {/* Linies de negoci */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-gray-500">LN:</span>
        {lnItems.map((it) => (
          <span
            key={it.key}
            className={`px-2 py-[1px] rounded-full border ${COLORS_LN[it.key]}`}
          >
            {it.label}
          </span>
        ))}
      </div>

      {/* Etapes */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-500">Etapes:</span>
        {stageItems.map((st) => (
          <div key={st.key} className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${COLORS_STAGE[st.key]}`}
            />
            <span>{st.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-700" />
          <span>Cancel·lat</span>
        </div>
      </div>

      {showCodeStatus && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-500">Codi:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-[1px] text-slate-700">
            <span className="text-[10px] font-semibold">C</span>
            Confirmat{typeof codeCounts?.confirmed === 'number' ? `: ${codeCounts.confirmed}` : ''}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-[1px] text-rose-700">
            <span className="text-[10px] font-semibold">R</span>
            A revisar{typeof codeCounts?.review === 'number' ? `: ${codeCounts.review}` : ''}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-[1px] text-gray-600">
            <span className="text-[10px] font-semibold">-</span>
            Sense codi{typeof codeCounts?.missing === 'number' ? `: ${codeCounts.missing}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

