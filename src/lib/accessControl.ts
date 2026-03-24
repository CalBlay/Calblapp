//file: src/lib/accessControl.ts
import { normalizeRole, type Role } from '@/lib/roles'

/** Tipus d’usuari mínim */
export interface AccessUser {
  role?: string
  department?: string
}

export interface SubModuleDef {
  label: string
  path: string
  roles: Role[]
  departments?: string[]
}

export interface ModuleDef {
  label: string
  path: string
  roles: Role[]
  departments?: string[]
  submodules?: SubModuleDef[]
}

/** 🔐 CATÀLEG ÚNIC DE MÒDULS */
const TORNS_CAP_DEPARTMENTS = new Set(['logistica', 'cuina', 'serveis'])
const MAINTENANCE_CAP_DEPARTMENTS = new Set(['manteniment', 'logistica'])

export const normalizeDept = (raw?: string) => {
  const base = (raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const compact = base.replace(/\s+/g, '')
  if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
  return base
}

export const isMaintenanceCapDepartment = (raw?: string) =>
  MAINTENANCE_CAP_DEPARTMENTS.has(normalizeDept(raw))

export const MODULES: ModuleDef[] = [
  { label: 'Torns', path: '/menu/torns', roles: ['admin','direccio','cap','treballador'] },

  { label: 'Esdeveniments', path: '/menu/events',
    roles: ['admin','direccio','cap','comercial','usuari'] },

  {
    label: 'Auditoria',
    path: '/menu/auditoria',
    roles: ['admin', 'direccio', 'cap'],
    departments: ['comercial', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
    submodules: [
      {
        label: 'Plantilles',
        path: '/menu/auditoria/plantilles',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
      },
      {
        label: 'Avaluacio',
        path: '/menu/auditoria/valoracio',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
      },
      {
        label: 'Consulta',
        path: '/menu/auditoria/consulta',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
      },
    ],
  },

  { label: 'Ops', path: '/menu/missatgeria',
    roles: ['admin'],
    departments: ['manteniment'],
  },

  { label: 'Pissarra', path: '/menu/pissarra',
    roles: ['admin','direccio','cap','comercial','usuari'] },

  { label: 'Comercial', path: '/menu/comercial',
    roles: ['admin','observer'] },

  { label: 'Personal', path: '/menu/personnel',
    roles: ['admin','direccio','cap'],
    departments: ['logistica','cuina','serveis','manteniment'],
  },

  { label: 'Manteniment', path: '/menu/manteniment',
    roles: ['admin','direccio','cap'],
    departments: ['manteniment','logistica','Total'],
    submodules: [
      {
        label: 'Planificador',
        path: '/menu/manteniment/preventius',
        roles: ['admin','direccio','cap'],
        departments: ['manteniment','logistica'],
      },
      {
        label: 'Tickets',
        path: '/menu/manteniment/tickets',
        roles: ['admin','direccio','cap'],
        departments: ['manteniment','logistica'],
      },
      {
        label: 'Dades',
        path: '/menu/manteniment/dades',
        roles: ['admin','direccio','cap'],
        departments: ['manteniment','logistica'],
      },
      {
        label: 'Seguiment',
        path: '/menu/manteniment/seguiment',
        roles: ['admin','direccio','cap'],
        departments: ['manteniment','logistica'],
      },
    ],
  },

  { label: 'Quadrants', path: '/menu/quadrants',
    roles: ['admin','direccio','cap'] ,
    departments: ['logistica','cuina','serveis'],
  },

  {
    label: 'Incidències',
    path: '/menu/incidents',
    roles: ['admin','direccio','cap','usuari','comercial'],
    departments: ['produccio','logistica','cuina','serveis'],
  },

  {
    label: 'Modificacions',
    path: '/menu/modifications',
    roles: ['admin','direccio','cap','usuari','comercial'],
    departments: ['produccio','logistica','cuina'],
  },

  { label: 'Informes', path: '/menu/reports',
    roles: ['admin','direccio'] },

  { label: 'Usuaris', path: '/menu/users',
    roles: ['admin'] },

  { label: 'Imatges', path: '/menu/media',
    roles: ['admin'] },

  {
    label: 'Logística',
    path: '/menu/logistica',
    roles: ['admin','direccio','cap','treballador'],
    departments: ['logistica'],
    submodules: [
      {
        label: 'Preparació',
        path: '/menu/logistica/preparacio',
        roles: ['admin','direccio','cap','treballador'],
      },
      {
        label: 'Assignacions',
        path: '/menu/logistica/assignacions',
        roles: ['admin','direccio','cap'],
      },
      {
        label: 'Disponibilitat',
        path: '/menu/logistica/disponibilitat',
        roles: ['admin','direccio','cap'],
      },
      {
        label: 'Transports',
        path: '/menu/logistica/transports',
        roles: ['admin','direccio','cap'],
      },
    ],
  },

  {
    label: 'Calendar',
    path: '/menu/calendar',
    roles: ['admin','direccio','cap','comercial','usuari'],
    departments: ['produccio','empresa','casaments','foodlovers','food lover', 'logistica', 'cuina','serveis'],
  },

  {
    label: 'Projectes',
    path: '/menu/projects',
    roles: ['admin', 'direccio', 'cap', 'usuari', 'comercial'],
  },

  { label: 'Espais', path: '/menu/spaces',
    roles: ['admin','direccio','cap','comercial','usuari'] },

  {
    label: 'Al·lèrgens',
    path: '/menu/allergens',
    roles: ['admin','direccio','cap','treballador','comercial','usuari'],
    submodules: [
      {
        label: 'BBDD plats',
        path: '/menu/allergens/bbdd',
        roles: ['admin','direccio','cap'],
      },
      {
        label: 'Buscador',
        path: '/menu/allergens/buscador',
        roles: ['admin','direccio','cap','treballador','comercial','usuari'],
      },
    ],
  },
]

/** 🧠 VISIBILITAT DE MÒDULS + SUBMÒDULS */
export function getVisibleModules(user: AccessUser): ModuleDef[] {
  const role = normalizeRole(user.role)
  const dept = normalizeDept(user.department)
  const matchesDept = (d?: string) => normalizeDept(d) === dept
  const isMaintenanceWorker = role === 'treballador' && dept === 'manteniment'

  return MODULES
    .filter(mod => {
      if (isMaintenanceWorker) {
        return (
          mod.path === '/menu/manteniment' ||
          mod.path === '/menu/spaces'
        )
      }

      return true
    })
    .filter(mod => {
      if (isMaintenanceWorker) {
        return (
          mod.path === '/menu/manteniment' ||
          mod.path === '/menu/spaces'
        )
      }

      if (mod.path === '/menu/torns') {
        if (role === 'admin' || role === 'direccio') return true
        if (role === 'treballador') return true
        if (role === 'cap') return TORNS_CAP_DEPARTMENTS.has(dept)
        return false
      }

      if (!mod.roles.includes(role)) return false

      if (mod.departments) {
        if (role === 'admin' || role === 'direccio') return true
        return mod.departments.some(matchesDept)
      }

      return true
    })
    .map(mod => {
      if (!mod.submodules) return mod

      const visibleSubmodules = mod.submodules.filter(sub => {
        if (sub.path === '/menu/allergens/bbdd') {
          return role === 'admin' || dept === 'qualitat'
        }

        if (!sub.roles.includes(role)) return false

        if (sub.departments) {
          if (role === 'admin' || role === 'direccio') return true
          return sub.departments.some(matchesDept)
        }

        return true
      })

      return {
        ...mod,
        submodules: visibleSubmodules,
      }
    })
}

/** ✏️ PERMISOS D’EDICIÓ DE FINCA */
export function canEditFinca(user?: AccessUser): boolean {
  if (!user) return false

  const role = normalizeRole(user.role)
  const dept = (user.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  if (role === 'admin' || role === 'direccio' || role === 'comercial') return true
  if (dept === 'produccio') return true

  return (
    role === 'cap' &&
    (dept === 'empresa' || dept === 'casaments' || dept === 'foodlovers')
  )
}

