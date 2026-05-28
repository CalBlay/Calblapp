// filename: src/app/api/sync/zoho-to-firestore/route.ts
import { NextResponse } from 'next/server'
import { syncZohoDealsToFirestore } from '@/services/zoho/sync'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { isAllowedByClientOverride } from '@/lib/server/permissions'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode')

    // Si es cron, saltem auth completament
    if (mode === 'cron') {
      const result = await syncZohoDealsToFirestore()
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
      permission: PERM.action('/menu/calendar', 'sync:zoho'),
    })
    if (ok !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result = await syncZohoDealsToFirestore()

    return NextResponse.json({
      ok: true,
      mode: 'manual',
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error a /api/sync/zoho-to-firestore:', error)
    return NextResponse.json(
      { error: 'Error durant la sincronitzacio Zoho a Firestore' },
      { status: 500 }
    )
  }
}

