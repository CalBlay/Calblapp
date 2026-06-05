export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

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

    const updateFields: Record<string, string> = {}
    if (body.preparacioData) updateFields.PreparacioData = body.preparacioData
    if (body.preparacioHora) updateFields.PreparacioHora = body.preparacioHora

    if (!Object.keys(updateFields).length) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await firestoreAdmin.collection('stage_verd').doc(eventId).update(updateFields)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[logistics/stage-verd/preparation PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
