import type { Role } from '@/lib/roles'

/** Lectura llista / detall plantilla preventius. */
export const ROLES_MAINTENANCE_TEMPLATES_READ: Role[] = ['admin', 'direccio', 'cap', 'treballador']

/** Crear / editar / eliminar plantilles. */
export const ROLES_MAINTENANCE_TEMPLATES_WRITE: Role[] = ['admin', 'direccio', 'cap']
