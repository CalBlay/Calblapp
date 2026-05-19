/**
 * Temps de desplaçament per centre (finca), desat a `finques.maintenanceTravelMinutes`.
 * Configuració a Manteniment → Dades → Centres; consum principal al mòdul Informes
 * (durada de treball del ticket + desplaçament anada/tornada segons ubicació).
 */

export const normalizeMaintenanceLocationKey = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

export type MaintenanceCenterTravelRow = {
  name: string
  code: string
  travelMinutes: number
}

export function splitTravelMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  return { hours, minutes, total: safe }
}

export function combineTravelParts(hours: number, minutes: number) {
  const h = Math.max(0, Math.min(99, Math.floor(Number(hours) || 0)))
  const m = Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)))
  return h * 60 + m
}

export function buildMaintenanceTravelIndex(centers: MaintenanceCenterTravelRow[]) {
  const map = new Map<string, number>()
  for (const center of centers) {
    const travelMinutes = Math.max(0, Math.round(Number(center.travelMinutes) || 0))
    const nameKey = normalizeMaintenanceLocationKey(center.name)
    const codeKey = normalizeMaintenanceLocationKey(center.code)
    if (nameKey) map.set(nameKey, travelMinutes)
    if (codeKey && codeKey !== nameKey) map.set(codeKey, travelMinutes)
  }
  return map
}

/** Minuts d'anada configurats per a una ubicació de ticket (coincidència per nom/codi de finca). */
export function resolveMaintenanceTravelMinutesOneWay(
  location: string | null | undefined,
  index: Map<string, number>
): number {
  const key = normalizeMaintenanceLocationKey(location)
  if (!key || index.size === 0) return 0

  const direct = index.get(key)
  if (typeof direct === 'number') return direct

  let best = 0
  let bestLen = 0
  for (const [candidate, minutes] of index.entries()) {
    if (!candidate) continue
    if (key.includes(candidate) || candidate.includes(key)) {
      if (candidate.length > bestLen) {
        bestLen = candidate.length
        best = minutes
      }
    }
  }
  return best
}

/** Anada + tornada per defecte en informes de temps real del ticket. */
export function resolveMaintenanceTravelMinutesRoundTrip(
  location: string | null | undefined,
  index: Map<string, number>
) {
  return resolveMaintenanceTravelMinutesOneWay(location, index) * 2
}

export function addMaintenanceTravelToWorkMinutes(
  workMinutes: number,
  location: string | null | undefined,
  index: Map<string, number>,
  options?: { roundTrip?: boolean }
) {
  const work = Math.max(0, Math.round(Number(workMinutes) || 0))
  const travel = options?.roundTrip === false
    ? resolveMaintenanceTravelMinutesOneWay(location, index)
    : resolveMaintenanceTravelMinutesRoundTrip(location, index)
  return {
    workMinutes: work,
    travelMinutes: travel,
    totalMinutes: work + travel,
  }
}
