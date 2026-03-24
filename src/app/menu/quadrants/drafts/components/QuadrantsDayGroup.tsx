//file:src\app\menu\quadrants\drafts\components\QuadrantsDayGroup.tsx
'use client'

import React from 'react'
import { Calendar, Users } from 'lucide-react'
import QuadrantCard from './QuadrantCard'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import { useRouter } from 'next/navigation'

interface Props {
  date: string
  quadrants: Draft[]
}

export default function QuadrantsDayGroup({ date, quadrants }: Props) {
  const router = useRouter()

  const totalQuadrants = quadrants.length
  const totalPeople = quadrants.reduce((sum, q) => {
    const resp = q.responsableName ? 1 : 0
    const conductors = q.conductors?.length || 0
    const treballadors = q.treballadors?.length || 0
    return sum + resp + conductors + treballadors
  }, 0)

  return (
    <section className="mb-6">
      {/* Capçalera de dia (mateixa línia visual que Events i Torns) */}
      <header className="flex items-center justify-between mb-3 bg-orange-50 p-3 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          {date}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            <Calendar className="w-3 h-3" />
            {totalQuadrants} quadrants
          </span>
        </h2>
        <span className="flex items-center gap-1 text-orange-600 font-bold">
          <Users className="w-4 h-4" />
          {totalPeople} persones
        </span>
      </header>

      {/* Targetes de quadrants */}
      <div className="flex flex-col gap-3">
        {quadrants.map((q) => (
          <QuadrantCard
            key={`${(q.department || '').toLowerCase()}::${q.id}`}
            quadrant={q}
          />
        ))}
      </div>
    </section>
  )
}
