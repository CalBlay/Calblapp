import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { financeGcsBase, financeKindSegment, type FinanceKind } from '@/lib/server/financeGcsPaths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FILES = 120
const MAX_FILE_BYTES = 60 * 1024 * 1024

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

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'FormData invalid' }, { status: 400 })
  }

  const fallbackKind = normalizeKind(String(form.get('kind') || 'compres')) || 'compres'
  const files = form.getAll('files').filter((item): item is File => item instanceof File)
  const relativePaths = form.getAll('paths').map((item) => String(item || ''))

  if (!files.length) {
    return NextResponse.json({ ok: false, error: 'No hi ha fitxers per pujar' }, { status: 400 })
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { ok: false, error: `Massa fitxers: màxim ${MAX_FILES} per pujada` },
      { status: 400 }
    )
  }

  const bucket = getFinanceBucket()
  const base = financeGcsBase()
  const uploaded: Array<{ name: string; path: string; kind: FinanceKind; size: number }> = []
  const skipped: Array<{ name: string; reason: string }> = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const relativePath = relativePaths[i] || file.name
    const fileName = path.posix.basename(String(relativePath || file.name).replace(/\\/g, '/'))

    if (!isAllowedCsvName(fileName)) {
      skipped.push({ name: fileName || file.name, reason: 'No és CSV/TSV' })
      continue
    }

    if (file.size > MAX_FILE_BYTES) {
      skipped.push({ name: fileName, reason: 'Fitxer massa gran' })
      continue
    }

    const kind = inferKindFromRelativePath(relativePath, fallbackKind)
    const objectPath = `${base}/${financeKindSegment(kind)}/${fileName}`.replace(/\/+/g, '/')
    const buffer = Buffer.from(await file.arrayBuffer())

    await bucket.file(objectPath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: file.type || 'text/csv',
        metadata: {
          source: 'consultes-mcp',
          financeKind: kind,
          originalPath: relativePath,
          uploadedBy: auth.user.id,
          uploadedAt: new Date().toISOString(),
        },
      },
    })

    uploaded.push({ name: fileName, path: objectPath, kind, size: file.size })
  }

  return NextResponse.json({
    ok: true,
    bucket: bucket.name,
    uploadedCount: uploaded.length,
    skippedCount: skipped.length,
    uploaded,
    skipped,
    timestamp: new Date().toISOString(),
  })
}
