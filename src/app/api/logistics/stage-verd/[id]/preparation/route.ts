export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { buildPreparationUpdateFields } from '@/lib/logistics/preparationUpdate'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin', 'direccio', 'cap'])
  if (denied) return denied.res

  try {
    const { id } = await context.params
    const eventId = String(id || '').trim()
    if (!eventId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const body = (await req.json()) as {
      preparacioData?: string
      preparacioHora?: string
    }

    const update = buildPreparationUpdateFields(body)
    if (!update.ok) return NextResponse.json({ error: update.error }, { status: 400 })

    await firestoreAdmin.collection('stage_verd').doc(eventId).update(update.fields)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[logistics/stage-verd/preparation PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
