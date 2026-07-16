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

const normalizeExactNameKey = (value: string) =>
  normalizeLocationKey(value).replace(/\s+/g, ' ')

const compactLocationKey = (value: string) =>
  normalizeLocationKey(stripLocationPrefixes(value)).replace(/[^a-z0-9]/g, '')

const locationKeysMatch = (left: string, right: string) => {
  const leftNorm = normalizeLocationKey(stripLocationPrefixes(left))
  const rightNorm = normalizeLocationKey(stripLocationPrefixes(right))
  const leftCompact = compactLocationKey(left)
  const rightCompact = compactLocationKey(right)

  if (!leftNorm || !rightNorm || !leftCompact || !rightCompact) return false

  return (
    leftNorm === rightNorm ||
    leftCompact === rightCompact ||
    leftNorm.includes(rightNorm) ||
    rightNorm.includes(leftNorm) ||
    leftCompact.includes(rightCompact) ||
    rightCompact.includes(leftCompact)
  )
}

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
    return locationKeysMatch(location, rawUser)
  })
  if (catalogMatch) return catalogMatch

  const opsMatch = OPS_CHANNEL_LOCATIONS.find((entry) => {
    return locationKeysMatch(entry.location, rawUser)
  })
  if (!opsMatch) return null

  return (
    locations.find((location) => {
      return locationKeysMatch(location, opsMatch.location)
    }) || opsMatch.location
  )
}

/**
 * Resol el centre per defecte a partir del nom canònic de `finques`.
 * Aquí no fem servir àlies OPS ni coincidències parcials: ha de casar
 * amb el catàleg de centres tal com surt a Manteniment > Dades > Centres.
 */
export function resolveDefaultTicketCenterFromUserName(
  userName: string | null | undefined,
  centerNames: string[]
): string | null {
  const rawUser = String(userName || '').trim()
  if (!rawUser || centerNames.length === 0) return null
  const userKey = normalizeExactNameKey(rawUser)
  if (!userKey) return null

  return (
    centerNames.find((centerName) => normalizeExactNameKey(centerName) === userKey) || null
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

export function isQualitatDepartment(raw?: string | null) {
  const dept = normalizeDept(raw)
  return dept === 'qualitat'
}

export function isCuinaCentralMaintenanceTicket(ticket: {
  location?: string | null
  source?: string | null
  intakeChannel?: string | null
}) {
  if (isCuinaCentralLocation(ticket.location)) return true
  const source = String(ticket.source || '').trim()
  const intake = String(ticket.intakeChannel || '').trim()
  return source === 'manual_cuina_central' || intake === 'manual_cuina_central'
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

/** Pot crear tickets des del mòdul (Cuina Central, Serveis, Qualitat). */
export function canCreateMaintenanceTicketsAsReporter(user: {
  role?: string | null
  department?: string | null
}) {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  if (role === 'admin' || role === 'direccio') return false
  if (role === 'cap' && isMaintenanceCapDepartment(dept)) return false
  return isMaintenanceTicketCreatorDepartment(dept) || isQualitatDepartment(dept)
}

/** Cal indicar qui reporta el ticket (comptes genèrics de restaurant). */
export function requiresMaintenanceTicketWorkerName(params: {
  department?: string | null
  location?: string | null
}): boolean {
  const location = String(params.location || '').trim()
  if (
    isCuinaCentralDepartment(params.department) ||
    isQualitatDepartment(params.department) ||
    isCuinaCentralLocation(location)
  ) {
    return true
  }
  if (isRestaurantOpsDepartment(params.department)) return true
  if (!location) return false
  const routing = resolveManualTicketRouting({
    department: params.department,
    location,
  })
  return routing.intakeChannel === 'restaurant'
}

export function formatTicketReporterLabel(ticket: {
  workerName?: string | null
  createdByName?: string | null
}): string {
  const worker = String(ticket.workerName || '').trim()
  const account = String(ticket.createdByName || '').trim()
  if (worker) return worker
  return account || 'Sense identificar'
}

export function formatTicketReporterDetail(ticket: {
  workerName?: string | null
  createdByName?: string | null
}): string {
  const worker = String(ticket.workerName || '').trim()
  const account = String(ticket.createdByName || '').trim()
  if (worker && account && worker.toLowerCase() !== account.toLowerCase()) {
    return `Treballador: ${worker} · Compte: ${account}`
  }
  if (worker) return `Treballador: ${worker}`
  if (account) return `Creat per: ${account}`
  return 'Sense identificar'
}

export type ExternalReporterTicketBucket = 'nou' | 'assignat' | 'fet' | 'externalitzat'
export type MaintenanceTicketScope = 'restaurants' | 'cuina_central' | 'centres_propis'

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
  if (status === 'nou' || status === 'no_fet' || status === 'reassignat') return 'nou'
  if (status === 'assignat' || status === 'en_curs' || status === 'espera') return 'assignat'
  if (status === 'fet' || status === 'validat') return 'fet'
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

export function getMaintenanceTicketScope(ticket: {
  location?: string | null
  workLocation?: string | null
  sourceEventLocation?: string | null
  source?: string | null
  intakeChannel?: string | null
}): MaintenanceTicketScope {
  if (isCuinaCentralMaintenanceTicket(ticket)) return 'cuina_central'

  const intakeChannel = String(ticket.intakeChannel || '').trim().toLowerCase()
  if (intakeChannel === 'restaurant') return 'restaurants'
  if (intakeChannel === 'finca') return 'centres_propis'

  const location =
    String(ticket.location || '').trim() ||
    String(ticket.workLocation || '').trim() ||
    String(ticket.sourceEventLocation || '').trim()
  const ops = resolveOpsChannelByLocationName(location)
  if (ops?.source === 'restaurants') return 'restaurants'

  return 'centres_propis'
}

export function matchesMaintenanceTicketScope(
  ticket: {
    location?: string | null
    workLocation?: string | null
    sourceEventLocation?: string | null
    source?: string | null
    intakeChannel?: string | null
  },
  scope?: string | null
) {
  const value = String(scope || '__all__').trim()
  if (!value || value === '__all__') return true
  return getMaintenanceTicketScope(ticket) === value
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

  if (isCuinaCentralDepartment(params.department) || isQualitatDepartment(params.department) || isCuinaCentralLocation(params.location)) {
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
