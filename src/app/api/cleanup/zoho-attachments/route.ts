import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { cleanupZohoAttachmentsForStageVerd } from '@/services/zoho/cleanup'
import { requireCronAuth } from '@/lib/server/internalApiAuth'

export const runtime = 'nodejs'

type SessionUser = {
  department?: string
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode')
    if (mode === 'cron') {
      const cronDenied = requireCronAuth(req)
      if (cronDenied) return cronDenied
    } else {
      const session = await getServerSession(authOptions)
      const sessionUser = session?.user as SessionUser | undefined
      const role = normalize(String(session?.user?.role || ''))
      const department = normalize(String(sessionUser?.department || ''))
      const canRunManual =
        role === 'admin' || (role.includes('cap') && department === 'produccio')

      if (!canRunManual) {
        return NextResponse.json(
          {
            error:
              'Acces denegat: nomes admin o cap produccio pot executar la neteja manualment.',
          },
          { status: 403 }
        )
      }
    }

    const result = await cleanupZohoAttachmentsForStageVerd(30)
    return NextResponse.json({
      ok: true,
      mode: mode === 'cron' ? 'cron' : 'manual',
      retentionDays: 30,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error a /api/cleanup/zoho-attachments:', error)
    return NextResponse.json(
      { error: 'Error durant la neteja d adjunts Zoho' },
      { status: 500 }
    )
  }
}
