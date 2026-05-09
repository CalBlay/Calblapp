import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { storageAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const MAX_SIZE = 5 * 1024 * 1024
const MAX_FILE_NAME_LENGTH = 120
const MAX_SEGMENT_LENGTH = 120
type SessionUser = { id?: string; userId?: string; email?: string | null; name?: string | null }

const cleanSegment = (value: string) =>
  value
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH)

const cleanFileName = (value: string) =>
  value
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')

const limitFileNameLength = (value: string) => {
  const safeName = cleanFileName(value || `adjunt-${Date.now()}`)
  const dotIndex = safeName.lastIndexOf('.')

  if (safeName.length <= MAX_FILE_NAME_LENGTH) return safeName
  if (dotIndex <= 0 || dotIndex === safeName.length - 1) {
    return safeName.slice(0, MAX_FILE_NAME_LENGTH)
  }

  const extension = safeName.slice(dotIndex)
  const base = safeName.slice(0, dotIndex)
  const maxBaseLength = Math.max(1, MAX_FILE_NAME_LENGTH - extension.length)
  return `${base.slice(0, maxBaseLength)}${extension}`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const rawTicketId = String(form.get('ticketId') || '').trim()
    const ticketId = cleanSegment(rawTicketId)
    const user = session.user as SessionUser | undefined
    const userId = cleanSegment(
      String(user?.id || user?.userId || user?.email || user?.name || '')
    )

    if (!file) {
      console.warn('[maintenance/upload-email-attachment] Missing file')
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (!ticketId) {
      console.warn('[maintenance/upload-email-attachment] Missing ticketId', { rawTicketId })
      return NextResponse.json({ error: 'Missing ticket identifier' }, { status: 400 })
    }

    if (!userId) {
      console.warn('[maintenance/upload-email-attachment] Missing userId', {
        sessionUser: session.user,
      })
      return NextResponse.json({ error: 'Missing session user identifier' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      console.warn('[maintenance/upload-email-attachment] File too large', {
        size: file.size,
        maxSize: MAX_SIZE,
        name: file.name,
      })
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const name = limitFileNameLength(file.name || `adjunt-${Date.now()}`)
    const path = `maintenance/email-attachments/${ticketId}/${userId}/${Date.now()}-${name}`

    const bucket = storageAdmin.bucket()
    const fileRef = bucket.file(path)
    await fileRef.save(bytes, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
    })

    return NextResponse.json({
      name,
      path,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
