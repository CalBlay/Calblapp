import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { processUploadedImageFile } from '@/lib/media/uploadImagePipeline'
import { MAX_UPLOAD_IMAGE_BYTES } from '@/lib/media/uploadLimits'
import {
  extensionForVideoMime,
  isTicketImageMime,
  isTicketVideoMime,
  MAX_UPLOAD_VIDEO_BYTES,
} from '@/lib/media/ticketAttachments'

export const runtime = 'nodejs'
type SessionUser = { id?: string }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const user = session.user as SessionUser | undefined
    const userId = String(user?.id || '').trim()

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (!isTicketImageMime(file.type) && !isTicketVideoMime(file.type)) {
      return NextResponse.json({ error: 'Només es permeten imatges o vídeos' }, { status: 400 })
    }

    if (isTicketVideoMime(file.type)) {
      if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
        return NextResponse.json({ error: 'Vídeo massa gran' }, { status: 400 })
      }

      const extension = extensionForVideoMime(file.type)
      const buffer = Buffer.from(await file.arrayBuffer())
      const path = `maintenance/${userId}/${Date.now()}.${extension}`
      const bucket = storageAdmin.bucket()
      const fileRef = bucket.file(path)
      await fileRef.save(buffer, {
        contentType: file.type,
        resumable: false,
      })

      const [url] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
      })

      return NextResponse.json({
        url,
        path,
        meta: { size: buffer.length, type: file.type },
      })
    }

    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }

    const processed = await processUploadedImageFile(file)
    const path = `maintenance/${userId}/${Date.now()}.${processed.extension}`

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
