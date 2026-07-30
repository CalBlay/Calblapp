import { NextResponse } from 'next/server'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'

export const MAINTENANCE_TICKETS_PATH = '/menu/manteniment/tickets'

const MAINTENANCE_TICKET_API_VIEW_PATHS = [
  MAINTENANCE_TICKETS_PATH,
  '/menu/manteniment/preventius',
  '/menu/manteniment/preventius/fulls',
  '/menu/manteniment/dades',
  '/menu/manteniment/seguiment',
] as const

export async function canUseMaintenanceTicketApi(
  user: AuthSuccess['user'],
  paths: readonly string[] = MAINTENANCE_TICKET_API_VIEW_PATHS
): Promise<boolean> {
  const checks = await Promise.all(paths.map((path) => canViewUiPath({ user, path })))
  return checks.some(Boolean)
}

export async function requireMaintenanceTicketApiView(
  paths: readonly string[] = MAINTENANCE_TICKET_API_VIEW_PATHS
): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  if (!(await canUseMaintenanceTicketApi(auth.user, paths))) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return auth
}

export async function requireMaintenanceTicketApiEdit(
  path: string = MAINTENANCE_TICKETS_PATH
): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const allowed = await canEditUiPath({ user: auth.user, path })
  if (!allowed) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return auth
}

/** Accés a dades mestres de manteniment (màquines, proveïdors, centres). */
export async function requireMaintenanceDataAccess(
  mode: 'view' | 'edit' = 'view'
): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const allowed =
    mode === 'edit'
      ? await canEditUiPath({ user: auth.user, path: '/menu/manteniment/dades' })
      : await canViewUiPath({ user: auth.user, path: '/menu/manteniment/dades' })

  if (!allowed) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}
