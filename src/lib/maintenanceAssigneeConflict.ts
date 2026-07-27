export function normalizeAssignedIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
}

export function rangesOverlap(
  startA: number | null,
  endA: number | null,
  startB: number | null,
  endB: number | null
) {
  if (startA === null || endA === null || startB === null || endB === null) return false
  return startA < endB && endA > startB
}

/**
 * Overlap checks must only run when assignment/planning is actually changing.
 * Running them on every PATCH (status transitions, photos, notes) traps tickets
 * that already overlap — e.g. legacy data or concurrent planner races — so
 * workers cannot start/finish work or write workLogs.
 */
export function shouldCheckMaintenanceAssigneeConflict(params: {
  planningTouched: boolean
  planningChanged: boolean
  assignedToIds: string[]
  plannedStart: number | null
  plannedEnd: number | null
}) {
  return (
    params.planningTouched &&
    params.planningChanged &&
    params.assignedToIds.length > 0 &&
    params.plannedStart !== null &&
    params.plannedEnd !== null
  )
}
