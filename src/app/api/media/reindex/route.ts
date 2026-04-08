import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { normalizeRole } from '@/lib/roles'
import { rebuildMediaIndexFromFirestore } from '@/lib/media/storageMediaIndex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string } | undefined

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (normalizeRole(user?.role || '') !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { entries, refs } = await rebuildMediaIndexFromFirestore()
    return NextResponse.json({
      ok: true,
      entries,
      refs,
      message: `Index reconstruit: ${entries} fitxers unics, ${refs} referencies.`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
