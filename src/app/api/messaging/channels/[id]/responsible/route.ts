import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

type SessionUser = { id: string; role?: string }
type ChannelMemberRecord = Record<string, unknown> & { userName?: string }

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (role !== 'admin' && role !== 'direccio') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json()) as { userId?: string }
  const targetUserId = (body?.userId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  try {
    const memberSnap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .where('userId', '==', targetUserId)
      .limit(1)
      .get()

    if (memberSnap.empty) {
      return NextResponse.json({ error: 'User not in channel' }, { status: 400 })
    }

    const member = memberSnap.docs[0].data() as ChannelMemberRecord
    const responsibleUserName = member.userName || ''

    await db.collection('channels').doc(id).set(
      {
        responsibleUserId: targetUserId,
        responsibleUserName,
        responsibleUpdatedAt: Date.now(),
        responsibleUpdatedBy: user.id,
      },
      { merge: true }
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
