'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import type { QuadrantPersonEntry } from '@/lib/quadrantsDisplayUtils'
import { roleIconMap } from '@/app/menu/quadrants/drafts/components/draftsTableDisplayUtils'

type Props = {
  people: QuadrantPersonEntry[]
  className?: string
  inline?: boolean
}

export default function QuadrantsPersonnelList({ people, className, inline = true }: Props) {
  if (people.length === 0) return null

  const Container = inline ? 'span' : 'div'

  return (
    <Container
      className={cn(
        inline
          ? 'inline-flex flex-wrap items-center gap-x-2.5 gap-y-1'
          : 'flex flex-col gap-1',
        className
      )}
    >
      {people.map((person, idx) => (
        <span
          key={`${person.role}-${person.name}-${idx}`}
          className={cn(
            'inline-flex items-center gap-1 text-slate-800',
            typography('bodyXs')
          )}
          title={
            person.role === 'responsable'
              ? 'Responsable'
              : person.role === 'conductor'
              ? 'Conductor'
              : 'Treballador'
          }
        >
          <span className="inline-flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">
            {roleIconMap[person.role]}
          </span>
          <span>{person.name}</span>
        </span>
      ))}
    </Container>
  )
}
