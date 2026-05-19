import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const normalizeTipus = (raw?: unknown) => {
  const value = String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'propi') return 'propi'
  if (value === 'extern' || value === 'externo') return 'extern'
  const code = String(raw || '').trim().toUpperCase()
  if (code.startsWith('CC')) return 'propi'
  return value || '—'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = normalizeMaintenanceLocationKey(searchParams.get('q') || '')
    const tipusFilter = normalizeMaintenanceLocationKey(searchParams.get('tipus') || '')

    const snap = await db.collection('finques').get()
    let centers = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        const name = String(data.nom || data.name || '').trim()
        const code = String(data.codi || data.code || doc.id || '').trim()
        const tipus = normalizeTipus(data.tipus ?? data.code)
        const travelMinutes = Math.max(
          0,
          Math.round(Number(data.maintenanceTravelMinutes ?? data.travelMinutes ?? 0) || 0)
        )
        return {
          id: doc.id,
          name,
          code,
          tipus,
          travelMinutes,
          searchable: normalizeMaintenanceLocationKey(
            [name, code, String(data.searchable || '')].filter(Boolean).join(' ')
          ),
        }
      })
      .filter((row) => row.name)

    if (tipusFilter && tipusFilter !== 'all') {
      centers = centers.filter((row) => row.tipus === tipusFilter)
    }

    if (q) {
      centers = centers.filter((row) => row.searchable.includes(q))
    }

    centers.sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))

    const payload = centers.map(({ searchable: _s, ...row }) => row)

    return NextResponse.json({ centers: payload })
  } catch (error) {
    console.error('[maintenance/data/centers] GET error', error)
    return NextResponse.json({ error: 'Error carregant centres' }, { status: 500 })
  }
}
