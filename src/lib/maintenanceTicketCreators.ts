import { normalizeDept, isMaintenanceCapDepartment } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import { OPS_CHANNEL_LOCATIONS, resolveOpsChannelByLocationName } from '@/lib/opsMessagingChannels'

const stripLocationPrefixes = (value: string) =>
  value
    .replace(/^(restaurant|restauracio|empresa|casament|casaments)\s+/i, '')
    .trim()

const normalizeLocationKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const compactLocationKey = (value: string) =>
  normalizeLocationKey(stripLocationPrefixes(value)).replace(/[^a-z0-9]/g, '')

/** Compara ubicacions de ticket i maquinaria (accent/case/prefix tolerant). */
export function matchesMaintenanceTicketLocation(
  machineLocation: string | null | undefined,
  ticketLocation: string | null | undefined
): boolean {
  const machineKey = compactLocationKey(String(machineLocation || ''))
  const ticketKey = compactLocationKey(String(ticketLocation || ''))
  if (!machineKey || !ticketKey) return false
  return machineKey === ticketKey
}

/**
 * Si el nom d'usuari (login) coincideix amb una finca pròpia o restaurant del catàleg,
 * retorna la ubicació canònica per omplir el camp per defecte en crear un ticket.
 * Ex.: usuari "NAUTIC" → "Nàutic"
 */
export function resolveDefaultTicketLocationFromUserName(
  userName: string | null | undefined,
  locations: string[]
): string | null {
  const rawUser = String(userName || '').trim()
  if (!rawUser || locations.length === 0) return null

  const userNorm = normalizeLocationKey(rawUser)
  const userCompact = compactLocationKey(rawUser)
  if (!userNorm && !userCompact) return null

  const catalogMatch = locations.find((location) => {
    const locNorm = normalizeLocationKey(stripLocationPrefixes(location))
    const locCompact = compactLocationKey(location)
    return (
      (userNorm && locNorm === userNorm) ||
      (userCompact && locCompact === userCompact)
    )
  })
  if (catalogMatch) return catalogMatch

  const opsMatch = OPS_CHANNEL_LOCATIONS.find((entry) => {
    const locNorm = normalizeLocationKey(entry.location)
    const locCompact = compactLocationKey(entry.location)
    return (
      (userNorm && locNorm === userNorm) ||
      (userCompact && locCompact === userCompact)
    )
  })
  if (!opsMatch) return null

  const opsNorm = normalizeLocationKey(opsMatch.location)
  const opsCompact = compactLocationKey(opsMatch.location)
  return (
    locations.find((location) => {
      const locNorm = normalizeLocationKey(stripLocationPrefixes(location))
      const locCompact = compactLocationKey(location)
      return (
        (opsNorm && locNorm === opsNorm) ||
        (opsCompact && locCompact === opsCompact)
      )
    }) || opsMatch.location
  )
}

export function isCuinaCentralDepartment(raw?: string | null) {
  const dept = normalizeDept(raw)
  return dept === 'cuina central' || dept.replace(/\s+/g, '') === 'cuinacentral'
}

/** Ubicació del ticket (p. ex. des del mòdul Cuina central de la webapp). */
export function isCuinaCentralLocation(raw?: string | null) {
  const loc = normalizeDept(raw)
  return loc === 'cuina central' || loc.replace(/\s+/g, '') === 'cuinacentral'
}

/** Personal de restaurant (OPS) que crea tickets al mòdul Tickets. */
export function isRestaurantOpsDepartment(raw?: string | null) {
  const dept = normalizeDept(raw)
  return (
    dept === 'serveis' ||
    dept === 'restauracio' ||
    dept.includes('restaurant')
  )
}

export function isMaintenanceTicketCreatorDepartment(raw?: string | null) {
  return isCuinaCentralDepartment(raw) || isRestaurantOpsDepartment(raw)
}

export type ExternalReporterTicketBucket = 'nou' | 'assignat' | 'fet' | 'externalitzat'

const normalizeTicketStatusKey = (status?: string | null) =>
  String(status || 'nou')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

export function getExternalReporterTicketBucket(ticket: {
  status?: string | null
  externalized?: boolean | null
}): ExternalReporterTicketBucket {
  if (ticket.externalized) return 'externalitzat'

  const status = normalizeTicketStatusKey(ticket.status)
  if (status === 'nou' || status === 'no_fet') return 'nou'
  if (status === 'assignat' || status === 'en_curs' || status === 'espera') return 'assignat'
  if (status === 'fet' || status === 'resolut' || status === 'validat') return 'fet'
  return 'nou'
}

export function matchesExternalReporterTicketBucket(
  ticket: { status?: string | null; externalized?: boolean | null },
  bucket?: string | null
) {
  const value = String(bucket || '__all__').trim()
  if (!value || value === '__all__') return true
  return getExternalReporterTicketBucket(ticket) === value
}

export function isMaintenanceTicketCreatorOnlyUser(user: {
  role?: string | null
  department?: string | null
}) {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  if (role === 'admin' || role === 'direccio') return false
  if (role === 'cap' && isMaintenanceCapDepartment(dept)) return false
  return isMaintenanceTicketCreatorDepartment(dept)
}

export type ManualTicketRouting = {
  source: 'manual' | 'manual_cuina_central'
  intakeChannel: 'manual_tickets' | 'manual_cuina_central' | 'restaurant'
  workflowStage: 'tickets_inbox' | 'planner_queue'
}

/** Encaminament en crear un ticket manual segons departament i ubicació. */
export function resolveManualTicketRouting(params: {
  department?: string | null
  location: string
}): ManualTicketRouting {
  const location = String(params.location || '').trim()

  if (isCuinaCentralDepartment(params.department) || isCuinaCentralLocation(params.location)) {
    return {
      source: 'manual_cuina_central',
      intakeChannel: 'manual_cuina_central',
      workflowStage: 'planner_queue',
    }
  }

  const ops = resolveOpsChannelByLocationName(location)
  if (ops?.source === 'restaurants' || isRestaurantOpsDepartment(params.department)) {
    return {
      source: 'manual',
      intakeChannel: 'restaurant',
      workflowStage: 'tickets_inbox',
    }
  }

  return {
    source: 'manual',
    intakeChannel: 'manual_tickets',
    workflowStage: 'tickets_inbox',
  }
}
