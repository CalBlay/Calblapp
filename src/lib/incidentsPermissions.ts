import { PERM } from '@/lib/permissionKeys'

export const INCIDENTS_UI_PATH = '/menu/incidents'
export const INCIDENTS_QUADRE_PATH = '/menu/incidents/quadre'

export const INCIDENTS_ACTION = {
  MEETING_MINUTES: 'meeting-minutes',
} as const

export const INCIDENTS_MEETING_MINUTES_PERM = PERM.action(
  INCIDENTS_UI_PATH,
  INCIDENTS_ACTION.MEETING_MINUTES
)
