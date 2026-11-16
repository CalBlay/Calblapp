export type ProductionPissarraItem = {
  id: string
  sourceEventId?: string
  code: string
  LN: string
  eventName: string
  startDate: string
  startTime: string
  location: string
  pax: number
  servei: string
  comercial: string
  responsableName?: string
  phaseLabel?: string
  phaseDate?: string
}

export type OperationalPhaseCandidate = {
  id: string
  eventId: string
  code: string
  eventName: string
  phaseLabel: string
  phaseDate?: string
  startTime: string
  location: string
  pax: number
  servei: string
  comercial: string
  ln: string
  responsableName?: string
}

const normalize = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

const canonicalEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

export function isMuntatgePhase(value?: string | null) {
  const phase = normalize(value)
  return ['muntatge', 'montatge', 'montaje'].some((word) => phase.includes(word))
}

/**
 * Afegeix a la Pissarra les fases de muntatge en el seu dia operatiu real.
 * Els documents equivalents deixats per reobertures es col·lapsen en una sola entrada.
 */
export function appendOperationalMontageItems(
  baseEvents: ProductionPissarraItem[],
  candidates: OperationalPhaseCandidate[],
  startDay: string,
  endDay: string
): ProductionPissarraItem[] {
  const result = [...baseEvents]
  const byEventId = new Map(
    baseEvents
      .filter((event) => event.sourceEventId)
      .map((event) => [canonicalEventId(event.sourceEventId), event] as const)
  )
  const byCode = new Map(
    baseEvents.filter((event) => event.code).map((event) => [normalize(event.code), event] as const)
  )
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const phaseDate = String(candidate.phaseDate || '').slice(0, 10)
    if (!isMuntatgePhase(candidate.phaseLabel)) continue
    if (!phaseDate || phaseDate < startDay || phaseDate > endDay) continue

    const eventKey = canonicalEventId(candidate.eventId) || normalize(candidate.code) || candidate.id
    const key = [
      eventKey,
      phaseDate,
      normalize(candidate.phaseLabel),
      candidate.startTime,
      normalize(candidate.location),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const base =
      byEventId.get(canonicalEventId(candidate.eventId)) ||
      byCode.get(normalize(candidate.code))

    result.push({
      id: `phase:${candidate.id}`,
      sourceEventId: canonicalEventId(candidate.eventId) || base?.sourceEventId,
      code: candidate.code || base?.code || '',
      LN: candidate.ln || base?.LN || '',
      eventName: candidate.eventName || base?.eventName || '',
      startDate: phaseDate,
      startTime: candidate.startTime || '',
      location: candidate.location || base?.location || '',
      pax: candidate.pax || base?.pax || 0,
      servei: candidate.servei || base?.servei || '',
      comercial: candidate.comercial || base?.comercial || '',
      responsableName: candidate.responsableName || base?.responsableName,
      phaseLabel: candidate.phaseLabel || 'Muntatge',
      phaseDate,
    })
  }

  return result
}
