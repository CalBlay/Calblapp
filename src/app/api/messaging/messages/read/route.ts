import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

type SessionUser = { id: string }
type MessageRecord = Record<string, unknown> & { readCount?: number }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const userId = user.id

  try {
    const body = (await req.json()) as { messageIds?: string[] }
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.map(String).filter(Boolean)
      : []

    if (messageIds.length === 0) {
      return NextResponse.json({ success: true })
    }

    const now = Date.now()
    for (const messageId of messageIds) {
      const readRef = db.collection('messageReads').doc(`${messageId}_${userId}`)
      const msgRef = db.collection('messages').doc(messageId)

      await db.runTransaction(async (tx) => {
        const [readSnap, msgSnap] = await Promise.all([
          tx.get(readRef),
          tx.get(msgRef),
        ])
        if (readSnap.exists) return
        if (!msgSnap.exists) return
        const current = (msgSnap.data() as MessageRecord)?.readCount || 0
        tx.set(readRef, { messageId, userId, readAt: now }, { merge: true })
        tx.set(msgRef, { readCount: current + 1 }, { merge: true })
      })
    }
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
