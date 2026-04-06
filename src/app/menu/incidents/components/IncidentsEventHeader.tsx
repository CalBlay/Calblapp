// file: src/app/menu/incidents/components/IncidentsEventHeader.tsx
'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { colorByLN } from '@/lib/colors'
import { typography } from '@/lib/typography'

interface Props {
  title: string
  code: string
  ln: string
  location: string
  service: string
  pax: number
  count: number
  commercial?: string
  onLocationClick?: () => void
}

const formatEventTitle = (title?: string) => {
  if (!title) return '(Sense títol)'
  const [firstPart] = title.split('/')
  const trimmed = firstPart.trim()
  return trimmed || '(Sense títol)'
}

export default function IncidentsEventHeader({
  title,
  code,
  ln,
  location,
  service,
  pax,
  count,
  commercial,
  onLocationClick
}: Props) {

  return (
    <div className="bg-slate-100 rounded-lg px-3 py-2 mb-2 border flex justify-between items-start">
      
      <div className="flex flex-col gap-1">
        
        {/* TITLES */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={typography('cardTitle')}>{formatEventTitle(title)}</span>

          <span className={typography('bodySm')}>Codi: {code || '-'}</span>

          <span
            className={cn(
              typography('bodyXs'),
              'px-2 py-[2px] rounded-md',
              colorByLN(ln)
            )}
          >
            {ln || '—'}
          </span>
        </div>

        {/* INFO */}
        <div className={cn('flex gap-4 flex-wrap', typography('bodySm'))}>
          <span
            className={cn(typography('bodySm'), 'underline cursor-pointer text-blue-600')}
            onClick={onLocationClick}
          >
            Ubicació: {location || '-'}
          </span>

          <span>Comercial: {commercial || '-'}</span>
          <span>Servei: {service || '-'}</span>
          <span>Pax: {pax || '-'}</span>
        </div>

      </div>

      <Badge className={cn('bg-blue-100 text-blue-700 px-2 py-1', typography('bodyXs'))}>
        {count} incidències
      </Badge>
    </div>
  )
}
