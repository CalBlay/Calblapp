import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'maintenanceResolutionCategories'

export async function GET() {
  const auth = await requireMaintenanceDataAccess()
  if (!auth.ok) return auth.res

  try {
    const snap = await db.collection(COLLECTION).orderBy('name').get()
    const categories = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    return NextResponse.json({ categories })
  } catch (error) {
    console.error('[maintenance/data/resolution-categories] GET error', error)
    return NextResponse.json({ error: 'Error carregant categories de resolucio' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal informar el nom de la categoria' }, { status: 400 })
    }

    const now = Date.now()
    const ref = await db.collection(COLLECTION).add({
      name,
      active: body?.active !== false,
      createdAt: now,
      updatedAt: now,
    })
    return NextResponse.json({ ok: true, id: ref.id })
  } catch (error) {
    console.error('[maintenance/data/resolution-categories] POST error', error)
    return NextResponse.json({ error: 'Error desant categoria de resolucio' }, { status: 500 })
  }
}
