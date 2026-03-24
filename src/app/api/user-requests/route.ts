export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import type { Query } from 'firebase-admin/firestore'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = normalizeRole((session.user as any)?.role || '')
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Només Admin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = (searchParams.get('status') || 'pending').trim()

  try {
    const requestsRef = firestoreAdmin.collection('userRequests')
    let query: Query = requestsRef

    if (status) {
      query = query.where('status', '==', status)
    }

    // Evitem necessitat d'índex compost: ordenem a memòria.
    const snap = await query.limit(200).get()
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    items.sort((a: any, b: any) => {
      const av = typeof a.createdAt === 'number' ? a.createdAt : 0
      const bv = typeof b.createdAt === 'number' ? b.createdAt : 0
      return bv - av
    })

    return NextResponse.json({ success: true, items })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
