export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import type { Query } from 'firebase-admin/firestore'

type SessionUser = {
  role?: string
}

type UserRequestItem = {
  id: string
  createdAt?: number
  [key: string]: unknown
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sessionUser = session.user as SessionUser | undefined
  const role = normalizeRole(sessionUser?.role || '')
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
    const items: UserRequestItem[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    items.sort((a, b) => {
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
