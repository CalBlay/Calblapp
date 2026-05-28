// file: src/app/api/sync/ada-to-firestore/route.ts
import { NextResponse } from 'next/server'
import { syncAdaEventsToFirestore } from '@/services/sync/adaSync'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { isAllowedByClientOverride } from '@/lib/server/permissions'

export const runtime = 'nodejs'

const isIsoDate = (value: string | null) =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode')
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    const startDate = isIsoDate(start) ? start! : undefined
    const endDate = isIsoDate(end) ? end! : undefined

    if (mode === 'cron') {
      const result = await syncAdaEventsToFirestore({ startDate, endDate })
      return NextResponse.json({
        ok: true,
        mode: 'cron',
        ...result,
        timestamp: new Date().toISOString(),
      })
    }

    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const ok = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/calendar', 'sync:ada'),
    })
    if (ok !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result = await syncAdaEventsToFirestore({ startDate, endDate })

    return NextResponse.json({
      ok: true,
      mode: 'manual',
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error a /api/sync/ada-to-firestore:', error)
    return NextResponse.json(
      { error: 'Error durant la sincronitzacio ADA a Firestore' },
      { status: 500 }
    )
  }
}
