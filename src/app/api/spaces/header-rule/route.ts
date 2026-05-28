export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { SPACES_PREMISSES_PATH, SPACES_RESERVES_PATH } from '@/lib/spacesPermissions'
import { requireSpacesEdit, requireSpacesView } from '@/lib/server/spacesApiAuth'
import {
  DEFAULT_SPACES_HEADER_RULE,
  normalizeSpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'

const COLLECTION = 'space_settings'
const DOC_ID = 'reserve_header_rule'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await requireSpacesView(auth, SPACES_RESERVES_PATH)
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snap = await firestoreAdmin.collection(COLLECTION).doc(DOC_ID).get()
    const stored = snap.exists ? snap.data()?.config : null
    const config = normalizeSpacesHeaderRuleConfig(
      stored || DEFAULT_SPACES_HEADER_RULE
    )

    return NextResponse.json({ config }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canEdit = await requireSpacesEdit(auth, SPACES_PREMISSES_PATH)
    if (!canEdit) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await request.json()) as { config?: unknown }
    const config = normalizeSpacesHeaderRuleConfig(body?.config)

    await firestoreAdmin.collection(COLLECTION).doc(DOC_ID).set(
      {
        config,
        updatedAt: Date.now(),
        updatedBy: auth.user.id as string,
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, config }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
