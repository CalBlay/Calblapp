import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { normalizeRole } from '@/lib/roles'
import { type capabilityOp } from 'ably'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasAblyApiKey()) {
    return NextResponse.json(
      { error: 'Missing ABLY_API_KEY' },
      { status: 500 }
    )
  }

  const clientId = String(session.user.id)
  const role = normalizeRole(session.user.role)

  const capability: Record<string, capabilityOp[]> = {
    [`user:${clientId}:notifications`]: ['subscribe', 'history'],
    [`user:${clientId}:inbox`]: ['subscribe', 'history'],
    'chat:*': ['subscribe', 'publish', 'presence'],
  }
  if (role === 'admin') {
    capability['admin:user-requests'] = ['subscribe', 'history']
  }

  const rest = getAblyRest()
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId,
    capability,
  })

  return NextResponse.json(tokenRequest)
}
