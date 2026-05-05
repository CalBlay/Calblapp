export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { processTransportReviewNotifications } from '@/lib/transportReviewNotifications'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')
  const cronSecret = process.env.CRON_SECRET

  if (mode === 'cron' && cronSecret) {
    const incoming =
      req.headers.get('x-cron-secret') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      ''
    if (incoming !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 })
    }
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
