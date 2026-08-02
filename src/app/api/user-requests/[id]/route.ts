// src/app/api/user-requests/[id]/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'



/**
 * 🔹 GET → retorna la sol·licitud d’usuari de Firestore
 * El :id correspon sempre al personId (doc.id dins userRequests)
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const denied = requireRoles(auth, ['admin'])
    if (denied) return denied.res

    const { id } = await ctx.params
    console.log('📥 GET /api/user-requests/:id', id)

    const snap = await firestoreAdmin.collection('userRequests').doc(id).get()
    if (!snap.exists) {
      console.warn('❌ userRequest no trobat:', id)
      return NextResponse.json(
        { success: false, error: 'userRequest no trobat' },
        { status: 404 }
      )
    }

    const data = snap.data() || {}

    console.log('✅ userRequest carregat:', { id: snap.id, ...data })

    return NextResponse.json({
      success: true,
      id: snap.id, // aquest és el personId
      ...data,
    })
  } catch (error: unknown) {
    console.error('[api/user-requests GET] error:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
