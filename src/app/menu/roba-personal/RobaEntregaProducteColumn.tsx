'use client'

import React from 'react'

/** Només article (sense quantitat); les quantitats van a les columnes Qt. sol·licitada / Qt. lliurada. */
export function RobaEntregaProducteColumn({
  lines,
  prodLabel,
}: {
  lines: { productId: string; quantity: number }[] | null | undefined
  prodLabel: (id: string) => string
}) {
  const list = lines || []
  if (!list.length) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return (
    <ul className="space-y-1 list-none pl-0 m-0 text-xs max-w-[18rem]">
      {list.map((l, idx) => (
        <li key={`${l.productId}-${idx}`} className="leading-snug text-foreground">
          {prodLabel(l.productId)}
        </li>
      ))}
    </ul>
  )
}
