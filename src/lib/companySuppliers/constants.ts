/**
 * Col·lecció única de proveïdors compartida entre:
 * - Manteniment → Dades → Proveïdors
 * - Roba personal (RRHH)
 *
 * El camp `supplierDepartments` (array) indica per a quins àmbits serveix el proveïdor
 * (p. ex. `['Manteniment']`, `['Recursos Humans']`, o ambdós).
 */
export const SUPPLIERS_COLLECTION = 'maintenanceSuppliers'

export const SUPPLIER_SCOPE_DEPARTMENTS = ['Manteniment', 'Recursos Humans'] as const

export type SupplierScopeDepartment = (typeof SUPPLIER_SCOPE_DEPARTMENTS)[number]
