import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { storageAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const MAX_SIZE = 5 * 1024 * 1024
type SessionUser = { id?: string }

const cleanSegment = (value: string) =>
  value
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')

const cleanFileName = (value: string) =>
  value
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const ticketId = cleanSegment(String(form.get('ticketId') || ''))
    const user = session.user as SessionUser | undefined
    const userId = cleanSegment(String(user?.id || ''))

    if (!file || !ticketId || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const name = cleanFileName(file.name || `adjunt-${Date.now()}`)
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
