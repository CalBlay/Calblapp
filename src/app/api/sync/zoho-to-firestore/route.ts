// filename: src/app/api/sync/zoho-to-firestore/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { syncZohoDealsToFirestore } from '@/services/zoho/sync'

export const runtime = 'nodejs'

type SessionUser = {
  department?: string
}

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

    // Si no es cron, es manual: validar permisos
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

