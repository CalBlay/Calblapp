import { NextResponse } from 'next/server'
import type { AccessUser } from '@/lib/accessControl'
import {
  REPORTS_DOMAIN_PERMISSIONS,
  type ReportsPermissionDomain,
} from '@/lib/informes/permissions'
import { isUiPermissionGranted } from '@/lib/server/permissions'

export function canViewReportsDomain(
  user: AccessUser & { id: string },
  domain: ReportsPermissionDomain
) {
  return isUiPermissionGranted({
    user,
    permission: REPORTS_DOMAIN_PERMISSIONS[domain],
  })
}

export function reportsDomainForbiddenResponse() {
  return NextResponse.json({ error: 'No tens permís per veure aquest informe.' }, { status: 403 })
}
