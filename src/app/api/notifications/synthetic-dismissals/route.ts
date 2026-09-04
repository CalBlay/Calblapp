import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { userDocRefByAuthId } from '@/lib/notifications/userNotificationsRef'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPES = ['incidents', 'roba_personal'] as const
type DismissalScope = (typeof SCOPES)[number]

const normalizeScope = (value: unknown): DismissalScope | null => {
  const scope = String(value || '').trim()
  return SCOPES.includes(scope as DismissalScope) ? (scope as DismissalScope) : null
}

const normalizeIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 500)
    : []

async function preferencesRef(userId: string) {
  const userRef = await userDocRefByAuthId(userId)
  return userRef.collection('notificationPreferences').doc('syntheticDismissals')
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const scope = normalizeScope(new URL(req.url).searchParams.get('scope'))
  if (!scope) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })

  const snap = await (await preferencesRef(auth.user.id)).get()
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {}
  return NextResponse.json({ ids: normalizeIds(data[scope]) })
}

export async function PATCH(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const body = (await req.json().catch(() => null)) as { scope?: unknown; ids?: unknown } | null
  const scope = normalizeScope(body?.scope)
  const ids = normalizeIds(body?.ids)
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
