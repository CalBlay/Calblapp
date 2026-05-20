import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { loadAllModelStates } from '@/lib/cuina-central/ml/loadModelStates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res
  const modelStates = await loadAllModelStates(db)
  return NextResponse.json({ modelStates })
}
