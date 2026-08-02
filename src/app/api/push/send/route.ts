// file: src/app/api/push/send/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { isInternalApiAuthorized } from '@/lib/server/internalApiAuth'
import { sendUserPush } from '@/lib/notifications/sendUserPush.server'

export async function POST(req: Request) {
  try {
    if (!isInternalApiAuthorized(req)) {
      const auth = await requireAuth()
      if (!auth.ok) return auth.res
      const denied = requireRoles(auth, ['admin'])
      if (denied) return denied.res
    }

    const { userId, title, body, url } = await req.json()

    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const result = await sendUserPush({
      userId: String(userId),
      title: String(title),
      body: String(body),
      url: url ? String(url) : undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: 'Push failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, sent: result.sent, skipped: result.skipped })
  } catch (e: unknown) {
    console.error('[push/send]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
