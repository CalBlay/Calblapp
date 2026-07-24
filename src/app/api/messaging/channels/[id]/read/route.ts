import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

type SessionUser = {
  id: string
  role?: string
}

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const { id } = await ctx.params

  try {
    const snap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .where('userId', '==', userId)
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await snap.docs[0].ref.set(
      {
        unreadCount: 0,
        directUnreadCount: 0,
        channelUnreadCount: 0,
        projectMissedActivityPending: false,
        projectMissedActivityLastReadAt: Date.now(),
      },
      { merge: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
