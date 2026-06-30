//file: src/lib/accessControl.ts
import { normalizeRole, type Role } from '@/lib/roles'
import {
  ROBA_PERSONAL_SUBMODULE_DEFS,
  ROBA_SUBMODULE_ROLES,
  robaVisibleSubmodulePaths,
} from '@/lib/robaPersonalPermissions'
import { isMaintenanceTicketCreatorDepartment } from '@/lib/maintenanceTicketCreators'

/** Tipus d’usuari mínim */
export interface AccessUser {
  role?: string
  department?: string
  canRespondSurveys?: boolean
  /** Responsable de roba del departament (mòdul Roba personal). */
  isDepartmentRobaLead?: boolean
  /** Treballador amb `personnel` vinculat i usuari d’app (roba personal). */
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
  /** Cap de transports (logística) — validació de reserves comercials. */
  isTransportLead?: boolean
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

export const normalizeDept = (raw?: string | null) => {
  const base = (raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const compact = base.replace(/\s+/g, '')
  if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
  return base
}

export function isProductionWorker(user?: AccessUser): boolean {
  if (!user) return false
  return normalizeRole(user.role) === 'treballador' && normalizeDept(user.department) === 'produccio'
}

export const isMaintenanceCapDepartment = (raw?: string) =>
  MAINTENANCE_CAP_DEPARTMENTS.has(normalizeDept(raw))

/** Usuari de logística que rep notificacions i gestiona la safata de tickets de manteniment. */
export function isLogisticsMaintenanceTicketsManager(user?: AccessUser): boolean {
  if (!user) return false
  return normalizeRole(user.role) === 'usuari' && normalizeDept(user.department) === 'logistica'
}

/**
 * Usuari extern (restaurant, centre, etc.) que només crea i segueix els seus tickets.
 * No és logística ni manteniment.
 */
export function isExternalMaintenanceTicketReporter(user?: AccessUser): boolean {
  if (!user) return false
  if (canManageMaintenanceTickets(user)) return false
  const dept = normalizeDept(user.department)
  return dept !== 'logistica' && dept !== 'manteniment'
}

/** Pot veure i gestionar tots els tickets (admin/cap manteniment). Logística: permís inbox. */
export function canManageMaintenanceTickets(user?: AccessUser): boolean {
  if (!user) return false
  const role = normalizeRole(user.role)
  const dept = normalizeDept(user.department)
  if (role === 'admin' || role === 'direccio') return true
  if (role === 'cap' && isMaintenanceCapDepartment(dept)) return true
  return false
}

const LOGISTICS_TICKETS_MANAGER_HIDDEN_PATHS = new Set([
  '/menu/incidents',
  '/menu/modifications',
])

export function canAccessProjectsModule(user?: AccessUser | null): boolean {
  if (!user) return false
  if (user.opsProjectsConfigurable === false) return false
  const role = normalizeRole(user.role)
  return ['admin', 'direccio', 'cap', 'usuari', 'comercial'].includes(role)
}

const moduleAccessDepartmentFor = (role: Role, department?: string) => {
  if (role === 'comercial') return 'empresa'
  return normalizeDept(department)
}

/**
 * Caps que entren al planificador / tickets de manteniment (MODULES Manteniment) poden
 * demanar explícitament el llistat de personal de manteniment via API encara que el seu
 * departament de sessió sigui un altre (p.ex. cap de logística que planifica preventius).
 */
export function canRequestMaintenancePersonnelByQuery(user: AccessUser): boolean {
  const role = normalizeRole(user.role)
  const dept = normalizeDept(user.department)
  if (role !== 'cap') return false
  return dept === 'manteniment' || dept === 'logistica' || dept === 'total'
}

export const MODULES: ModuleDef[] = [
  { label: 'Torns', path: '/menu/torns', roles: ['admin','direccio','cap','treballador'] },

  { label: 'Esdeveniments', path: '/menu/events',
    roles: ['admin','direccio','cap','treballador','comercial','usuari','observer'] },

  {
    label: 'Auditoria',
    path: '/menu/auditoria',
    roles: ['admin', 'direccio', 'cap'],
    departments: ['comercial', 'empresa', 'casaments', 'foodlovers', 'food lover', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
    submodules: [
      {
        label: 'Plantilles',
        path: '/menu/auditoria/plantilles',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'empresa', 'casaments', 'foodlovers', 'food lover', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
      },
      {
        label: 'Avaluacio',
        path: '/menu/auditoria/valoracio',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'empresa', 'casaments', 'foodlovers', 'food lover', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
      },
      {
        label: 'Consulta',
        path: '/menu/auditoria/consulta',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['comercial', 'empresa', 'casaments', 'foodlovers', 'food lover', 'serveis', 'cuina', 'logistica', 'decoracio', 'decoracions'],
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
    departments: ['manteniment', 'logistica'],
    submodules: [
      {
        label: 'Jornada',
        path: '/menu/manteniment/preventius/fulls',
        roles: ['admin','direccio','cap','treballador'],
        departments: ['manteniment','logistica'],
      },
      {
        label: 'Planificador',
        path: '/menu/manteniment/preventius',
        roles: ['admin','direccio','cap'],
        departments: ['manteniment','logistica'],
      },
      {
        label: 'Tickets',
        path: '/menu/manteniment/tickets',
        roles: ['admin','direccio','cap','usuari','treballador'],
        departments: ['manteniment','logistica','cuina central','serveis'],
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
      {
        label: 'Informes',
        path: '/menu/manteniment/informes',
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
    label: 'Sondeigs',
    path: '/menu/sondeigs',
    roles: ['admin','direccio','treballador','usuari','comercial','observer'],
  },

  {
    label: 'Incidències',
    path: '/menu/incidents',
    roles: ['admin', 'direccio', 'cap', 'usuari', 'comercial'],
    departments: ['produccio', 'logistica', 'cuina', 'serveis', 'marqueting', 'marketing'],
    submodules: [
      {
        label: 'Quadre',
        path: '/menu/incidents/quadre',
        roles: ['admin', 'direccio', 'cap', 'usuari', 'comercial'],
        departments: ['produccio', 'logistica', 'cuina', 'serveis', 'marqueting', 'marketing'],
      },
      {
        label: 'Tipologies',
        path: '/menu/incidents/tipologies',
        roles: ['admin', 'direccio', 'cap'],
        departments: ['produccio'],
      },
    ],
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

  {
    label: 'Settings',
    path: '/menu/settings',
    roles: ['admin', 'direccio'],
    submodules: [
      {
        label: 'Permisos',
        path: '/menu/settings/permisos',
        roles: ['admin'],
      },
      {
        label: 'Magatzems',
        path: '/menu/settings/magatzems',
        roles: ['admin', 'direccio'],
      },
      {
        label: 'Articles comanda',
        path: '/menu/settings/articles',
        roles: ['admin', 'direccio'],
      },
      {
        label: 'Serveis',
        path: '/menu/settings/serveis',
        roles: ['admin', 'direccio'],
      },
    ],
  },

  {
    label: 'Roba personal',
    path: '/menu/roba-personal',
    roles: ['admin', 'cap', 'treballador'],
    departments: ['recursos humans'],
    submodules: ROBA_PERSONAL_SUBMODULE_DEFS.map((sub) => ({
      label: sub.label,
      path: sub.path,
      roles: ROBA_SUBMODULE_ROLES,
      departments: ['recursos humans'],
    })),
  },

  {
    label: 'Documentació',
    path: '/menu/documentacio',
    roles: ['admin', 'direccio'],
  },

  {
    label: 'Consultes MCP',
    path: '/menu/consultes-mcp',
    roles: ['admin'],
    submodules: [
      {
        label: 'Consulta oberta',
        path: '/menu/consultes-mcp#consulta-oberta',
        roles: ['admin'],
      },
      {
        label: 'Consultes fixes',
        path: '/menu/consultes-mcp',
        roles: ['admin'],
      },
    ],
  },

  { label: 'Imatges', path: '/menu/media',
    roles: ['admin'] },

  {
    label: 'Logística',
    path: '/menu/logistica',
    roles: ['admin','direccio','cap','treballador','comercial','usuari'],
    departments: ['logistica', 'empresa'],
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
        label: 'Reserva comercials',
        path: '/menu/logistica/reserva-comercials',
        roles: ['admin','direccio','cap','treballador','comercial','usuari'],
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
    roles: ['admin','direccio','cap','treballador','comercial','usuari','observer'],
  },

  {
    label: 'Projectes',
    path: '/menu/projects',
    roles: ['admin', 'direccio', 'cap', 'usuari', 'comercial'],
  },

  {
    label: 'Espais',
    path: '/menu/spaces',
    roles: ['admin', 'direccio', 'cap', 'comercial', 'usuari'],
    submodules: [
      {
        label: 'Consulta de reserves',
        path: '/menu/spaces/reserves',
        roles: ['admin', 'direccio', 'cap', 'comercial', 'usuari'],
      },
      {
        label: 'Consulta BBDD',
        path: '/menu/spaces/info',
        roles: ['admin', 'direccio', 'cap', 'comercial', 'usuari'],
      },
      {
        label: 'Premisses reserves',
        path: '/menu/spaces/premisses',
        roles: ['admin'],
      },
    ],
  },

  {
    label: 'Cuina central',
    path: '/menu/cuina-central',
    roles: ['admin'],
    submodules: [
      { label: 'Dades', path: '/menu/cuina-central/dades', roles: ['admin'] },
      { label: 'Producció', path: '/menu/cuina-central/produccio', roles: ['admin'] },
      { label: 'Decisions diàries', path: '/menu/cuina-central/decisions', roles: ['admin'] },
      { label: 'Informes', path: '/menu/cuina-central/informes', roles: ['admin'] },
      { label: 'Planificador', path: '/menu/cuina-central/planificador', roles: ['admin'] },
    ],
  },

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
  const dept = moduleAccessDepartmentFor(role, user.department)
  const matchesDept = (d?: string) => normalizeDept(d) === dept
  const isMaintenanceWorker = role === 'treballador' && dept === 'manteniment'
  const isProductionOperationalWorker = isProductionWorker(user)
  const productionWorkerModulePaths = new Set([
    '/menu/events',
    '/menu/pissarra',
    '/menu/incidents',
    '/menu/modifications',
    '/menu/calendar',
    '/menu/spaces',
  ])

  const isLogisticsTicketsManager = isLogisticsMaintenanceTicketsManager(user)

  return MODULES
    .filter(mod => {
      if (isMaintenanceWorker) {
        return mod.path === '/menu/manteniment'
      }

      if (isLogisticsTicketsManager && LOGISTICS_TICKETS_MANAGER_HIDDEN_PATHS.has(mod.path)) {
        return false
      }

      if (mod.path === '/menu/projects' && !canAccessProjectsModule(user)) {
        return false
      }

      return true
    })
    .filter(mod => {
      if (isMaintenanceWorker) {
        return mod.path === '/menu/manteniment'
      }

      if (isLogisticsTicketsManager && LOGISTICS_TICKETS_MANAGER_HIDDEN_PATHS.has(mod.path)) {
        return false
      }

      if (mod.path === '/menu/projects' && !canAccessProjectsModule(user)) {
        return false
      }

      if (mod.path === '/menu/manteniment') {
        if (
          isMaintenanceTicketCreatorDepartment(dept) &&
          (role === 'usuari' || role === 'treballador' || role === 'cap')
        ) {
          return true
        }
        if (isLogisticsMaintenanceTicketsManager(user)) {
          return true
        }
      }

      if (mod.path === '/menu/torns') {
        if (role === 'admin' || role === 'direccio') return true
        if (role === 'treballador') return true
        if (role === 'cap') return TORNS_CAP_DEPARTMENTS.has(dept)
        return false
      }

      if (mod.path === '/menu/sondeigs') {
        if (role === 'admin' || role === 'direccio') return true
        return Boolean(user.canRespondSurveys)
      }

      if (mod.path === '/menu/roba-personal') {
        if (role === 'admin' || role === 'direccio') return true
        if (!mod.roles.includes(role)) return false
        if (mod.departments?.some(matchesDept)) return true
        if (user.isDepartmentRobaLead) return true
        return false
      }

      if (isProductionOperationalWorker && productionWorkerModulePaths.has(mod.path)) {
        if (mod.departments) return mod.departments.some(matchesDept)
        return true
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

      if (isMaintenanceWorker && mod.path === '/menu/manteniment') {
        return {
          ...mod,
          submodules: mod.submodules.filter((sub) => sub.path === '/menu/manteniment/preventius/fulls'),
        }
      }

      if (
        (isMaintenanceTicketCreatorDepartment(dept) || isLogisticsMaintenanceTicketsManager(user)) &&
        mod.path === '/menu/manteniment'
      ) {
        return {
          ...mod,
          submodules: mod.submodules.filter((sub) => sub.path === '/menu/manteniment/tickets'),
        }
      }

      const visibleSubmodules = mod.submodules.filter(sub => {
        if (isProductionOperationalWorker && mod.path === '/menu/incidents') {
          return sub.path === '/menu/incidents/quadre'
        }

        if (isProductionOperationalWorker && mod.path === '/menu/spaces') {
          return (
            sub.path === '/menu/spaces/reserves' || sub.path === '/menu/spaces/info'
          )
        }

        if (sub.path === '/menu/allergens/bbdd') {
          return role === 'admin' || dept === 'qualitat'
        }

        if (mod.path === '/menu/roba-personal') {
          return robaVisibleSubmodulePaths(user).has(sub.path)
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

/** Treballadors de manteniment: sense accés al mòdul Espais (ni menú ni URL directa). */
export function isMaintenanceWorkerSpacesBlocked(user: AccessUser): boolean {
  return normalizeRole(user.role) === 'treballador' && normalizeDept(user.department) === 'manteniment'
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
