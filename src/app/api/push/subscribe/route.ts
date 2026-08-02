// file: src/app/api/push/subscribe/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { userId, subscription } = await req.json()

    if (!userId || !subscription) {
      return NextResponse.json(
        { error: 'Falten camps requerits' },
        { status: 400 }
      )
    }

    const uid = String(userId)
    if (uid !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const endpoint = String(subscription?.endpoint || '').trim()
    const subsCol = db.collection('users').doc(uid).collection('pushSubscriptions')
    if (endpoint) {
      const existing = await subsCol.where('endpoint', '==', endpoint).limit(1).get()
      if (!existing.empty) {
        await existing.docs[0].ref.set(
          { subscription, endpoint, updatedAt: Date.now() },
          { merge: true }
        )
      } else {
        await subsCol.add({
          subscription,
          endpoint,
          createdAt: Date.now(),
        })
      }
    } else {
      await subsCol.add({
        subscription,
        createdAt: Date.now(),
      })
    }

    await db.collection('users').doc(uid).set(
      { pushEnabled: true, updatedAt: Date.now() },
      { merge: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error guardant subscripció push:', error)
    return NextResponse.json(
      { error: 'Error intern guardant subscripció' },
      { status: 500 }
    )
  }
}
