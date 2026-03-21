import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceMachines'

const buildLabel = (code?: string, name?: string) => {
  const cleanCode = String(code || '').trim()
  const cleanName = String(name || '').trim()
  if (cleanCode && cleanName) return `${cleanCode} · ${cleanName}`
  return cleanCode || cleanName
}

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
      return NextResponse.json({ error: 'Maquina no trobada' }, { status: 404 })
    }

    const current = snap.data() || {}
    const code =
      body?.code !== undefined ? String(body.code || '').trim() : String(current.code || '').trim()
    const name =
      body?.name !== undefined ? String(body.name || '').trim() : String(current.name || '').trim()

    await ref.set(
      {
        ...(body?.code !== undefined ? { code } : {}),
        ...(body?.name !== undefined ? { name } : {}),
        ...(body?.location !== undefined ? { location: String(body.location || '').trim() } : {}),
        ...(body?.brand !== undefined ? { brand: String(body.brand || '').trim() } : {}),
        ...(body?.model !== undefined ? { model: String(body.model || '').trim() } : {}),
        ...(body?.serialNumber !== undefined
          ? { serialNumber: String(body.serialNumber || '').trim() }
          : {}),
        ...(body?.supplierId !== undefined ? { supplierId: String(body.supplierId || '').trim() } : {}),
        ...(body?.supplierName !== undefined
          ? { supplierName: String(body.supplierName || '').trim() }
          : {}),
        ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
        label: buildLabel(code, name),
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[maintenance/data/machines/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error actualitzant maquinaria' }, { status: 500 })
  }
}
