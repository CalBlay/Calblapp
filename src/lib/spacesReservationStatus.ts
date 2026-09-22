export type SpaceReservationStatusFields = {
  cancelled?: unknown
}

export function isSpaceReservationCancelled(
  event: SpaceReservationStatusFields
): boolean {
  return event.cancelled === true
}

export function isActiveSpaceReservation(
  event: SpaceReservationStatusFields
): boolean {
  return !isSpaceReservationCancelled(event)
}
