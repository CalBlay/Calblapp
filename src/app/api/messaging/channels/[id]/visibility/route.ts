import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

type SessionUser = { id: string; role?: string }

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id
  const role = normalizeRole(user.role || '')
  if (role !== 'admin' && role !== 'direccio') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json()) as { hidden?: boolean }
  const hidden = Boolean(body.hidden)

  try {
    const snap = await db
      .collection('channelMembers')
      .where('channelId', '==', id)
      .where('userId', '==', userId)
      .limit(1)
      .get()
    if (snap.empty) {
      return NextResponse.json({ error: 'Not member' }, { status: 404 })
    }

    const doc = snap.docs[0]
    await doc.ref.set(
      {
        hidden,
        notify: !hidden,
        muted: hidden ? true : false,
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    return NextResponse.json({ success: true, hidden })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
