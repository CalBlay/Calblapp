import { MODULES } from '@/lib/accessControl'
import {
  EVENTS_COMANDA_CREATE_PERM,
  EVENTS_COMANDA_PREPARE_PERM,
} from '@/lib/eventComandaPermissions'
import {
  PREPARATION_IMPORT_PERM,
  PREPARATION_UI_PATH,
  PREPARATION_WAREHOUSE_PERMISSION_KEYS,
} from '@/lib/logistics/preparationPermissions'
import { PREPARATION_WAREHOUSE_LABELS } from '@/lib/logistics/preparationWarehouses'
import {
  INCIDENTS_CATEGORY_EDIT_PERM,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_TYPOLOGIES_MANAGE_PERM,
} from '@/lib/incidentsPermissions'
import {
  MAINTENANCE_TICKETS_DELETE_PERM,
  MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
  MAINTENANCE_TICKETS_INBOX_PERM,
  MAINTENANCE_TICKETS_MANAGE_PERM,
  MAINTENANCE_TICKETS_REOPEN_PERM,
  MAINTENANCE_TICKETS_VALIDATE_PERM,
} from '@/lib/maintenanceTicketsPermissions'
import { PERM } from '@/lib/permissionKeys'
import type { MatrixRow } from '@/lib/permissions/types'
import {
  DECO_TICKETS_DELETE_PERM,
  DECO_TICKETS_EXTERNALIZE_PERM,
  DECO_TICKETS_INBOX_PERM,
  DECO_TICKETS_MANAGE_PERM,
  DECO_TICKETS_REOPEN_PERM,
  DECO_TICKETS_VALIDATE_PERM,
} from '@/lib/decoTicketsPermissions'

const compareLabels = (a: string, b: string) =>
  a.localeCompare(b, 'ca', { sensitivity: 'base' })

export function buildMatrixRows(): MatrixRow[] {
  const rows: MatrixRow[] = []
  const sortedModules = [...MODULES].sort((a, b) => compareLabels(a.label, b.label))
  for (const mod of sortedModules) {
    rows.push({
      key: `module:${mod.path}`,
      label: mod.label,
      path: mod.path,
      level: 'module',
    })
    if (Array.isArray(mod.submodules)) {
      const sortedSubs = [...mod.submodules].sort((a, b) => compareLabels(a.label, b.label))
      for (const sub of sortedSubs) {
        rows.push({
          key: `submodule:${sub.path}:${sub.label}`,
          label: sub.label,
          path: sub.path,
          level: 'submodule',
        })
      }
    }
  }
  return rows
}

const MEDIA_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'incidents', label: 'Incidències' },
  { id: 'maintenance', label: 'Manteniment' },
  { id: 'messaging', label: 'Missatgeria' },
  { id: 'audits', label: 'Auditories' },
  { id: 'spaces', label: 'Espais' },
  { id: 'events', label: 'Esdeveniments (visites)' },
]

export type PermissionActionGroup = {
  id: string
  title: string
  subtitle?: string
  visibleWhen: { path: string }
  /** Si és cert, el grup es mostra només amb permís de veure (sense editar). */
  requireViewOnly?: boolean
  actions: Array<{ key: string; label: string }>
}

