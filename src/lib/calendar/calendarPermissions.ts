import { PERM } from '@/lib/permissionKeys'

export const CALENDAR_UI_PATH = '/menu/calendar'
export const CALENDAR_MAIL_GROUPS_PATH = '/menu/calendar/grups-enviament'

export const CALENDAR_ACTION = {
  deleteDocuments: 'documents:delete',
  sendDocuments: 'email:send-documents',
  manageMailGroups: 'mail-groups:manage',
} as const

export const CALENDAR_PERM = {
  deleteDocuments: PERM.action(CALENDAR_UI_PATH, CALENDAR_ACTION.deleteDocuments),
  sendDocuments: PERM.action(CALENDAR_UI_PATH, CALENDAR_ACTION.sendDocuments),
  manageMailGroups: PERM.action(CALENDAR_UI_PATH, CALENDAR_ACTION.manageMailGroups),
} as const
