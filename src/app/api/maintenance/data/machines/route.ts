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

export async function GET() {
  try {
    const snap = await db.collection(COLLECTION).orderBy('name', 'asc').get()
    const machines = snap.docs.map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        code: String(data.code || '').trim(),
        name: String(data.name || '').trim(),
        label: buildLabel(data.code, data.name),
        location: String(data.location || '').trim(),
        brand: String(data.brand || '').trim(),
        model: String(data.model || '').trim(),
        serialNumber: String(data.serialNumber || '').trim(),
        supplierId: String(data.supplierId || '').trim(),
        supplierName: String(data.supplierName || '').trim(),
        active: data.active !== false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      }
    })
    return NextResponse.json({ machines })
  } catch (error) {
    console.error('[maintenance/data/machines] GET error', error)
    return NextResponse.json({ error: 'Error carregant maquinaria' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const code = String(body?.code || '').trim()
    const name = String(body?.name || '').trim()

    if (!code && !name) {
      return NextResponse.json({ error: 'Cal informar codi o nom' }, { status: 400 })
    }

    const now = Date.now()
    const payload = {
      code,
      name,
      label: buildLabel(code, name),
      location: String(body?.location || '').trim(),
      brand: String(body?.brand || '').trim(),
      model: String(body?.model || '').trim(),
      serialNumber: String(body?.serialNumber || '').trim(),
      supplierId: String(body?.supplierId || '').trim(),
      supplierName: String(body?.supplierName || '').trim(),
      active: body?.active !== false,
      createdAt: now,
      updatedAt: now,
    }

    const ref = await db.collection(COLLECTION).add(payload)
    return NextResponse.json({ ok: true, id: ref.id })
  } catch (error) {
    console.error('[maintenance/data/machines] POST error', error)
    return NextResponse.json({ error: 'Error desant maquinaria' }, { status: 500 })
  }
}
