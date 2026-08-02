export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { processTransportReviewNotifications } from '@/lib/transportReviewNotifications'
import { requireCronAuth } from '@/lib/server/internalApiAuth'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')
  if (mode === 'cron') {
    const cronDenied = requireCronAuth(req)
    if (cronDenied) return cronDenied
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processTransportReviewNotifications(url.origin)
    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('[transport review alerts]', error)
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
