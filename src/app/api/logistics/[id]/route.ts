import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  LOGISTICS_PREPARATION_SERVICES_COLLECTION,
  STAGE_VERD_COLLECTION,
  canDeleteLogisticsPreparationRow,
  type LogisticsDeleteCollection,
} from '@/lib/logistics/preparationDeleteGuard'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap'])
const COLLECTIONS: LogisticsDeleteCollection[] = [
  LOGISTICS_PREPARATION_SERVICES_COLLECTION,
  STAGE_VERD_COLLECTION,
]

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!EDIT_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  return { role }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const trimmedId = String(id || '').trim()
    if (!trimmedId) {
      return NextResponse.json({ ok: false, error: 'Falta ID' }, { status: 400 })
    }

    let ref: FirebaseFirestore.DocumentReference | null = null
    let collectionName: LogisticsDeleteCollection | null = null
    let data: Record<string, unknown> | null = null

    for (const candidateCollection of COLLECTIONS) {
      const candidate = db.collection(candidateCollection).doc(trimmedId)
      const snap = await candidate.get()
      if (snap.exists) {
        ref = candidate
        collectionName = candidateCollection
        data = (snap.data() as Record<string, unknown> | undefined) || null
        break
      }
    }

    if (!ref || !collectionName) {
      return NextResponse.json({ ok: false, error: 'No existeix la fila' }, { status: 404 })
    }

    const guard = canDeleteLogisticsPreparationRow({
      collectionName,
      id: trimmedId,
      data,
    })
    if (!guard.ok) {
      return NextResponse.json({ ok: false, error: guard.error }, { status: 409 })
    }

    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[logistics/[id]] DELETE error', error)
    return NextResponse.json({ ok: false, error: 'Error eliminant la fila' }, { status: 500 })
  }
}
