// src/app/api/transports/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'


// Afegir transport
export async function POST(req: Request) {
  try {
    // 1) Dades d’entrada
    const body = await req.json()
    const { plate, type, conductorId } = body as {
      plate: string
      type: string
      conductorId?: string
    }

    if (!plate || !type) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }

    // 2) Creació a Firestore
    const ref = await firestoreAdmin.collection('transports').add({
      plate,
      type,
      conductorId: conductorId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // 3) Confirmació
    return NextResponse.json({ success: true, id: ref.id })
  } catch (error: unknown) {
    console.error('[API /transports] Error POST:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Llegir transports
export async function GET() {
  try {
    const snap = await firestoreAdmin.collection('transports').get()
    const data = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as { plate?: string; type?: string; conductorId?: string }),
    }))
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('[API /transports] Error GET:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
