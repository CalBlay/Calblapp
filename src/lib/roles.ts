// File: src/lib/roles.ts

export type Role =
  | 'admin'
  | 'direccio'
  | 'cap'
  | 'treballador'
  | 'comercial'
  | 'observer'
  | 'usuari'

/** Conjunt de rols permesos, en minúscules i sense accents */
export const allowedRoles = new Set<Role>([
  'admin',
  'direccio',
  'cap',
  'treballador',
  'comercial',
  'observer',
  'usuari',
])

/**
 * Normalitza un rol a minúscules i sense accents.
 * Exemples:
 *  - "Direcció" -> "direccio"
 *  - "Cap Departament" -> "cap"
 *  - "Treballador" -> "treballador"
 *  - "Comercial" -> "comercial"
 *  - null/undefined -> "treballador" (fallback)
 */
export function normalizeRole(input?: string | null): Role {
  if (!input) return 'treballador'

  // Elimina accents i baixa a minúscules
  const deAccented = input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  // Mapa d'aliases comuns cap al nostre enum tancat
  const aliasMap: Record<string, Role> = {
    admin: 'admin',
    direccio: 'direccio',
    direccion: 'direccio',
    'cap departament': 'cap',
    'departament de cap': 'cap',
    'departament cap': 'cap',
    capdepartament: 'cap',
    cap: 'cap',
    treballador: 'treballador',
    trabajador: 'treballador',
    worker: 'treballador',
    empleat: 'treballador',
    comercial: 'comercial',
    comercialo: 'comercial', // opcional
    observer: 'observer',
    observador: 'observer',
    usuari: 'usuari',
    user: 'usuari',
    invitado: 'usuari',
  }

  if (deAccented in aliasMap) return aliasMap[deAccented]
  if (deAccented.includes('cap') && deAccented.includes('depart')) return 'cap'

  // Si ja ve una clau exacta vàlida
  if (allowedRoles.has(deAccented as Role)) return deAccented as Role

  // Fallback segur
  return 'treballador'
}
