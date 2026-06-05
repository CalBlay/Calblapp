export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

const isIsoDate = (value?: string | null) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())
const isTime = (value?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim())

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

    const updateFields: Record<string, string> = {}
    if (body.preparacioData !== undefined) {
      if (!isIsoDate(body.preparacioData)) {
        return NextResponse.json({ error: 'PreparacioData invàlida' }, { status: 400 })
      }
      updateFields.PreparacioData = body.preparacioData
    }
    if (body.preparacioHora !== undefined) {
      if (!isTime(body.preparacioHora)) {
        return NextResponse.json({ error: 'PreparacioHora invàlida' }, { status: 400 })
      }
      updateFields.PreparacioHora = body.preparacioHora
    }

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
