import { PERM } from '@/lib/permissionKeys'

export const CUINA_CENTRAL_MAINTENANCE_PATH = '/menu/cuina-central/manteniment'
export const CUINA_CENTRAL_MAINTENANCE_TICKETS_PATH =
  '/menu/cuina-central/manteniment/tickets'
export const CUINA_CENTRAL_MAINTENANCE_PLANNER_PATH =
  '/menu/cuina-central/manteniment/planificador'

export const CUINA_CENTRAL_MAINTENANCE_VIEW_PERM = PERM.view(
  CUINA_CENTRAL_MAINTENANCE_PATH
)
export const CUINA_CENTRAL_MAINTENANCE_EDIT_PERM = PERM.edit(
  CUINA_CENTRAL_MAINTENANCE_PATH
)
