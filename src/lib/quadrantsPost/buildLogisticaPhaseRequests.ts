import { norm } from '@/lib/quadrantsPost/utils'
import type { PhaseRequest } from '@/lib/quadrantsPost/types'

export function buildLogisticaPhaseRequests(
  logisticaPhasesIn: unknown[],
  body: Record<string, unknown>
): PhaseRequest[] {
  const phaseRequests: PhaseRequest[] = []
  let phaseIndex = 0
  for (const p of logisticaPhasesIn) {
    phaseIndex += 1
    const phase = p as Record<string, unknown>
    const rawLabel = (phase.label || phase.key || '').toString().trim()
    const label = rawLabel || `Fase ${phaseIndex}`
    const phaseType = norm(label)
    phaseRequests.push({
      label,
      phaseType,
      date: (phase.date as string) || (body.startDate as string),
      endDate: (phase.endDate as string) || (phase.date as string) || (body.endDate as string),
      startTime: (phase.startTime as string) || (body.startTime as string),
      endTime: (phase.endTime as string) || (body.endTime as string),
      totalWorkers: Number(phase.totalWorkers || 0),
      numDrivers: Number(phase.numDrivers || 0),
      wantsResp: !!phase.wantsResp,
      responsableId: (phase.responsableId as string | null) || null,
      meetingPoint: (phase.meetingPoint as string) || (body.meetingPoint as string) || '',
      vehicles: Array.isArray(phase.vehicles) ? phase.vehicles : [],
      ...(Array.isArray((phase as { manualWorkers?: unknown }).manualWorkers) &&
      ((phase as { manualWorkers: unknown[] }).manualWorkers ?? []).length > 0
        ? { manualWorkers: (phase as { manualWorkers: unknown[] }).manualWorkers }
        : {}),
    })
  }
  return phaseRequests
}
