import { PERM } from '@/lib/permissionKeys'
import type { InformesDomainId } from './types'

export const REPORTS_UI_PATH = '/menu/reports'

export const REPORTS_DOMAIN_ACTION = {
  rrhh: 'tab:rrhh',
  transports: 'tab:transports',
  maintenance: 'tab:maintenance',
  events: 'tab:events',
} as const

export type ReportsPermissionDomain = keyof typeof REPORTS_DOMAIN_ACTION

export const REPORTS_DOMAIN_PERMISSIONS: Record<ReportsPermissionDomain, string> = {
  rrhh: PERM.action(REPORTS_UI_PATH, REPORTS_DOMAIN_ACTION.rrhh),
  transports: PERM.action(REPORTS_UI_PATH, REPORTS_DOMAIN_ACTION.transports),
  maintenance: PERM.action(REPORTS_UI_PATH, REPORTS_DOMAIN_ACTION.maintenance),
  events: PERM.action(REPORTS_UI_PATH, REPORTS_DOMAIN_ACTION.events),
}

export function reportsDomainPermission(domain: InformesDomainId): string | null {
  return domain in REPORTS_DOMAIN_PERMISSIONS
    ? REPORTS_DOMAIN_PERMISSIONS[domain as ReportsPermissionDomain]
    : null
}
