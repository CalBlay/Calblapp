import { MODULES } from '@/lib/accessControl'

export const APP_TITLE = 'Cal Blay App'

type PathEntry = {
  path: string
  label: string
  moduleLabel: string
}

const SEGMENT_LABELS: Record<string, string> = {
  projects: 'OpsiaProjects',
  spaces: 'Espais',
  torns: 'Torns',
  quadrants: 'Quadrants',
  personnel: 'Personal',
  events: 'Esdeveniments',
  auditoria: 'Auditoria',
  allergens: 'Al·lèrgens',
  manteniment: 'Manteniment',
  deco: 'Deco',
  incidents: 'Incidències',
  documentacio: 'Documentació',
  'roba-personal': 'Roba personal',
  reports: 'Informes',
  settings: 'Settings',
  logistica: 'Logística',
  'cuina-central': 'Cuina central',
  calendar: 'Calendar',
  comercial: 'Comercial',
  missatgeria: 'Ops',
  pissarra: 'Pissarra',
  sondeigs: 'Sondeigs',
  modifications: 'Modificacions',
  users: 'Usuaris',
  media: 'Imatges',
  'consultes-mcp': 'Consultes MCP',
  configuracio: 'Configuració',
  reserves: 'Reserves',
  operativa: 'Operativa',
  drafts: 'Esborranys',
  premisses: 'Premisses',
  info: 'Informació',
  assigned: 'Assignats',
  bbdd: 'BBDD plats',
  buscador: 'Buscador',
  treball: 'Fulls de treball',
  tickets: 'Tickets',
  'tickets-deco': 'Tickets',
  preventius: 'Preventius',
  planificador: 'Planificador',
  plantilles: 'Plantilles',
  valoracio: 'Avaluació',
  consulta: 'Consulta',
  fulls: 'Full de treball',
  seguiment: 'Seguiment',
  historial: 'Historial',
  quadre: 'Quadre de comandament',
  tipologies: 'Tipologies',
  permisos: 'Permisos',
  magatzems: 'Magatzems',
  articles: 'Articles comanda',
  serveis: 'Serveis',
  preparacio: 'Preparació',
  assignacions: 'Assignacions',
  disponibilitat: 'Disponibilitat',
  'reserva-comercials': 'Reserva comercials',
  transports: 'Transports',
  produccio: 'Producció',
  decisions: 'Decisions diàries',
  informes: 'Informes',
  dades: 'Dades',
  comanda: 'Comanda',
  confirmats: 'Confirmats',
  completat: 'Completat',
  editar: 'Editar',
  maquinaria: 'Maquinaria',
  rooms: 'Sales',
  new: 'Nou',
  list: 'Llistat',
  'grups-enviament': 'Grups enviament',
  productes: 'Productes',
  treballadors: 'Treballadors',
  estoc: 'Estoc',
  sollicituds: 'Sol·licituds',
  recollides: 'Recepcions',
  entregues: 'Entregues',
  compres: 'Compres',
}

const EXTRA_PATH_ENTRIES: PathEntry[] = [
  { path: '/menu/configuracio', label: 'Configuració', moduleLabel: 'Configuració' },
  { path: '/menu/deco', label: 'Deco', moduleLabel: 'Deco' },
]

const PATH_ENTRIES: PathEntry[] = buildPathEntries()

function buildPathEntries(): PathEntry[] {
  const entries: PathEntry[] = [...EXTRA_PATH_ENTRIES]

  for (const mod of MODULES) {
    entries.push({ path: mod.path, label: mod.label, moduleLabel: mod.label })
    for (const sub of mod.submodules ?? []) {
      const subPath = sub.path.split('#')[0]
      entries.push({ path: subPath, label: sub.label, moduleLabel: mod.label })
    }
  }

  return entries.sort((a, b) => b.path.length - a.path.length)
}

function isDynamicSegment(segment: string): boolean {
  if (!segment) return true
  if (/^\d+$/.test(segment)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true
  }
  if (segment.length >= 16 && /^[a-z0-9_-]+$/i.test(segment) && /\d/.test(segment)) {
    return true
  }
  return false
}

function labelForSegment(segment: string): string | null {
  return SEGMENT_LABELS[segment] ?? null
}

function formatTitle(parts: string[]): string {
  const unique = parts.filter((part, index) => part && parts.indexOf(part) === index)
  if (unique.length === 0) return APP_TITLE
  return `${unique.join(' · ')} · ${APP_TITLE}`
}

export function resolvePageTitle(pathname: string, hash = ''): string {
  if (!pathname || pathname === '/') return APP_TITLE
  if (pathname.startsWith('/login')) return formatTitle(['Inici de sessió'])

  const [pathOnly, inlineHash] = pathname.split('#')
  const effectiveHash = hash || inlineHash || ''
  const normalizedPath = pathOnly.replace(/\/$/, '') || '/'

  if (normalizedPath === '/menu') return formatTitle(['Menú'])

  if (effectiveHash === '#consulta-oberta' && normalizedPath.startsWith('/menu/consultes-mcp')) {
    return formatTitle(['Consulta oberta', 'Consultes MCP'])
  }

  const matched = PATH_ENTRIES.find(
    (entry) =>
      normalizedPath === entry.path ||
      normalizedPath.startsWith(`${entry.path}/`)
  )

  if (!matched) {
    const segments = normalizedPath.split('/').filter(Boolean)
    const menuIndex = segments.indexOf('menu')
    const routeSegments = menuIndex >= 0 ? segments.slice(menuIndex + 1) : segments
    const staticLabels = routeSegments
      .filter((segment) => !isDynamicSegment(segment))
      .map((segment) => labelForSegment(segment))
      .filter((label): label is string => Boolean(label))

    if (staticLabels.length === 0) return APP_TITLE
    return formatTitle(staticLabels.slice().reverse())
  }

  const isExactMatch = normalizedPath === matched.path
  const remainder = isExactMatch
    ? ''
    : normalizedPath.slice(matched.path.length + 1)

  const titleParts: string[] = []

  if (!isExactMatch && remainder) {
    const extraLabels = remainder
      .split('/')
      .filter((segment) => !isDynamicSegment(segment))
      .map((segment) => labelForSegment(segment))
      .filter((label): label is string => Boolean(label))

    if (extraLabels.length > 0) {
      titleParts.push(...extraLabels.slice().reverse())
    }
  }

  const isSubmodule = matched.path !== `/menu/${matched.path.split('/')[2]}` && matched.label !== matched.moduleLabel
  const leafLabel = isExactMatch
    ? isSubmodule
      ? matched.label
      : matched.moduleLabel
    : titleParts[0] ?? matched.label

  if (isExactMatch && isSubmodule) {
    return formatTitle([matched.label, matched.moduleLabel])
  }

  if (isExactMatch) {
    return formatTitle([matched.moduleLabel])
  }

  const parts = [leafLabel, matched.moduleLabel]
  if (titleParts.length > 1) {
    parts.unshift(...titleParts.slice(1).reverse())
  }

  return formatTitle(parts)
}
