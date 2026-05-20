import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { rebuildAllModelStates } from '@/lib/cuina-central/ml/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const result = await rebuildAllModelStates(db)
  return NextResponse.json({ ok: true, ...result })
}
