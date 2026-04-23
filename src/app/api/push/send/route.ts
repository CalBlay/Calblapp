// file: src/app/api/push/send/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { firestoreAdmin as db, messagingAdmin } from '@/lib/firebaseAdmin'
import webpush from 'web-push'

export async function POST(req: Request) {
  try {
    const { userId, title, body, url } = await req.json()

    if (!userId || !title || !body) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400 }
      )
    }

    const uid = String(userId)
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null
    if (userData?.pushEnabled === false) {
      return NextResponse.json({ success: true, sent: 0, skipped: 'push_disabled' })
    }

    const VAPID_PUBLIC = process.env.VAPID_PUBLIC
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE
    const VAPID_MAILTO = process.env.VAPID_MAILTO || 'mailto:it@calblay.com'

    const [subsSnap, fcmSnap] = await Promise.all([
      userRef.collection('pushSubscriptions').get(),
      userRef.collection('fcmTokens').get(),
    ])

    if (subsSnap.empty && fcmSnap.empty) {
      return NextResponse.json({ success: true, sent: 0 })
    }

    let sent = 0

    if (!subsSnap.empty) {
      if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        return NextResponse.json(
          { error: 'Missing VAPID keys' },
          { status: 500 }
        )
      }
      webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE)

      const payload = JSON.stringify({
        title,
        body,
        url,
        icon: '/icons/cb.svg',
        badge: '/icons/cb.svg',
      })

      await Promise.all(
        subsSnap.docs.map(async (doc) => {
          const sub = doc.data().subscription
          try {
            await webpush.sendNotification(sub, payload, {
              TTL: 60 * 60,
              urgency: 'high',
            })
            sent++
          } catch (err: unknown) {
            const statusCode =
              err &&
              typeof err === 'object' &&
              'statusCode' in err &&
              typeof (err as { statusCode?: unknown }).statusCode === 'number'
                ? (err as { statusCode: number }).statusCode
                : undefined
            if (statusCode === 404 || statusCode === 410) {
              await doc.ref.delete()
            }
          }
        })
      )
    }

    if (!fcmSnap.empty) {
      const tokens = fcmSnap.docs
        .map((d) => String(d.data().token || ''))
        .filter(Boolean)

      if (tokens.length > 0) {
        const res = await messagingAdmin.sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: { url: url || '/' },
          android: {
            priority: 'high',
            notification: {
              icon: 'ic_stat_cb',
              color: '#0f766e',
            },
          },
        })

        sent += res.successCount

        res.responses.forEach((r, idx) => {
          if (r.success) return
          const code = r.error?.code
          if (code === 'messaging/registration-token-not-registered') {
            const tok = tokens[idx]
            const doc = fcmSnap.docs.find((d) => d.data().token === tok)
            if (doc) void doc.ref.delete()
          }
        })
      }
    }

    return NextResponse.json({ success: true, sent })
  } catch (e: unknown) {
    console.error('[push/send]', e)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
