import { NextResponse } from 'next/server'
import { getDownloadURL } from 'firebase-admin/storage'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_PREFIXES = [
  'events/',
  'maintenance/',
  'incidents/',
  'messages/',
  'audits/',
  'finques/',
  'spaces/',
]

function normalizeStoragePath(raw: string): string | null {
  const path = String(raw || '')
    .trim()
    .replace(/^\/+/, '')
  if (!path || path.includes('..')) return null
  const allowed = ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
  return allowed ? path : null
}

/** Redirigeix a una URL de descàrrega de Firebase Storage (auth + prefixos permesos). */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const path = normalizeStoragePath(searchParams.get('path') || '')
  if (!path) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const file = storageAdmin.bucket().file(path)
    const downloadUrl = await getDownloadURL(file)
    return NextResponse.redirect(downloadUrl, 302)
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
