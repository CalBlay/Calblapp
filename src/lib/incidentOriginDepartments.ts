/**
 * Departaments del desplegable «origen» a la creació d’incidències (CreateIncidentModal)
 * i a les accions derivades (mateix ordre que operativa).
 */
import { normalizeDept } from '@/lib/accessControl'

export const INCIDENT_ORIGIN_DEPARTMENTS = [
  'Serveis',
  'Cuina',
  'Logistica',
  'Comercial',
  'Produccio',
  'Deco',
] as const

export type IncidentOriginDepartment = (typeof INCIDENT_ORIGIN_DEPARTMENTS)[number]

/**
 * Etiqueta d’origen normalitzada → departaments normalitzats del perfil del cap acceptats.
 * Inclou equivalents (p. ex. Deco / decoració) i valors legacy (p. ex. Sala).
 */
const CAP_DEPT_ALIASES: Record<string, string[]> = {
  serveis: ['serveis'],
  cuina: ['cuina'],
  logistica: ['logistica'],
  /** Comercial: caps de comercial + Empresa, Casaments i Food Lovers (àrea comercial). */
  comercial: ['comercial', 'empresa', 'casaments', 'foodlovers'],
  produccio: ['produccio'],
  deco: ['deco', 'decoracio', 'decoracions'],
  /** Incidències antigues amb «Sala» */
  sala: ['sala', 'serveis'],
}

/** Retorna true si el cap (user.department) correspon al departament d’origen triat a la incidència. */
export function capDepartmentMatchesIncidentOrigin(
  incidentOriginLabel: string,
  userDepartmentRaw: string
): boolean {
  const key = normalizeDept(incidentOriginLabel)
  const u = normalizeDept(userDepartmentRaw)
  const allowed = CAP_DEPT_ALIASES[key] ?? [key]
  return allowed.includes(u)
}
