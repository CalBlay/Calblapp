import { PERM } from '@/lib/permissionKeys'

export const EVENTS_UI_PATH = '/menu/events'

export const EVENTS_COMANDA_ACTION = {
  CREATE: 'comanda:create',
  PREPARE: 'comanda:prepare',
  /** Compatibilitat amb assignacions antigues (equivalent a comanda:prepare). */
  WAREHOUSE_ONLY: 'warehouse:comanda-only',
} as const

export const EVENTS_COMANDA_CREATE_PERM = PERM.action(
  EVENTS_UI_PATH,
  EVENTS_COMANDA_ACTION.CREATE
)

export const EVENTS_COMANDA_PREPARE_PERM = PERM.action(
  EVENTS_UI_PATH,
  EVENTS_COMANDA_ACTION.PREPARE
)

/** @deprecated Usa EVENTS_COMANDA_PREPARE_PERM */
export const EVENTS_WAREHOUSE_COMANDA_ONLY_PERM = PERM.action(
  EVENTS_UI_PATH,
  EVENTS_COMANDA_ACTION.WAREHOUSE_ONLY
)

export const EVENT_COMANDA_PERMISSION_KEYS = [
  EVENTS_COMANDA_CREATE_PERM,
  EVENTS_COMANDA_PREPARE_PERM,
  EVENTS_WAREHOUSE_COMANDA_ONLY_PERM,
] as const

/** Accés base per aplicar un allow explícit (Settings → permisos). */
export function eventsWarehouseComandaActionBaseAccess(opts: {
  canViewEvents: boolean
}): boolean {
  return opts.canViewEvents
}

export function hasEventComandaPrepareAction(hasAction: (key: string) => boolean): boolean {
  return (
    hasAction(EVENTS_COMANDA_PREPARE_PERM) || hasAction(EVENTS_WAREHOUSE_COMANDA_ONLY_PERM)
  )
}

/** Pot crear/importar plantilla i enviar comandes. */
export function canCreateEventComanda(opts: {
  hasCreateComandaAction: boolean
  isAdminOrDireccio: boolean
  canEditEvents: boolean
}): boolean {
  if (opts.isAdminOrDireccio) return true
  if (opts.hasCreateComandaAction) return true
  if (opts.canEditEvents) return true
  return false
}

/** Pot veure llistes de preparació del magatzem assignat. */
export function canPrepareEventComanda(opts: {
  hasPrepareComandaAction: boolean
  isAdminOrDireccio: boolean
}): boolean {
  if (opts.isAdminOrDireccio) return true
  return opts.hasPrepareComandaAction
}

/**
 * Vista restringida de preparació: només magatzem, sense flux de creació.
 * Qui té crear + preparar veu la UI completa de demanar i, en enviar, tots els magatzems.
 */
export function isEventsComandaPreparerOnlyView(opts: {
  hasPrepareComandaAction: boolean
  hasCreateComandaAction: boolean
  isAdminOrDireccio: boolean
  canEditEvents: boolean
}): boolean {
  if (
    !canPrepareEventComanda({
      hasPrepareComandaAction: opts.hasPrepareComandaAction,
      isAdminOrDireccio: opts.isAdminOrDireccio,
    })
  ) {
    return false
  }
  if (opts.isAdminOrDireccio) return false
  return !canCreateEventComanda(opts)
}

/** @deprecated Usa isEventsComandaPreparerOnlyView */
export function isEventsWarehouseComandaRestrictedView(opts: {
  hasWarehouseComandaAction: boolean
  isAdminOrDireccio: boolean
  canEditEvents: boolean
}): boolean {
  return isEventsComandaPreparerOnlyView({
    hasPrepareComandaAction: opts.hasWarehouseComandaAction,
    hasCreateComandaAction: false,
    isAdminOrDireccio: opts.isAdminOrDireccio,
    canEditEvents: opts.canEditEvents,
  })
}
