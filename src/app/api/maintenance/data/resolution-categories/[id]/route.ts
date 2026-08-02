import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceResolutionCategories'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const ref = db.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Categoria no trobada' }, { status: 404 })
    }

    const patch: Record<string, unknown> = {
      ...(body?.name !== undefined ? { name: String(body.name || '').trim() } : {}),
      ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
      updatedAt: Date.now(),
    }
    await ref.set(patch, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/resolution-categories/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error actualitzant categoria de resolucio' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const ref = db.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Categoria no trobada' }, { status: 404 })
    }

    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/resolution-categories/[id]] DELETE error', error)
    return NextResponse.json({ error: 'Error eliminant categoria de resolucio' }, { status: 500 })
  }
}
