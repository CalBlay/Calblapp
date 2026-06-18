// file: src/app/api/push/register-fcm/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

function normalizePlatform(platform?: string | null) {
  const value = String(platform || 'android').trim().toLowerCase()
  if (value === 'ios' || value === 'android') return value
  return 'android'
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { userId, token, platform } = await req.json()

    if (!userId || !token) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const uid = String(userId)
    if (uid !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tokenValue = String(token).trim()
    const platformNorm = normalizePlatform(platform)
    const ref = db.collection('users').doc(uid).collection('fcmTokens')
    const now = Date.now()

    // Un sol token actiu per plataforma (doc estable).
    await ref.doc(platformNorm).set({
      token: tokenValue,
      platform: platformNorm,
      createdAt: now,
      updatedAt: now,
    })

    // Neteja tokens antics (format anterior amb ids aleatoris).
    const legacySnap = await ref.get()
    const batch = db.batch()
    for (const doc of legacySnap.docs) {
      if (doc.id === platformNorm) continue
      const docPlatform = normalizePlatform(String(doc.data().platform || ''))
      if (docPlatform === platformNorm) {
        batch.delete(doc.ref)
      }
    }
    await batch.commit()

    await db.collection('users').doc(uid).set(
      { pushToken: tokenValue, pushEnabled: true, updatedAt: now },
      { merge: true }
    )

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    console.error('[push/register-fcm]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
