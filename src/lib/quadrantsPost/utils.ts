import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import type { JamoneroAssignmentNormalized, JamoneroAssignmentRaw } from '@/lib/quadrantsPost/types'

export const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export const norm = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())

/** Serveis, Cuina i Logística: mateix sistema de modes, training i confirmació inline en manual. */
export const QUADRANT_CORE_DEPARTMENTS = new Set(['serveis', 'cuina', 'logistica'])
export const isQuadrantCoreDepartment = (deptNorm: string) => QUADRANT_CORE_DEPARTMENTS.has(norm(deptNorm))

export const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

/** Reparteix M elements en `phaseCount` trossos contigus (cap solapament); suma dels trossos = M. */
export function partitionAssignmentsAcrossPhases<T>(items: T[], phaseCount: number): T[][] {
  if (phaseCount <= 0) return []
  const n = items.length
  const result: T[][] = []
  const base = Math.floor(n / phaseCount)
  let extra = n % phaseCount
  let offset = 0
  for (let i = 0; i < phaseCount; i++) {
    const size = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    result.push(items.slice(offset, offset + size))
    offset += size
  }
  return result
}

/**
 * Resol el nom real de col·leccio per departament (`quadrants{Dept}` o
 * `quadrant{Dept}`). Delega al modul `firestoreCollections` que
 * comparteix el cache de `listCollections()` entre tots els call sites.
 */
export async function resolveWriteCollectionForDepartment(department: string) {
  return resolveQuadrantCollection(department, { prefer: 'singular' })
}

export const normalizeJamoneroAssignment = (
  assignment: JamoneroAssignmentRaw,
  index: number
): JamoneroAssignmentNormalized => ({
  id: String(assignment?.id || `jamonero-${index + 1}`),
  mode: assignment?.mode === 'manual' ? 'manual' : 'auto',
  personnelId: assignment?.personnelId ? String(assignment.personnelId) : null,
  personnelName: assignment?.personnelName ? String(assignment.personnelName) : null,
})

export const getDateWindow = (startISODate: string) => {
  const d = new Date(`${startISODate}T00:00:00`)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - (day - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const [ws, we, ms, me] = [weekStart, weekEnd, monthStart, monthEnd].map((x) =>
    x.toISOString().slice(0, 10)
  )
  return { ws, we, ms, me }
}
