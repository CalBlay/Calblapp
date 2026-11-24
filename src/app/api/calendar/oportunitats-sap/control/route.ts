import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { isAllowedByClientOverride } from '@/lib/server/permissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import {
  getOportunitatsSapControl,
  setOportunitatsSapEnabled,
} from '@/lib/calendar/oportunitatsSapControl.server'

export const runtime = 'nodejs'

async function requireOportunitatsPerm() {
  const auth = await requireAuth()
  if (!auth.ok) return { ok: false as const, res: auth.res }
  const allowed = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: CALENDAR_PERM.syncOportunitatsSap,
  })
  if (allowed !== true) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true as const, user: auth.user }
}

export async function GET() {
  try {
    const gate = await requireOportunitatsPerm()
    if (!gate.ok) return gate.res
    const control = await getOportunitatsSapControl()
    return NextResponse.json({ ok: true, control })
  } catch (error) {
    console.error('[oportunitats-sap/control GET]', error)
    return NextResponse.json({ error: 'Error llegint control' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireOportunitatsPerm()
    if (!gate.ok) return gate.res
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Cal { enabled: true|false }' },
        { status: 400 }
      )
    }
    const control = await setOportunitatsSapEnabled({
      enabled: body.enabled,
      userEmail: String(gate.user.email || gate.user.id || ''),
    })
    return NextResponse.json({ ok: true, control })
  } catch (error) {
    console.error('[oportunitats-sap/control PATCH]', error)
    return NextResponse.json(
      { error: 'Error actualitzant control' },
      { status: 500 }
    )
  }
}
