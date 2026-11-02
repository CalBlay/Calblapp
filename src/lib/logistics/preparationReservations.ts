export type PreparationReservationWindow = {
  startKey: string
  endKey: string
}

export function preparationIntervalsOverlap(
  left: PreparationReservationWindow,
  right: PreparationReservationWindow
) {
  return left.startKey < right.endKey && left.endKey > right.startKey
}

export function preparationAvailableQuantity(totalStock: number, reservedQuantity: number) {
  const total = Math.max(0, Math.floor(Number(totalStock) || 0))
  const reserved = Math.max(0, Math.floor(Number(reservedQuantity) || 0))
  return Math.max(0, total - reserved)
}
