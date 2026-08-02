import { NextResponse } from 'next/server'

/** Secret compartit per crides servidor→servidor (push, cron, etc.). */
export function getInternalApiSecret(): string | undefined {
  const value = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
  return value?.trim() || undefined
}

export function hasInternalApiSecret(): boolean {
  return Boolean(getInternalApiSecret())
}

export function readInternalSecretFromRequest(req: Request): string {
  const authorization = req.headers.get('authorization') || ''
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  return (
    req.headers.get('x-internal-secret') ||
    req.headers.get('x-cron-secret') ||
    bearer ||
    ''
  ).trim()
}

export function isInternalApiAuthorized(req: Request): boolean {
  const secret = getInternalApiSecret()
  if (!secret) return false
  return readInternalSecretFromRequest(req) === secret
}

/** 401/503 si la petició cron no porta el secret configurat. */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = getInternalApiSecret()
  if (!secret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 })
  }
  if (readInternalSecretFromRequest(req) !== secret) {
    return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 })
  }
  return null
}

export function internalApiHeaders(contentType = 'application/json'): HeadersInit {
  const secret = getInternalApiSecret()
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType
  if (secret) headers['x-internal-secret'] = secret
  return headers
}
