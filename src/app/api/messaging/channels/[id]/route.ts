import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = { id: string; role?: string }
type ChannelRecord = Record<string, unknown>

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const { id } = await ctx.params

  const channelSnap = await db.collection('channels').doc(id).get()
  if (!channelSnap.exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (role !== 'admin' && role !== 'direccio') {
    const memberSnap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .where('userId', '==', user.id)
      .limit(1)
      .get()
    if (memberSnap.empty) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.json({ channel: { id: channelSnap.id, ...(channelSnap.data() as ChannelRecord) } })
}
