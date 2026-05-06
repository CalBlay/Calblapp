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
  onLocationClick,
}: Props) {
  return (
    <div className="mb-2 flex flex-col gap-3 rounded-lg border bg-slate-100 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className={cn(typography('cardTitle'), 'min-w-0 break-words')}>
            {formatEventTitle(title)}
          </span>

          <span className={typography('bodySm')}>Codi: {code || '-'}</span>

          <span
            className={cn(
              typography('bodyXs'),
              'rounded-md px-2 py-[2px]',
              colorByLN(ln)
            )}
          >
            {ln || '—'}
          </span>
        </div>

        <div className={cn('mt-1 flex flex-wrap gap-x-4 gap-y-1', typography('bodySm'))}>
          <span
            className={cn(typography('bodySm'), 'cursor-pointer text-blue-600 underline')}
            onClick={onLocationClick}
          >
            Ubicació: {location || '-'}
          </span>

          <span>Comercial: {commercial || '-'}</span>
          <span>Servei: {service || '-'}</span>
          <span>Pax: {pax || '-'}</span>
        </div>
      </div>

      <Badge className={cn('w-fit bg-blue-100 px-2 py-1 text-blue-700 sm:self-start', typography('bodyXs'))}>
        {count} incidències
      </Badge>
    </div>
  )
}