export const PERMISSION_ACTION_GROUPS: PermissionActionGroup[] = [
  {
    id: 'mediaSources',
    title: 'Imatges · Fonts',
    subtitle: 'Tria quines fonts pot veure (filtre i resultats).',
    visibleWhen: { path: '/menu/media' },
    actions: MEDIA_SOURCES.map((s) => ({
      key: PERM.action('/menu/media', `source:${s.id}`),
      label: s.label,
    })),
  },
  {
    id: 'mediaDelete',
    title: 'Imatges · Accions',
    subtitle: 'Accions amb impacte (eliminar fitxers i referències).',
    visibleWhen: { path: '/menu/media' },
    actions: [{ key: PERM.action('/menu/media', 'delete'), label: 'Eliminar imatges' }],
  },
  {
    id: 'allergensBbddActions',
    title: 'Al·lèrgens · BBDD plats · Accions',
    subtitle: 'Botons especials dins de BBDD plats.',
    visibleWhen: { path: '/menu/allergens/bbdd' },
    actions: [
      { key: PERM.action('/menu/allergens/bbdd', 'import'), label: 'Importar' },
      { key: PERM.action('/menu/allergens/bbdd', 'replace'), label: 'Reemplaçar' },
      { key: PERM.action('/menu/allergens/bbdd', 'export'), label: 'Exportar' },
    ],
  },
  {
    id: 'calendarActions',
    title: 'Calendar · Accions',
    subtitle: 'Accions de calendari (esdeveniments manuals i documents).',
    visibleWhen: { path: '/menu/calendar' },
    actions: [
      { key: PERM.action('/menu/calendar', 'manual:create'), label: 'Crear esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'manual:update'), label: 'Editar esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'manual:delete'), label: 'Eliminar esdeveniment manual' },
      { key: PERM.action('/menu/calendar', 'attach:sharepoint'), label: 'Adjuntar documents (SharePoint)' },
      { key: PERM.action('/menu/calendar', 'email:send-documents'), label: 'Enviar documents per correu' },
      { key: PERM.action('/menu/calendar', 'mail-groups:manage'), label: 'Gestionar grups d’enviament' },
      { key: PERM.action('/menu/calendar', 'sync:zoho'), label: 'Sync Zoho' },
      { key: PERM.action('/menu/calendar', 'sync:ada'), label: 'Sync Ada' },
    ],
  },
  {
    id: 'eventsActions',
    title: 'Esdeveniments · Accions',
    subtitle:
      'Accions de gestió amb impacte. Vídeo visita: marcar allow per usuari (comercial, caps d’àrea comercial…).',
    visibleWhen: { path: '/menu/events' },
    actions: [
      { key: PERM.action('/menu/events', 'docs:view'), label: 'Veure documents' },
      { key: PERM.action('/menu/events', 'docs:attach:kitchen'), label: 'Adjuntar documents de cuina' },
      {
        key: PERM.action('/menu/events', 'docs:attach:visit-video'),
        label: 'Adjuntar vídeo visita comercial',
      },
      { key: PERM.action('/menu/events', 'modifications:register'), label: 'Registrar modificacions' },
      { key: PERM.action('/menu/events', 'event:close'), label: 'Tancar esdeveniment' },
    ],
  },
  {
    id: 'eventsComanda',
    title: 'Esdeveniments · Comanda',
    subtitle:
      'Crear comandes (plantilla i enviament) i/o preparar material al magatzem assignat. Es poden combinar tots dos permisos.',
    visibleWhen: { path: '/menu/events' },
    requireViewOnly: true,
    actions: [
      {
        key: EVENTS_COMANDA_CREATE_PERM,
        label: 'Crear i enviar comandes',
      },
      {
        key: EVENTS_COMANDA_PREPARE_PERM,
        label: 'Preparar comandes (magatzem assignat)',
      },
    ],
  },
  {
    id: 'logisticsPreparationActions',
    title: 'Logística · Preparació · Accions',
    subtitle: 'Controla la importació de serveis des d’Excel dins del llistat de preparació.',
    visibleWhen: { path: PREPARATION_UI_PATH },
    requireViewOnly: true,
    actions: [{ key: PREPARATION_IMPORT_PERM, label: 'Importar serveis des d’Excel' }],
  },
  {
    id: 'logisticsPreparationWarehouses',
    title: 'Logística · Preparació · Magatzems',
    subtitle:
      'Assigna un o més magatzems (Bodega, Parament, Material) per marcar preparacions com a fetes.',
    visibleWhen: { path: PREPARATION_UI_PATH },
    requireViewOnly: true,
    actions: PREPARATION_WAREHOUSE_PERMISSION_KEYS.map((key) => {
      const warehouse = key.split(':').pop() || ''
      const label =
        PREPARATION_WAREHOUSE_LABELS[
          warehouse as keyof typeof PREPARATION_WAREHOUSE_LABELS
        ] || warehouse
      return { key, label }
    }),
  },
  {
    id: 'reservaComercialsActions',
    title: 'Reserva comercials · Accions',
    subtitle:
      'Per defecte: Sol·licitud si pot veure el submòdul; Validació només admin i cap de transports. Marca/desmarca per override.',
    visibleWhen: { path: '/menu/logistica/reserva-comercials' },
    actions: [
      {
        key: PERM.action('/menu/logistica/reserva-comercials', 'request'),
        label: 'Sol·licitud (crear i anul·lar pròpies)',
      },
      {
        key: PERM.action('/menu/logistica/reserva-comercials', 'validate'),
        label: 'Validació (aprovar / rebutjar)',
      },
      {
        key: PERM.action('/menu/logistica/reserva-comercials', 'keys'),
        label: 'Lliurament de claus (vista diària)',
      },
    ],
  },
  {
    id: 'quadrantsActions',
    title: 'Quadrants · Accions',
    subtitle:
      'Accions especials dins del mòdul Quadrants. «Premisses» permet el botó i editar la configuració.',
    visibleWhen: { path: '/menu/quadrants' },
    actions: [
      {
        key: PERM.action('/menu/quadrants', 'premisses:edit'),
        label: 'Premisses (configuració)',
      },
      { key: PERM.action('/menu/quadrants', 'save'), label: 'Desar quadrant' },
      { key: PERM.action('/menu/quadrants', 'confirm'), label: 'Confirmar quadrant' },
      { key: PERM.action('/menu/quadrants', 'draft:save'), label: 'Esborranys · desar' },
      { key: PERM.action('/menu/quadrants', 'draft:confirm'), label: 'Esborranys · confirmar' },
      { key: PERM.action('/menu/quadrants', 'draft:unconfirm'), label: 'Esborranys · desconfirmar' },
      { key: PERM.action('/menu/quadrants', 'draft:delete'), label: 'Esborranys · eliminar' },
    ],
  },
  {
    id: 'maintenanceTicketsActions',
    title: 'Manteniment · Tickets',
    subtitle:
      'Safata d\'entrada i avisos (campaneta). Per defecte actiu per usuaris de logística; denega o assigna allow a altres.',
    visibleWhen: { path: '/menu/manteniment/tickets' },
    actions: [
      {
        key: MAINTENANCE_TICKETS_INBOX_PERM,
        label: 'Gestionar safata de tickets (avisos nous)',
      },
      {
        key: MAINTENANCE_TICKETS_MANAGE_PERM,
        label: 'Gestionar tickets',
      },
      {
        key: MAINTENANCE_TICKETS_VALIDATE_PERM,
        label: 'Validar tickets',
      },
      {
        key: MAINTENANCE_TICKETS_REOPEN_PERM,
        label: 'Reobrir tickets validats',
      },
      {
        key: MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
        label: 'Externalitzar tickets',
      },
      {
        key: MAINTENANCE_TICKETS_DELETE_PERM,
        label: 'Eliminar tickets',
      },
    ],
  },
  {
    id: 'decoTicketsActions',
    title: 'Imatge-Deco · Tickets',
    subtitle: 'Mateixos permisos de safata, planificació i resolució que al mòdul de Manteniment.',
    visibleWhen: { path: '/menu/deco/tickets' },
    actions: [
      { key: DECO_TICKETS_INBOX_PERM, label: 'Gestionar safata de tickets (avisos nous)' },
      { key: DECO_TICKETS_MANAGE_PERM, label: 'Gestionar i planificar tickets' },
      { key: DECO_TICKETS_VALIDATE_PERM, label: 'Validar tickets' },
      { key: DECO_TICKETS_REOPEN_PERM, label: 'Reobrir tickets validats' },
      { key: DECO_TICKETS_EXTERNALIZE_PERM, label: 'Externalitzar tickets' },
      { key: DECO_TICKETS_DELETE_PERM, label: 'Eliminar tickets' },
    ],
  },
  {
    id: 'incidentsActions',
    title: 'Incidències · Accions',
    subtitle:
      'Cal marcar explícitament per usuari (opt-in). Requereix veure/editar incidències; treballadors producció: només quadre amb allow.',
    visibleWhen: { path: '/menu/incidents' },
    actions: [
      {
        key: INCIDENTS_COMMAND_BOARD_PERM,
        label: 'Quadre de comandament',
      },
      {
        key: INCIDENTS_MEETING_MINUTES_PERM,
        label: 'Acta reunió',
      },
      {
        key: INCIDENTS_CATEGORY_EDIT_PERM,
        label: 'Editar categoria incidència',
      },
      {
        key: INCIDENTS_TYPOLOGIES_MANAGE_PERM,
        label: 'Gestionar tipologies',
      },
    ],
  },
  {
    id: 'spacesBbddActions',
    title: 'Espais · Consulta BBDD · Accions',
    subtitle:
      'Opcional: restringeix export o CRUD dins del submòdul Consulta BBDD.',
    visibleWhen: { path: '/menu/spaces/info' },
    actions: [
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:export'),
        label: 'Exportar (Excel / PDF)',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:create'),
        label: 'Crear espai',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:update'),
        label: 'Editar espai (i pujar fotos/vídeos)',
      },
      {
        key: PERM.action('/menu/spaces/info', 'bbdd:delete'),
        label: 'Eliminar espai',
      },
    ],
  },
]

export const shouldShowActionGroup = (
  viewAllowed: boolean,
  editAllowed: boolean,
  requireViewOnly?: boolean
): boolean => (requireViewOnly ? viewAllowed : viewAllowed && editAllowed)

export const actionGroupDefaultExpanded = (
  viewAllowed: boolean,
  editAllowed: boolean,
  requireViewOnly?: boolean
): boolean => shouldShowActionGroup(viewAllowed, editAllowed, requireViewOnly)
