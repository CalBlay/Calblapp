// src/app/api/personnel/[id]/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'


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

/** Body del PUT */
interface UpdatePersonnelBody {
  available: boolean
  unavailableFrom?: string | null
  unavailableUntil?: string | null
  unavailableIndefinite?: boolean
  unavailableNotifiedFor?: string | null
  unavailableNotifiedAt?: number
}

/**
 * GET: Consulta una persona pel seu ID
 */
export async function GET(
  _req: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
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
  const { params } = context
  const { id: personnelId } = await params
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  const { params } = context
  const { id: personnelId } = await params
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
