import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { listUserQuadrantSurveys } from '@/lib/quadrantSurveys'
import { jwtUserId, readAppJwt } from '@/lib/appJwtPayload'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const t = readAppJwt(token)
    const userId = jwtUserId(t)
    const canRespondSurveys = Boolean(t.canRespondSurveys)
    const role = String(t.role || '').trim()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canRespondSurveys && !['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const surveys = await listUserQuadrantSurveys(userId)
    return NextResponse.json({ surveys })
  } catch (error) {
    console.error('[quadrants/surveys/mine] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
