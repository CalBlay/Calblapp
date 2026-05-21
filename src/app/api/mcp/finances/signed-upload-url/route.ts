import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { financeGcsBase, financeKindSegment, type FinanceKind } from '@/lib/server/financeGcsPaths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const normalizeSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeKind = (value: string): FinanceKind | null => {
  const v = normalizeSegment(value).replace(/[\s._-]+/g, '')
  if (v === 'compres' || v === 'compras') return 'compres'
  if (v === 'costos' || v === 'costs' || v === 'cexplotacio') return 'costos'
  if (v === 'vendes' || v === 'ventas' || v === 'sales') return 'vendes'
  if (v === 'rh' || v === 'rrhh' || v === 'recursoshumans' || v === 'recursoshumanos') return 'rh'
  return null
}

const inferKindFromRelativePath = (relativePath: string, fallback: FinanceKind): FinanceKind => {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  for (const part of parts.slice(0, -1)) {
    const kind = normalizeKind(part)
    if (kind) return kind
  }
  return fallback
}

const isAllowedCsvName = (name: string) => {
  const base = path.posix.basename(name.replace(/\\/g, '/')).trim()
  if (!base || base.includes('..')) return false
  const lower = base.toLowerCase()
  return lower.endsWith('.csv') || lower.endsWith('.tsv')
}

function getFinanceBucket() {
  const bucketName =
    process.env.FINANCE_GCS_BUCKET ||
    process.env.GCS_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    ''
  return bucketName ? storageAdmin.bucket(bucketName) : storageAdmin.bucket()
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden.res

  const body = (await req.json().catch(() => null)) as {
    fileName?: unknown
    relativePath?: unknown
    kind?: unknown
    contentType?: unknown
  } | null

  const fileName = path.posix.basename(String(body?.fileName || '').replace(/\\/g, '/'))
  if (!isAllowedCsvName(fileName)) {
    return NextResponse.json({ ok: false, error: 'Nom de fitxer invalid' }, { status: 400 })
  }

  const fallbackKind = normalizeKind(String(body?.kind || 'compres')) || 'compres'
  const relativePath = String(body?.relativePath || fileName)
  const kind = inferKindFromRelativePath(relativePath, fallbackKind)
  const objectPath = `${financeGcsBase()}/${financeKindSegment(kind)}/${fileName}`.replace(/\/+/g, '/')
  const contentType = String(body?.contentType || '').trim() || 'text/csv'

  const bucket = getFinanceBucket()
  const file = bucket.file(objectPath)
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  })

  return NextResponse.json({
    ok: true,
    url,
    bucket: bucket.name,
    path: objectPath,
    kind,
    contentType,
  })
}
