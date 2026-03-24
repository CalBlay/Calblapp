import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'

export const runtime = 'nodejs'

type AssignmentRowsRecord = {
  rows?: AssignmentRow[]
}

type AssignmentRow = {
  id: string
  department: string
  vehicleType: string
  plate: string
  conductorId: string | null
  conductorName: string
  date: string
  departTime: string
  returnTime: string
  createdAt: string
  updatedAt: string
}

type TokenLike = {
  name?: string
  email?: string
}

function uuid() {
  // node runtime
  return crypto.randomUUID()
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const authToken = token as TokenLike

    const { eventCode, initial } = await req.json()
    if (!eventCode) return NextResponse.json({ error: 'Missing eventCode' }, { status: 400 })

    const ref = db.collection('transportAssignments').doc(String(eventCode))
    const snap = await ref.get()
    const existing = snap.exists ? (snap.data() as AssignmentRowsRecord) : { rows: [] }
    const rows = Array.isArray(existing.rows) ? existing.rows : []

    const newRow = {
      id: uuid(),
      department: initial?.department || 'logistica',
      vehicleType: initial?.vehicleType || '',
      plate: initial?.plate || '',
      conductorId: initial?.conductorId ?? null,
      conductorName: initial?.conductorName || '',
      date: initial?.date || '',
      departTime: initial?.departTime || '',
      returnTime: initial?.returnTime || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await ref.set(
      {
        rows: [...rows, newRow],
        updatedAt: new Date().toISOString(),
        updatedBy: authToken.name || authToken.email || 'unknown',
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, row: newRow })
  } catch (e) {
    console.error('[api/transports/assignacions/row/add]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
