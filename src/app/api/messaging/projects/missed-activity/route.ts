import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { sendProjectMissedActivityEmail } from '@/services/graph/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  role?: string
}

type ChannelMemberData = {
  channelId?: string
  userId?: string
  userName?: string
  hidden?: boolean
  muted?: boolean
  notify?: boolean
  unreadCount?: number
  projectMissedActivityPending?: boolean
  projectMissedActivityWindowStartedAt?: number
  projectMissedActivityDueAt?: number
  projectMissedActivityLastMessageAt?: number
}

async function authorize(req: Request) {
  const url = new URL(req.url)
  const mode = String(url.searchParams.get('mode') || '').toLowerCase()
  const cronSecret = process.env.CRON_SECRET

  if (mode === 'cron') {
    if (cronSecret) {
      const authorizationHeader = req.headers.get('authorization') || ''
      const incoming =
        (authorizationHeader.startsWith('Bearer ')
          ? authorizationHeader.slice('Bearer '.length).trim()
          : '') ||
        req.headers.get('x-cron-secret') ||
        url.searchParams.get('secret') ||
        ''
      if (incoming !== cronSecret) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    return null
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

function resolveSenderEmail(channel: Record<string, unknown>, responsibleUser: Record<string, unknown> | null) {
  const explicit =
    String(process.env.PROJECTS_NOTIFICATIONS_EMAIL || '').trim() ||
    String(process.env.NOTIFICATIONS_EMAIL || '').trim()
  if (explicit) return explicit

  const responsibleEmail = String(responsibleUser?.email || '').trim()
  if (responsibleEmail) return responsibleEmail

  const channelEmail = String(channel.responsibleUserEmail || '').trim()
  if (channelEmail) return channelEmail

  return 'it@calblay.com'
}

export async function GET(req: Request) {
  const authError = await authorize(req)
  if (authError) return authError

  const now = Date.now()
  const dueSnap = await db
    .collection('channelMembers')
    .where('projectMissedActivityPending', '==', true)
    .get()

  let processed = 0
  let sent = 0
  let cleared = 0
  let failed = 0

  for (const doc of dueSnap.docs) {
    const member = doc.data() as ChannelMemberData
    if (Number(member.projectMissedActivityDueAt || 0) > now) continue
    processed += 1
    const channelId = String(member.channelId || '').trim()
    const userId = String(member.userId || '').trim()
    const windowStartedAt = Number(member.projectMissedActivityWindowStartedAt || 0)

    if (!channelId || !userId || !windowStartedAt) {
      await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
      cleared += 1
      continue
    }

    if (member.hidden || member.notify === false || member.muted || Number(member.unreadCount || 0) <= 0) {
      await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
      cleared += 1
      continue
    }

    try {
      const [channelSnap, userSnap] = await Promise.all([
        db.collection('channels').doc(channelId).get(),
        db.collection('users').doc(userId).get(),
      ])

      if (!channelSnap.exists || !userSnap.exists) {
        await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
        cleared += 1
        continue
      }

      const channel = channelSnap.data() as Record<string, unknown>
      if (String(channel.source || '').toLowerCase() !== 'projects') {
        await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
        cleared += 1
        continue
      }

      const userData = userSnap.data() as Record<string, unknown>
      const recipientEmail = String(userData.email || '').trim()
      if (!recipientEmail) {
        await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
        cleared += 1
        continue
      }

      const responsibleUserId = String(channel.responsibleUserId || '').trim()
      const responsibleUserSnap = responsibleUserId
        ? await db.collection('users').doc(responsibleUserId).get()
        : null
      const responsibleUser = responsibleUserSnap?.exists
        ? (responsibleUserSnap.data() as Record<string, unknown>)
        : null

      const messagesSnap = await db
        .collection('messages')
        .where('channelId', '==', channelId)
        .where('createdAt', '>=', windowStartedAt)
        .get()

      const summaryMessages = messagesSnap.docs
        .map((messageDoc) => messageDoc.data() as Record<string, unknown>)
        .filter((message) => String(message.visibility || 'channel') === 'channel')
        .filter((message) => String(message.senderId || '') !== userId)
        .map((message) => ({
          senderName: String(message.senderName || '').trim(),
          body: String(message.body || '').trim(),
          createdAt: Number(message.createdAt || 0),
        }))
        .filter((message) => message.body || message.createdAt)
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(0, 20)

      if (!summaryMessages.length) {
        await doc.ref.set({ projectMissedActivityPending: false }, { merge: true })
        cleared += 1
        continue
      }

      const origin = new URL(req.url).origin
      await sendProjectMissedActivityEmail({
        senderEmail: resolveSenderEmail(channel, responsibleUser),
        recipient: {
          email: recipientEmail,
          name: String(userData.name || member.userName || '').trim(),
        },
        channelName: String(channel.name || channel.roomName || 'Canal de projecte').trim(),
        projectName: String(channel.projectName || '').trim(),
        roomName: String(channel.roomName || '').trim(),
        messageCount: summaryMessages.length,
        messages: summaryMessages,
        url: `${origin}/menu/missatgeria?channel=${encodeURIComponent(channelId)}`,
      })

      await doc.ref.set(
        {
          projectMissedActivityPending: false,
          projectMissedActivityLastSentAt: now,
          projectMissedActivityLastSentForMessageAt: Number(
            member.projectMissedActivityLastMessageAt || now
          ),
        },
        { merge: true }
      )
      sent += 1
    } catch (error) {
      failed += 1
      console.error('[projects-missed-activity] email summary error', {
        channelId,
        userId,
        error,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    cleared,
    failed,
  })
}
