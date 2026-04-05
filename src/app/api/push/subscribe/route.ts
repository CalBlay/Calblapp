// file: src/app/api/push/subscribe/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const { userId, subscription } = await req.json()

    if (!userId || !subscription) {
      return NextResponse.json(
        { error: 'Falten camps requerits' },
        { status: 400 }
      )
    }

    const uid = String(userId)
    await db.collection('users').doc(uid).collection('pushSubscriptions').add({
      subscription,
      createdAt: Date.now(),
    })

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
