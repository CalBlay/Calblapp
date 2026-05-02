import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { respondQuadrantSurvey } from '@/lib/quadrantSurveys'
import { jwtUserId, jwtUserName } from '@/lib/appJwtPayload'

export const runtime = 'nodejs'

async function getSessionContext(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return null

  return {
    userId: jwtUserId(token),
    userName: jwtUserName(token),
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionContext(req)
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await ctx.params
    const body = await req.json()
    const response = String(body?.response || '').trim()
    if (!['yes', 'no', 'maybe'].includes(response)) {
      return NextResponse.json({ error: 'Invalid response' }, { status: 400 })
    }

    await respondQuadrantSurvey({
      surveyId: id,
      userId: session.userId,
      userName: session.userName || 'Usuari',
      response: response as 'yes' | 'no' | 'maybe',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[quadrants/surveys/respond] POST error', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 })
  }
}
