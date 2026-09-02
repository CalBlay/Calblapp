// filename: src/app/api/transports/[id]/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { processTransportReviewNotifications } from '@/lib/transportReviewNotifications'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireTransportsFleetEdit } from '@/lib/server/transportsApiAuth'

const COLLECTION = 'transports'

// PUT → Actualitzar un transport
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requireTransportsFleetEdit(auth)
  if (denied) return denied

  try {
    const { id } = await context.params
    const body = await req.json()
    await db.collection(COLLECTION).doc(id).update(body)
    try {
      const origin = new URL(req.url).origin
      await processTransportReviewNotifications(origin)
    } catch (notifyError) {
      console.error('Error enviant notificacions de revisio transport:', notifyError)
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error actualitzant transport:', error)
    return NextResponse.json({ error: 'Error actualitzant' }, { status: 500 })
  }
}

// DELETE → Eliminar un transport
export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requireTransportsFleetEdit(auth)
  if (denied) return denied

  try {
    const { id } = await context.params
    await db.collection(COLLECTION).doc(id).delete()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error eliminant transport:', error)
    return NextResponse.json({ error: 'Error eliminant' }, { status: 500 })
  }
}
