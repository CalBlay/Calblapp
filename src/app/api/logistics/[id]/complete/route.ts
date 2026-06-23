import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const ALLOWED_ROLES = new Set(['admin', 'direccio', 'cap', 'treballador'])

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!ALLOWED_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  const userId = String(token.sub || '').trim()
  const userName = String((token as { name?: string }).name || '').trim()

  return { role, userId, userName }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const trimmedId = String(id || '').trim()
    if (!trimmedId) {
      return NextResponse.json({ ok: false, error: 'Falta ID' }, { status: 400 })
    }

    const body = (await req.json().catch(() => null)) as { done?: boolean } | null
    const done = Boolean(body?.done)

    const nowIso = new Date().toISOString()
    await db.collection('stage_verd').doc(trimmedId).update({
      PreparacioFeta: done,
      PreparacioFetaAt: done ? nowIso : '',
      PreparacioFetaPerUserId: done ? auth.userId : '',
      PreparacioFetaPerNom: done ? auth.userName : '',
      updatedAt: nowIso,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[logistics/[id]/complete] PATCH error', error)
    return NextResponse.json({ ok: false, error: 'Error actualitzant l’estat' }, { status: 500 })
  }
}
