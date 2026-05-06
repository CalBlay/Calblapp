// file: src/app/api/sync/ada-to-firestore/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { syncAdaEventsToFirestore } from '@/services/sync/adaSync'

export const runtime = 'nodejs'

type SessionUser = {
  department?: string
}

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

    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as SessionUser | undefined
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const role = normalize(String(session?.user?.role || ''))
    const department = normalize(String(sessionUser?.department || ''))
    const canManualSync =
      role === 'admin' || (role.includes('cap') && department === 'produccio')

    if (!canManualSync) {
      return NextResponse.json(
        { error: 'Acces denegat: nomes admin o cap produccio pot sincronitzar manualment.' },
        { status: 403 }
      )
    }

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
