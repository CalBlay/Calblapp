// file: src/app/api/quadrantsDraft/route.ts
import { NextResponse, NextRequest } from 'next/server'
import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// ⚠️ Fem servir variables d’entorn tipades
const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}
const db = getFirestore()

// Tipus d’un document a quadrantsDraft
interface DraftDoc {
  id: string
  eventId?: string
  code?: string
  eventName?: string
  location?: string
  department?: string
  startDate: string
  startTime?: string
  endDate: string
  endTime?: string
  totalWorkers?: number
  numDrivers?: number
  responsableId?: string | null
  conductors?: string[]
  treballadors?: string[]
  status?: string
  updatedAt?: { toDate: () => Date }
}

interface DraftResponseDoc extends Omit<DraftDoc, 'updatedAt'> {
  responsableId?: string | null
  conductors: string[]
  treballadors: string[]
  status: string
  updatedAt: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const dept = searchParams.get('department')

  if (!from || !to) {
    return NextResponse.json(
      { error: '"from" i "to" són obligatoris' },
      { status: 400 }
    )
  }

  let q: FirebaseFirestore.Query = db.collection('quadrantsDraft')
  if (dept) {
    q = q.where('department', '==', dept)
  }

  const snap = await q.get()

  const drafts: DraftResponseDoc[] = snap.docs
    .map(doc => ({ id: doc.id, ...(doc.data() as Omit<DraftDoc, 'id'>) }))
    .filter(d => {
      if (d.startDate < from) return false
      if (d.endDate > to) return false
      return true
    })
    .map(d => ({
      ...d,
      responsableId: d.responsableId || null,
      conductors: d.conductors || [],
      treballadors: d.treballadors || [],
      status: d.status || 'draft',
      updatedAt: d.updatedAt?.toDate().toISOString() || null,
    }))

  return NextResponse.json(drafts)
}
