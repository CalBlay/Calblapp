import { PERM } from '@/lib/permissionKeys'

export const TRANSPORTS_UI_PATH = '/menu/logistica/transports'

export const TRANSPORTS_ACTION = {
  TYPES_MANAGE: 'types-manage',
} as const

export const TRANSPORTS_TYPES_MANAGE_PERM = PERM.action(
  TRANSPORTS_UI_PATH,
  TRANSPORTS_ACTION.TYPES_MANAGE
)
