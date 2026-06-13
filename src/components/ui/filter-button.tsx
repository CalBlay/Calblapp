'use client'

import { useFilters } from '@/context/FiltersContext'
import { corporateFilterIconButtonClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

export default function FilterButton({
  onClick,
  className,
}: {
  onClick?: () => void
  className?: string
}) {
  const { setOpen } = useFilters()

  return (
    <button
      type="button"
      className={cn(corporateFilterIconButtonClass, 'touch-manipulation', className)}
      onClick={() => {
        if (onClick) onClick()
        setOpen(true)
      }}
      title="Filtres"
      aria-label="Filtres"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
      </svg>
    </button>
  )
}
