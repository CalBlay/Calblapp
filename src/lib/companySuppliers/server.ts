import type { firestore as FirestoreNS } from 'firebase-admin'
import {
  SUPPLIERS_COLLECTION,
  SUPPLIER_SCOPE_DEPARTMENTS,
  type SupplierScopeDepartment,
} from '@/lib/companySuppliers/constants'

export type CompanySupplierRow = {
  id: string
  name: string
  email: string
  phone: string
  specialty: string
  notes: string
  active: boolean
  supplierDepartments: string[]
  createdAt: unknown
  updatedAt: unknown
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

/** Documents sense camp (antics) es tracten com a proveïdors de Manteniment. */
function parseDepartments(raw: unknown): SupplierScopeDepartment[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['Manteniment']
  const allowed = new Set<string>(SUPPLIER_SCOPE_DEPARTMENTS)
  const out = raw
    .map((x) => String(x).trim())
    .filter((d): d is SupplierScopeDepartment => allowed.has(d))
  const uniq = [...new Set(out)] as SupplierScopeDepartment[]
  return uniq.length ? uniq : ['Manteniment']
}

export function serializeSupplier(id: string, data: Record<string, unknown>): CompanySupplierRow {
  return {
    id,
    name: str(data.name),
    email: str(data.email),
    phone: str(data.phone),
    specialty: str(data.specialty),
    notes: str(data.notes),
    active: data.active !== false,
    supplierDepartments: parseDepartments(data.supplierDepartments),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}

export function supplierServesDepartment(row: CompanySupplierRow, dept: SupplierScopeDepartment): boolean {
  return (row.supplierDepartments as string[]).includes(dept)
}

export async function listAllSuppliers(db: FirestoreNS.Firestore): Promise<CompanySupplierRow[]> {
  const snap = await db.collection(SUPPLIERS_COLLECTION).orderBy('name', 'asc').get()
  return snap.docs.map((doc) => serializeSupplier(doc.id, doc.data() as Record<string, unknown>))
}

export function filterSuppliersByDepartment(
  rows: CompanySupplierRow[],
  dept: SupplierScopeDepartment
): CompanySupplierRow[] {
  return rows.filter((r) => supplierServesDepartment(r, dept))
}

export function normalizeSupplierDepartmentsInput(
  raw: unknown,
  defaultDepts: SupplierScopeDepartment[]
): SupplierScopeDepartment[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...defaultDepts]
  const allowed = new Set<string>(SUPPLIER_SCOPE_DEPARTMENTS)
  const out = raw
    .map((x) => String(x).trim())
    .filter((d) => allowed.has(d)) as SupplierScopeDepartment[]
  const uniq = [...new Set(out)]
  return uniq.length ? uniq : [...defaultDepts]
}
