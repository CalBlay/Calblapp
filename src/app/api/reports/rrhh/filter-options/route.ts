export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

const COL = DOTACIO_COLLECTIONS.products
const WORKERS_COL = DOTACIO_COLLECTIONS.workers
const LIMIT = 4_000

export type RrhhFilterProductOption = { id: string; label: string }
export type RrhhFilterDepartmentOption = { value: string; label: string }

/**
 * Opcions per al desplegable «Informe a mida» (mateix rol que overview).
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  const snap = await db.collection(COL).limit(LIMIT).get()
  const products: RrhhFilterProductOption[] = snap.docs.map((d) => {
    const p = d.data() as { code?: string; name?: string; size?: string }
    const code = String(p.code || '').trim()
    const name = String(p.name || '').trim()
    const size = String(p.size || '').trim()
    const label =
      code && name
        ? size
          ? `${code} ${name} · ${size}`
          : `${code} ${name}`
        : name || code || d.id
    return { id: d.id, label }
  })
  products.sort((a, b) => a.label.localeCompare(b.label, 'ca'))

  const workersSnap = await db.collection(WORKERS_COL).limit(LIMIT).get()
  const departmentMap = new Map<string, string>()
  workersSnap.docs.forEach((doc) => {
    const data = doc.data() as { department?: string; isActive?: boolean }
    if (data.isActive === false) return
    const label = String(data.department || '').trim()
    if (!label) return
    const key = label
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
    if (!departmentMap.has(key)) departmentMap.set(key, label)
  })
  const departments: RrhhFilterDepartmentOption[] = [...departmentMap.values()]
    .sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
    .map((label) => ({ value: label, label }))

  return NextResponse.json({ products, departments })
}
