import { NextResponse } from 'next/server'

export function validateCronSecretRequest(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  }

  const incoming =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''

  if (incoming !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 })
  }

  return null
}
