import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceSuppliers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const ref = db.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Proveidor no trobat' }, { status: 404 })
    }

    await ref.set(
      {
        ...(body?.name !== undefined ? { name: String(body.name || '').trim() } : {}),
        ...(body?.email !== undefined ? { email: String(body.email || '').trim() } : {}),
        ...(body?.phone !== undefined ? { phone: String(body.phone || '').trim() } : {}),
        ...(body?.specialty !== undefined ? { specialty: String(body.specialty || '').trim() } : {}),
        ...(body?.notes !== undefined ? { notes: String(body.notes || '').trim() } : {}),
        ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/suppliers/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error actualitzant proveidor' }, { status: 500 })
  }
}
