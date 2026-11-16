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

const COL = DOTACIO_COLLECTIONS.productTaxonomy

export type TaxonomyKind = 'grup' | 'familia' | 'subfamilia'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export async function GET() {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  try {
    const snap = await db.collection(COL).orderBy('label').get()
    const terms = snap.docs.map((d) =>
      serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
    )
    return NextResponse.json({ terms })
  } catch (e: unknown) {
    console.error('[roba-personal/taxonomy] GET', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const kind = str(body.kind) as TaxonomyKind
    const label = str(body.label)
    const parentKey = str(body.parentKey)
    if (!['grup', 'familia', 'subfamilia'].includes(kind)) {
      return NextResponse.json({ error: 'kind ha de ser grup, familia o subfamilia' }, { status: 400 })
    }
    if (!label) {
      return NextResponse.json({ error: 'Cal el text del valor' }, { status: 400 })
    }
    if (kind === 'familia' && !parentKey) {
      return NextResponse.json({ error: 'La família necessita un grup (parentKey)' }, { status: 400 })
    }
    if (kind === 'subfamilia' && !parentKey) {
      return NextResponse.json({ error: 'La subfamília necessita parentKey (grup|familia)' }, { status: 400 })
    }

    const snap = await db.collection(COL).where('kind', '==', kind).get()
    const dup = snap.docs.find((d) => {
      const x = d.data() as Record<string, unknown>
      return str(x.label).toLowerCase() === label.toLowerCase() && str(x.parentKey) === parentKey
    })
    if (dup) {
      return NextResponse.json({
        ...serializeFirestoreDoc(dup.id, dup.data() as Record<string, unknown>),
        duplicate: true,
      })
    }

    const now = FieldValue.serverTimestamp()
    const ref = await db.collection(COL).add({
      kind,
      label,
      parentKey: parentKey || '',
      createdAt: now,
      updatedAt: now,
    })
    const created = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(created.id, created.data() as Record<string, unknown>),
      { status: 201 }
    )
  } catch (e: unknown) {
    console.error('[roba-personal/taxonomy] POST', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const id = str(body.id)
    const sizeType = str(body.sizeType)
    const assignsProfile = body.sizeProfileId !== undefined
    if (!id || (!assignsProfile && !isRobaSizeType(sizeType))) {
      return NextResponse.json({ error: 'Cal una família i una configuració de talles vàlida.' }, { status: 400 })
    }

    const ref = db.collection(COL).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Família no trobada.' }, { status: 404 })
    const current = snap.data() as Record<string, unknown>
    if (str(current.kind) !== 'familia') {
      return NextResponse.json({ error: 'El format de talles només es pot associar a una família.' }, { status: 400 })
    }

    if (assignsProfile) {
      const sizeProfileId = str(body.sizeProfileId)
      if (sizeProfileId) {
        const profile = await db.collection(DOTACIO_COLLECTIONS.sizeProfiles).doc(sizeProfileId).get()
        if (!profile.exists) {
          return NextResponse.json({ error: 'Perfil de talles no trobat.' }, { status: 400 })
        }
      }
      await ref.update({
        sizeProfileId: sizeProfileId || null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const requested = normalizeRobaSizeOptions(body.sizeOptions)
      const sizeOptions = robaSizesForFamily(sizeType, requested)
      await ref.update({
        sizeType,
        sizeOptions,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    const updated = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(updated.id, updated.data() as Record<string, unknown>)
    )
  } catch (e: unknown) {
    console.error('[roba-personal/taxonomy] PATCH', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
