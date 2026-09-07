import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import {
  COST_SERVEIS_DEPARTMENTS,
  COST_SERVEIS_DEPT_LABELS,
  type CostServeisDepartment,
} from '@/lib/costServeis/types'

export function mapUserDeptToCostDept(
  department?: string | null
): CostServeisDepartment | null {
  const d = normalizeDept(department)
  if (d === 'logistica' || d === 'transports') return 'logistica'
  if (d === 'serveis') return 'serveis'
  if (d === 'cuina' || d === 'cuina central' || d.replace(/\s+/g, '') === 'cuinacentral') {
    return 'cuina'
  }
  return null
}

/** Admin, direcció o dept «total»/empresa poden escollir qualsevol dept. */
export function canChooseCostDepartment(role?: string | null, department?: string | null): boolean {
  const r = normalizeRole(role)
  if (r === 'admin' || r === 'direccio') return true
  const d = normalizeDept(department)
  return d === 'total' || d === 'empresa' || d === 'direccio'
}

export function resolveCostDepartmentFilter(opts: {
  role?: string | null
  department?: string | null
  requested?: string | null
}): CostServeisDepartment | 'all' {
  const canChoose = canChooseCostDepartment(opts.role, opts.department)
  const requested = String(opts.requested || '').trim().toLowerCase()

  if (canChoose) {
    if (requested === 'all' || requested === '') return 'all'
    if ((COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(requested)) {
      return requested as CostServeisDepartment
    }
    return 'all'
  }

  return mapUserDeptToCostDept(opts.department) || 'logistica'
}

export function costDepartmentSelectOptions(includeAll: boolean) {
  const opts = COST_SERVEIS_DEPARTMENTS.map((d) => ({
    value: d,
    label: COST_SERVEIS_DEPT_LABELS[d],
  }))
  if (includeAll) {
    return [{ value: 'all', label: 'Tots els departaments' }, ...opts]
  }
  return opts
}
