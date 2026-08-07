import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  buildStageVerdEventByIdResponse,
  type StageVerdEventRecord,
} from '@/lib/eventsByIdResponse'
import { requireAuth } from '@/lib/server/apiAuth'

export async function GET(
  _req: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = context.params

  try {
    const snap = await db.collection('stage_verd').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'No trobat' }, { status: 404 })
    }

    const data = (snap.data() || {}) as StageVerdEventRecord
    return NextResponse.json(buildStageVerdEventByIdResponse(snap.id, data), {
      status: 200,
    })
  } catch (err: unknown) {
    console.error('[app/api/events/[id]] error:', err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
