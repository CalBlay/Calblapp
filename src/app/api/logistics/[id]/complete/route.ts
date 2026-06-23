import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { listPreparationWarehousesForUser } from '@/lib/logistics/preparationAccess.server'
import { normalizePreparationWarehouseMap } from '@/lib/logistics/preparationMagatzem'
import { isPreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
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

    const body = (await req.json().catch(() => null)) as
      | { warehouse?: string; done?: boolean }
      | null
    const warehouseRaw = String(body?.warehouse || '').trim().toUpperCase()
    if (!isPreparationWarehouseCode(warehouseRaw)) {
      return NextResponse.json({ ok: false, error: 'Magatzem no vàlid' }, { status: 400 })
    }
    const done = Boolean(body?.done)

    const allowedWarehouses = await listPreparationWarehousesForUser(auth.userId, auth.role)
    if (!allowedWarehouses.includes(warehouseRaw)) {
      return NextResponse.json(
        { ok: false, error: 'No tens permís per aquest magatzem' },
        { status: 403 }
      )
    }

    const docRef = db.collection('stage_verd').doc(trimmedId)
    const snap = await docRef.get()
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Línia no trobada' }, { status: 404 })
    }

    const currentMap = normalizePreparationWarehouseMap(snap.data()?.PreparacioMagatzems)
    const nextMap = { ...currentMap }
    const nowIso = new Date().toISOString()

    if (done) {
      nextMap[warehouseRaw] = {
        userId: auth.userId,
        userName: auth.userName,
        at: nowIso,
      }
    } else {
      delete nextMap[warehouseRaw]
    }

    const completedCount = Object.keys(nextMap).length
    const legacyDone = completedCount >= 3

    await docRef.update({
      PreparacioMagatzems: nextMap,
      PreparacioFeta: legacyDone,
      PreparacioFetaAt: legacyDone ? nowIso : '',
      PreparacioFetaPerUserId: legacyDone ? auth.userId : '',
      PreparacioFetaPerNom: legacyDone ? auth.userName : '',
      updatedAt: nowIso,
    })

    return NextResponse.json({ ok: true, warehouses: nextMap })
  } catch (error) {
    console.error('[logistics/[id]/complete] PATCH error', error)
    return NextResponse.json({ ok: false, error: 'Error actualitzant l’estat' }, { status: 500 })
  }
}
