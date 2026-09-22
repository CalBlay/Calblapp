export type SortableSpaceReservationRow = {
  finca: string
  isOwn?: boolean
}

/** Centres propis primer; dins de cada grup, ordre alfabètic català. */
export function compareSpaceReservationRows(
  a: SortableSpaceReservationRow,
  b: SortableSpaceReservationRow
): number {
  const ownershipOrder = Number(b.isOwn === true) - Number(a.isOwn === true)
  if (ownershipOrder !== 0) return ownershipOrder

  return a.finca.localeCompare(b.finca, 'ca', { sensitivity: 'base' })
}
