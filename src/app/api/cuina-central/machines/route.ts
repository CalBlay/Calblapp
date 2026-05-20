import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapMachine } from '@/lib/cuina-central/firestoreMappers'
import { cleanText, slugDocId, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.machines

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const snap = await db.collection(COL).orderBy('name', 'asc').get()
  const machines = snap.docs.map((doc) => mapMachine(doc.id, doc.data() as Record<string, unknown>))
  return NextResponse.json({ machines })
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const code = cleanText(body?.code)
  const name = cleanText(body?.name)
  if (!code || !name) {
    return NextResponse.json({ error: 'Cal codi i nom' }, { status: 400 })
  }
  const now = Date.now()
  const id = slugDocId(code)
  const payload = {
    code,
    name,
    location: cleanText(body?.location),
    zone: cleanText(body?.zone),
    mapX: body?.mapX == null ? null : Number(body.mapX),
    mapY: body?.mapY == null ? null : Number(body.mapY),
    active: body?.active !== false,
    customFields: toCustomFields(body?.customFields),
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COL).doc(id).set(payload, { merge: true })
  return NextResponse.json({ ok: true, id })
}
