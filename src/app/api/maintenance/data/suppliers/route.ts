import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceSuppliers'

export async function GET() {
  try {
    const snap = await db.collection(COLLECTION).orderBy('name', 'asc').get()
    const suppliers = snap.docs.map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        name: String(data.name || '').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        specialty: String(data.specialty || '').trim(),
        notes: String(data.notes || '').trim(),
        active: data.active !== false,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      }
    })
    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('[maintenance/data/suppliers] GET error', error)
    return NextResponse.json({ error: 'Error carregant proveidors' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal informar el nom del proveidor' }, { status: 400 })
    }
    const now = Date.now()
    const payload = {
      name,
      email: String(body?.email || '').trim(),
      phone: String(body?.phone || '').trim(),
      specialty: String(body?.specialty || '').trim(),
      notes: String(body?.notes || '').trim(),
      active: body?.active !== false,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection(COLLECTION).add(payload)
    return NextResponse.json({ ok: true, id: ref.id })
  } catch (error) {
    console.error('[maintenance/data/suppliers] POST error', error)
    return NextResponse.json({ error: 'Error desant proveidor' }, { status: 500 })
  }
}
