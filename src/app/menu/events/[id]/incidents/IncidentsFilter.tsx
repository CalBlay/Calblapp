// src/app/menu/events/[id]/incidents/IncidentsFilter.tsx
'use client'

import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export interface Incident {
  id: string
  department: string
  importance: string
  description: string
  createdBy: string
  createdAt: string
  status: string
}

interface Props {
  incidents: Incident[]
}

export default function IncidentsFilter({ incidents }: Props) {
  const [filterDept, setFilterDept] = useState<string>('')
  const [filterImp, setFilterImp] = useState<string>('')

  const depts = Array.from(new Set(incidents.map(i => i.department))).sort()
  const imps  = Array.from(new Set(incidents.map(i => i.importance))).sort()

  const filtered = incidents.filter(i =>
    (!filterDept || i.department === filterDept) &&
    (!filterImp  || i.importance === filterImp)
  )

  const borderColor: Record<string,string> = {
    Alta: 'border-red-400',
    Mitjana: 'border-yellow-400',
    Baixa: 'border-green-400',
  }

  return (
    <div className="space-y-6">
      {/* --- FILTRES --- */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="dept-filter" className={typography('label')}>
            Departament:
          </label>
          <select
            id="dept-filter"
            className="border p-2 rounded"
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
          >
            <option value="">Tots</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="imp-filter" className={typography('label')}>
            Importància:
          </label>
          <select
            id="imp-filter"
            className="border p-2 rounded"
            value={filterImp}
            onChange={e => setFilterImp(e.target.value)}
          >
            <option value="">Totes</option>
            {imps.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>

      {/* --- LLISTA D'INCIDÈNCIES --- */}
      {filtered.length === 0 ? (
        <p className={typography('bodySm')}>No hi ha incidències per mostrar.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map(inc => {
            const dt = inc.createdAt ? new Date(inc.createdAt) : null
            const timeStr = dt && !isNaN(dt.getTime())
              ? format(dt, 'yyyy-MM-dd HH:mm')
              : 'Data desconeguda'

            return (
              <Card
                key={inc.id}
                className={`border-l-4 ${borderColor[inc.importance] || 'border-gray-300'} bg-white rounded-lg shadow`}
              >
                <CardHeader>
                  <CardTitle
                    className={cn('flex justify-between items-center', typography('bodySm'))}
                  >
                    <span>{timeStr}</span>
                    <span
                      className={cn(
                        'font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded',
                        typography('bodySm')
                      )}
                    >
                      {inc.department}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className={cn('space-y-2', typography('bodySm'))}>
                  <p className={cn('font-medium', typography('bodyMd'))}>{inc.description}</p>
                  <p className={typography('bodySm')}>
                    Importància: <strong>{inc.importance}</strong> — Reportat per: {inc.createdBy}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
)
}
