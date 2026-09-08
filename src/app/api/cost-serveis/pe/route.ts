import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import {
  lookupPe,
  recomputePeBucketsForYear,
} from '@/lib/costServeis/peBuckets'
import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

/**
 * GET ?year=&serviceType=&spaceKind=Propi|Extern&ln=
 * Lookup PE precalculat (sense rang de dates).
 *
 * POST ?year= → recalcula tots els buckets de l’any.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const year = Number(sp.get('year')) || new Date().getFullYear()
  const spaceRaw = String(sp.get('spaceKind') || '')
  const spaceKind =
    spaceRaw === 'Propi' || spaceRaw === 'Extern'
      ? (spaceRaw as SpaceKind)
      : ''

  try {
    const data = await lookupPe({
      year,
      serviceType: sp.get('serviceType') || undefined,
      ln: sp.get('ln') || undefined,
      spaceKind,
    })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[cost-serveis/pe GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error PE' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canEditUiPath({ user: auth.user, path: MODULE_PATH }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const year =
    Number(req.nextUrl.searchParams.get('year')) ||
    Number((await req.json().catch(() => null))?.year) ||
    new Date().getFullYear()

  try {
    const { meta, buckets } = await recomputePeBucketsForYear({
      year,
      userId: auth.user.id,
    })
    return NextResponse.json({
      ok: true,
      meta,
      bucketCount: buckets.length,
    })
  } catch (err) {
    console.error('[cost-serveis/pe POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error recalculant PE' },
      { status: 500 }
    )
  }
}
