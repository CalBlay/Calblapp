/**
 * Catàleg de proveïdors de Manteniment. Els antics registres de Recursos Humans
 * es migren al catàleg independent `dotacio_suppliers` de Roba personal.
 */
export const SUPPLIERS_COLLECTION = 'maintenanceSuppliers'

export const SUPPLIER_SCOPE_DEPARTMENTS = ['Manteniment', 'Recursos Humans'] as const

export type SupplierScopeDepartment = (typeof SUPPLIER_SCOPE_DEPARTMENTS)[number]
