import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { userDocRefByAuthId } from '@/lib/notifications/userNotificationsRef'
import {
  normalizeSyntheticDismissalIds,
  normalizeSyntheticDismissalScope,
} from '@/lib/notifications/syntheticDismissals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function preferencesRef(userId: string) {
  const userRef = await userDocRefByAuthId(userId)
  return userRef.collection('notificationPreferences').doc('syntheticDismissals')
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const scope = normalizeSyntheticDismissalScope(new URL(req.url).searchParams.get('scope'))
  if (!scope) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })

  const snap = await (await preferencesRef(auth.user.id)).get()
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {}
  return NextResponse.json({ ids: normalizeSyntheticDismissalIds(data[scope]) })
}

export async function PATCH(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const body = (await req.json().catch(() => null)) as { scope?: unknown; ids?: unknown } | null
  const scope = normalizeSyntheticDismissalScope(body?.scope)
  const ids = normalizeSyntheticDismissalIds(body?.ids)
  if (!scope || ids.length === 0) {
    return NextResponse.json({ error: 'Invalid dismissal' }, { status: 400 })
  }

  await (await preferencesRef(auth.user.id)).set(
    {
      [scope]: FieldValue.arrayUnion(...ids),
      updatedAt: Date.now(),
    },
    { merge: true }
  )

  return NextResponse.json({ ok: true })
}
