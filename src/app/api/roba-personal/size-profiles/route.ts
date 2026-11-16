export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import {
  isRobaSizeType,
  normalizeRobaSizeOptions,
  robaSizesForFamily,
} from '@/lib/roba-personal/sizeProfiles'

const COL = DOTACIO_COLLECTIONS.sizeProfiles

function str(value: unknown): string {
  return String(value ?? '').trim()
}

export async function GET() {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  const snap = await db.collection(COL).orderBy('name').get()
  return NextResponse.json({
    profiles: snap.docs.map((doc) =>
      serializeFirestoreDoc(doc.id, doc.data() as Record<string, unknown>)
    ),
  })
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  const body = (await req.json()) as Record<string, unknown>
  const name = str(body.name).slice(0, 80)
  const sizeType = str(body.sizeType)
  if (!name || !isRobaSizeType(sizeType)) {
    return NextResponse.json({ error: 'Cal un nom i un format de talles vàlid.' }, { status: 400 })
  }
  const sizeOptions = robaSizesForFamily(sizeType, normalizeRobaSizeOptions(body.sizeOptions))
  if (sizeType !== 'none' && sizeOptions.length === 0) {
    return NextResponse.json({ error: 'Cal indicar almenys una talla.' }, { status: 400 })
  }

  const duplicateSnap = await db.collection(COL).where('nameKey', '==', name.toLocaleLowerCase('ca')).get()
  const id = str(body.id)
  if (duplicateSnap.docs.some((doc) => doc.id !== id)) {
    return NextResponse.json({ error: 'Ja existeix un perfil amb aquest nom.' }, { status: 409 })
  }

  const ref = id ? db.collection(COL).doc(id) : db.collection(COL).doc()
  if (id && !(await ref.get()).exists) {
    return NextResponse.json({ error: 'Perfil no trobat.' }, { status: 404 })
  }
  const now = FieldValue.serverTimestamp()
  await ref.set(
    {
      name,
      nameKey: name.toLocaleLowerCase('ca'),
      sizeType,
      sizeOptions,
      isActive: body.isActive !== false,
      updatedAt: now,
      ...(id ? {} : { createdAt: now }),
    },
    { merge: true }
  )
  const saved = await ref.get()
  return NextResponse.json(
    serializeFirestoreDoc(saved.id, saved.data() as Record<string, unknown>),
    { status: id ? 200 : 201 }
  )
}
