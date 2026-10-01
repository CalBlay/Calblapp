import {
  getUserDepartmentSelectOptions,
  normalizeDepartmentLabel,
} from '@/data/departments'

export function normalizeAdditionalWorkDepartments(
  input: unknown,
  primaryDepartment?: string
): string[] {
  const values = Array.isArray(input)
    ? input.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const primaryKey = normalizeDepartmentLabel(primaryDepartment)
  const wantedKeys = new Set(
    values.map(normalizeDepartmentLabel).filter((key) => key && key !== primaryKey)
  )

  return getUserDepartmentSelectOptions(...values).filter((department) =>
    wantedKeys.has(normalizeDepartmentLabel(department))
  )
}

export function additionalWorkDepartmentKeys(
  input: unknown,
  primaryDepartment?: string
): string[] {
  return normalizeAdditionalWorkDepartments(input, primaryDepartment).map(
    normalizeDepartmentLabel
  )
}

export function worksInDepartment(
  data: {
    department?: unknown
    departmentLower?: unknown
    additionalWorkDepartments?: unknown
    additionalWorkDepartmentsLower?: unknown
  },
  requestedDepartment: string
): boolean {
  const requestedKey = normalizeDepartmentLabel(requestedDepartment)
  if (!requestedKey) return false

  const primaryKey = normalizeDepartmentLabel(
    String(data.department || data.departmentLower || '')
  )
  if (primaryKey === requestedKey) return true

  const additionalValues = Array.isArray(data.additionalWorkDepartmentsLower)
    ? data.additionalWorkDepartmentsLower
    : data.additionalWorkDepartments
  return Array.isArray(additionalValues)
    ? additionalValues.some(
        (department) => normalizeDepartmentLabel(String(department || '')) === requestedKey
      )
    : false
}
