// src/app/api/personnel/[id]/route.ts
import { NextResponse } from 'next/server'
import { requireAuth, type AuthSuccess } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { canEditUiPath } from '@/lib/server/permissions'

const PERSONNEL_UI_PATH = '/menu/personnel'

async function requirePersonnelEdit(auth: AuthSuccess): Promise<NextResponse | null> {
  const sessionUser = auth.session.user as { isAdmin?: boolean }
  if (auth.role === 'admin' || sessionUser?.isAdmin) return null

  const canEdit = await canEditUiPath({ user: auth.user, path: PERSONNEL_UI_PATH })
  if (!canEdit) {
    return NextResponse.json(
      { error: 'Permís denegat', message: 'No tens permís per editar personal' },
      { status: 403 }
    )
  }
  return null
}


/** Estructura mínima d’un document de personnel */
interface PersonnelDoc {
  available?: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  name?: string
  role?: string
  department?: string
  maxHoursWeek?: number
  [key: string]: unknown
}

/**
 * GET: Consulta una persona pel seu ID
 */
export async function GET(
  _req: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { params } = context
  const { id: personnelId } = await params
  if (!personnelId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const doc = await firestoreAdmin.collection('personnel').doc(personnelId).get()
    if (!doc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = doc.data() as unknown as PersonnelDoc

    return NextResponse.json({
      id: doc.id,
      ...data,
      maxHoursWeek: data.maxHoursWeek ?? 40,
    })
  } catch (err: unknown) {
    console.error(`[api/personnel/${personnelId} GET] Error:`, err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json(
      { error: 'Internal error reading personnel' },
      { status: 500 }
    )
  }
}

/**
 * PUT: Modifica una persona pel seu ID
 */
export async function PUT(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requirePersonnelEdit(auth)
  if (denied) return denied

  const { params } = context
  const { id: personnelId } = await params

  try {
    const body = await request.json()

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body invàlid' }, { status: 400 })
    }

    // ✅ Actualitza tots els camps rebuts (merge conserva els existents)
    await firestoreAdmin.collection('personnel').doc(personnelId).set(body, { merge: true })

    return NextResponse.json({ id: personnelId, ...body })
  } catch (err) {
    console.error(`[api/personnel/${personnelId} PUT] Error:`, err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json(
      { error: 'Internal error updating personnel' },
      { status: 500 }
    )
  }
}


/**
 * DELETE: Esborra una persona pel seu ID
 */
export async function DELETE(
  _req: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = await requirePersonnelEdit(auth)
  if (denied) return denied

  const { params } = context
  const { id: personnelId } = await params

  try {
    await firestoreAdmin.collection('personnel').doc(personnelId).delete()
    return NextResponse.json({ success: true }, { status: 200 }) // ✅ millor 200
  } catch (err: unknown) {
    console.error(`[api/personnel/${personnelId} DELETE] Error:`, err)
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json(
      { error: 'Internal error deleting personnel' },
      { status: 500 }
    )
  }
}
