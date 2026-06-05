import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const eventCode = searchParams.get('eventCode')
  const code = searchParams.get('code') || eventCode

  if (!code) {
    return NextResponse.json({ hasAvisos: false })
  }

  const snap = await db.collection('avisos').where('code', '==', code).limit(1).get()

  return NextResponse.json({
    hasAvisos: !snap.empty,
  })
}
