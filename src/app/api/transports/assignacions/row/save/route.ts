// src/app/api/transports/assignacions/row/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import crypto from 'crypto'

export const runtime = 'nodejs'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type RowInput = {
  id?: string
  name?: string
  plate?: string
  vehicleType?: string
  startDate?: string
  endDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type SaveBody = {
  eventCode?: string
  department?: string
  rowId?: string
  rowIndex?: number
  data?: RowInput
  originalPlate?: string
}

type QuadrantConductorRecord = RowInput & {
  id?: string
  department?: string
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
}

type QuadrantRecord = Record<string, unknown> & {
  conductors?: QuadrantConductorRecord[]
  startDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type TokenLike = {
  name?: string
  email?: string
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const authToken = token as TokenLike

    const body = (await req.json()) as SaveBody
    const { eventCode, department, rowId, rowIndex, data, originalPlate } = body || {}

    if (!eventCode || !department || !data) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const colName = `quadrants${cap(department)}`
    const snap = await db
      .collection(colName)
      .where('code', '==', String(eventCode))
      .limit(1)
      .get()

    if (snap.empty) {
      return NextResponse.json({ error: 'Quadrant not found' }, { status: 404 })
    }

    const doc = snap.docs[0]
    const ref = doc.ref
    const current = doc.data() as QuadrantRecord

    const now = new Date().toISOString()
    const user = authToken.name || authToken.email || 'system'

    const conductors = Array.isArray(current.conductors) ? current.conductors : []

    const idToUse = rowId || data?.id || crypto.randomUUID()

    const normPlate = (s?: string | null) => String(s || '').trim().toUpperCase()
    const targetPlate = normPlate(data?.plate)
    const origPlateNorm = normPlate(originalPlate)

    let replaced = false
    const nextConductors = conductors.map((c) => {
      const curPlateNorm = normPlate(c?.plate)
      if (
        c?.id === idToUse ||
        (origPlateNorm && curPlateNorm === origPlateNorm) ||
        (targetPlate && curPlateNorm === targetPlate)
      ) {
        replaced = true
        return {
          ...c,
          id: c?.id || idToUse,
          department,
          name: data.name ?? c.name ?? '',
          plate: data.plate ?? c.plate ?? '',
          vehicleType: data.vehicleType ?? c.vehicleType ?? '',
          startDate: data.startDate ?? c.startDate ?? current.startDate ?? '',
          endDate:
            data.endDate ??
            data.startDate ??
            c.endDate ??
            c.startDate ??
            '',
          startTime: data.startTime ?? c.startTime ?? current.startTime ?? '',
          arrivalTime:
            data.arrivalTime ?? c.arrivalTime ?? current.arrivalTime ?? '',
          endTime: data.endTime ?? c.endTime ?? current.endTime ?? '',
          updatedAt: now,
          updatedBy: user,
        }
      }
      return c
    })

    if (!replaced) {
      const newRow = {
        id: idToUse,
        department,
        name: data.name ?? '',
        plate: data.plate ?? '',
        vehicleType: data.vehicleType ?? '',
        startDate: data.startDate ?? current.startDate ?? '',
        endDate: data.endDate ?? data.startDate ?? current.startDate ?? '',
        startTime: data.startTime ?? current.startTime ?? '',
        arrivalTime: data.arrivalTime ?? current.arrivalTime ?? '',
        endTime: data.endTime ?? current.endTime ?? '',
        createdAt: now,
        createdBy: user,
      }

      if (typeof rowIndex === 'number' && rowIndex >= 0 && rowIndex < nextConductors.length) {
        nextConductors[rowIndex] = newRow
      } else {
        nextConductors.push(newRow)
      }
    }

    await ref.update({
      conductors: nextConductors,
      updatedAt: now,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/transports/assignacions/row/save]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
