import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import { mapArticle } from '@/lib/cuina-central/firestoreMappers'
import { cleanText, slugDocId, toCustomFields } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = CUINA_CENTRAL_COLLECTIONS.articles

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const snap = await db.collection(COL).orderBy('name', 'asc').get()
  const articles = snap.docs.map((doc) => mapArticle(doc.id, doc.data() as Record<string, unknown>))
  return NextResponse.json({ articles })
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
    unit: cleanText(body?.unit) || 'kg',
    packagingLabel: cleanText(body?.packagingLabel),
    packagingQty: body?.packagingQty == null ? null : Number(body.packagingQty),
    line: 'bases',
    active: body?.active !== false,
    customFields: toCustomFields(body?.customFields),
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(COL).doc(id).set(payload, { merge: true })
  return NextResponse.json({ ok: true, id })
}
