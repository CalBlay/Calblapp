export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  DEFAULT_SPACES_HEADER_RULE,
  normalizeSpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'

const COLLECTION = 'space_settings'
const DOC_ID = 'reserve_header_rule'

async function getAuth() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }),
    }
  }

  const role = normalizeRole(user.role || '')
  return { user, role }
}

export async function GET() {
  try {
    const auth = await getAuth()
    if ('error' in auth) return auth.error

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
    const auth = await getAuth()
    if ('error' in auth) return auth.error
    if (auth.role !== 'admin') {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await request.json()) as { config?: unknown }
    const config = normalizeSpacesHeaderRuleConfig(body?.config)

    await firestoreAdmin.collection(COLLECTION).doc(DOC_ID).set(
      {
        config,
        updatedAt: Date.now(),
        updatedBy: auth.user.id,
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, config }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
