import { NextResponse } from 'next/server'
import {
  processStaleExternalizedTicketNotifications,
  processStaleMaintenanceTicketNotifications,
} from '@/lib/maintenanceNotifications'
import { requireCronAuth } from '@/lib/server/internalApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')

  if (mode !== 'cron') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cronDenied = requireCronAuth(req)
  if (cronDenied) return cronDenied

  try {
    const [inboxPlanner, externalized] = await Promise.all([
      processStaleMaintenanceTicketNotifications(),
      processStaleExternalizedTicketNotifications(),
    ])
    return NextResponse.json({
      ok: true,
      mode: 'cron',
      inboxPlanner,
      externalized,
      timestamp: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[maintenance/tickets/stale-alerts] failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
