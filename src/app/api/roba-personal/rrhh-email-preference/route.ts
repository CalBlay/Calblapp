export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireRobaWorkflowAccess } from '@/lib/roba-personal/guard'

const USERS = 'users'
const FIELD = 'robaRrhhEmailPreference'

export async function GET() {
  const auth = await requireRobaWorkflowAccess()
  if (!auth.ok) return auth.res
  if (auth.access.scope === 'workerSelf') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const snap = await db.collection(USERS).doc(auth.access.userId).get()
  const savedEmail = String(
    snap.exists ? (snap.data() as Record<string, unknown>)[FIELD] || '' : ''
  ).trim()

  return NextResponse.json({ savedEmail })
}

export async function PATCH(req: Request) {
  const auth = await requireRobaWorkflowAccess()
  if (!auth.ok) return auth.res
  if (auth.access.scope === 'workerSelf') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as { email?: string }
  const email = String(body.email || '').trim()

  await db.collection(USERS).doc(auth.access.userId).set(
    {
      [FIELD]: email || null,
    },
    { merge: true }
  )

  return NextResponse.json({ ok: true, savedEmail: email })
}
