export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { isLikelyImageFile } from '@/lib/media/isLikelyImageFile'
import { processUploadedImageFile } from '@/lib/media/uploadImagePipeline'
import { MAX_UPLOAD_IMAGE_BYTES } from '@/lib/media/uploadLimits'
type SessionUser = { id?: string }

const clean = (s: string) =>
  s
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const eventId = clean(String(form.get('eventId') || ''))
    const department = clean(String(form.get('department') || ''))
    const itemId = clean(String(form.get('itemId') || ''))
    const user = session.user as SessionUser | undefined
    const userId = clean(String(user?.id || ''))

    if (!file || !eventId || !department || !itemId || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (!isLikelyImageFile(file)) {
      return NextResponse.json({ error: 'Only images are allowed' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }

    const processed = await processUploadedImageFile(file)
    const path = `auditoria/${eventId}/${department}/${itemId}/${Date.now()}_${userId}.${processed.extension}`

    const bucket = storageAdmin.bucket()
    const fileRef = bucket.file(path)
    await fileRef.save(processed.buffer, {
      contentType: processed.contentType,
      resumable: false,
    })

    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
    })

    return NextResponse.json({
      url,
      path,
      meta: processed.meta,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
