// file: src/app/api/push/register-fcm/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const { userId, token, platform } = await req.json()

    if (!userId || !token) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const ref = db.collection('users').doc(String(userId)).collection('fcmTokens')
    const snap = await ref.where('token', '==', token).limit(1).get()
    if (snap.empty) {
      await ref.add({
        token,
        platform: platform || 'android',
        createdAt: Date.now(),
      })
    }

    await db.collection('users').doc(String(userId)).set(
      { pushToken: token, pushEnabled: true, updatedAt: Date.now() },
      { merge: true }
    )

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('[push/register-fcm]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
