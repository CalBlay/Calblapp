/**
 * Treballadors del mòdul Roba personal: es llegeixen i escriuen com a documents `personnel`.
 * Camps propis de roba (no usats pel mòdul Personal UI): workerCode, robaWorkerActive, robaNotes, …
 */
import { FieldValue } from 'firebase-admin/firestore'

export function str(v: unknown): string {
  return String(v ?? '').trim()
}

/** Resposta JSON de /api/roba-personal/workers (compatible amb la UI actual). */
export function serializeRobaWorkerRow(
  id: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const workerCode = str(raw.workerCode) || str(raw.code)
  const code = workerCode || id
  const robaInactive = raw.robaWorkerActive === false
  const hasAppUser = raw.robaHasAppUser !== false
  /** Molts documents `personnel` tenen `departmentLower` i el camp `department` buit. */
  const department = str(raw.department) || str(raw.departmentLower)
  return {
    id,
    name: str(raw.name),
    code,
    department,
    email: raw.email != null && str(raw.email) ? str(raw.email) : null,
    phone: raw.phone != null && str(raw.phone) ? str(raw.phone) : null,
    isActive: !robaInactive,
    hasAppUser,
    jobTitle: raw.jobTitle != null ? str(raw.jobTitle) : null,
    notes: raw.robaNotes != null ? str(raw.robaNotes) : null,
  }
}

export function isIncludedInRobaWorkersList(raw: Record<string, unknown>): boolean {
  return raw.robaWorkerActive !== false
}

export function basePersonnelFieldsFromRoba(input: {
  name: string
  department: string
  email: string | null
  phone: string | null
  workerCode: string
  available: boolean
  jobTitle: string | null
  robaNotes: string | null
  robaSource: string
  createdAtMs: number
  updatedAt: FieldValue
}): Record<string, unknown> {
  const department = str(input.department)
  return {
    name: str(input.name),
    department,
    departmentLower: department.toLowerCase(),
    role: 'equip',
    driver: { isDriver: false, camioGran: false, camioPetit: false },
    available: input.available,
    maxHoursWeek: 40,
    email: input.email,
    phone: input.phone,
    workerCode: str(input.workerCode),
    robaWorkerActive: true,
    jobTitle: input.jobTitle,
    robaNotes: input.robaNotes,
    robaSource: input.robaSource,
    createdAt: input.createdAtMs,
    updatedAt: input.updatedAt,
  }
}

export function personnelPatchFromRobaCsvLine(input: {
  name: string
  department: string
  workerCode: string
  batchId: string
  updatedAt: FieldValue
}): Record<string, unknown> {
  const department = str(input.department)
  return {
    name: str(input.name),
    department,
    departmentLower: department.toLowerCase(),
    workerCode: str(input.workerCode),
    robaWorkerActive: true,
    robaSource: 'csv_import',
    lastRobaImportBatchId: input.batchId,
    updatedAt: input.updatedAt,
  }
}

export function personnelCreateFromRobaCsvLine(input: {
  name: string
  department: string
  workerCode: string
  batchId: string
  now: FieldValue
}): Record<string, unknown> {
  const department = str(input.department)
  const createdAtMs = Date.now()
  return {
    name: str(input.name),
    department,
    departmentLower: department.toLowerCase(),
    role: 'equip',
    driver: { isDriver: false, camioGran: false, camioPetit: false },
    available: true,
    maxHoursWeek: 40,
    email: null,
    phone: null,
    workerCode: str(input.workerCode),
    robaWorkerActive: true,
    robaSource: 'csv_import',
    lastRobaImportBatchId: input.batchId,
    createdAt: createdAtMs,
    updatedAt: input.now,
  }
}
