import { NextResponse } from 'next/server'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { v4 as uuid } from 'uuid'
import { requireAuth } from '@/lib/server/apiAuth'
import { SPACES_ACTION } from '@/lib/spacesPermissions'
import { requireSpacesAction } from '@/lib/server/spacesApiAuth'
import { extensionForVideoMime } from '@/lib/media/ticketAttachments'
import { MAX_UPLOAD_VIDEO_BYTES } from '@/lib/media/ticketAttachments'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canUpload = await requireSpacesAction(auth, SPACES_ACTION.BBDD_UPDATE)
    if (!canUpload) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()

    const file = formData.get('file') as File | null
    const fincaId = formData.get('fincaId') as string | null
    const kindRaw = String(formData.get('kind') || '').trim().toLowerCase()

    if (!file || !fincaId) {
      return NextResponse.json(
        { error: 'Falta el fitxer o el fincaId.' },
        { status: 400 }
      )
    }

    const isVideo = kindRaw === 'video' || file.type.startsWith('video/')
    const kind = isVideo ? 'video' : 'image'

    if (isVideo && file.size > MAX_UPLOAD_VIDEO_BYTES) {
      return NextResponse.json(
        { error: 'El vídeo supera la mida màxima permesa.' },
        { status: 400 }
      )
    }
    if (!isVideo && file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'La imatge supera la mida màxima permesa.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const ext = isVideo
      ? extensionForVideoMime(file.type)
      : file.name.split('.').pop() || 'jpg'
    const fileName = `${uuid()}.${ext}`

    const folder = isVideo ? 'videos' : 'images'
    const destPath = `finques/${fincaId}/${folder}/${fileName}`
    const bucket = storageAdmin.bucket()

    const fileUpload = bucket.file(destPath)
    await fileUpload.save(buffer, {
      metadata: {
        contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        cacheControl: 'public,max-age=31536000',
      },
    })

    await fileUpload.makePublic()

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`

    return NextResponse.json({
      url: publicUrl,
      kind,
      mimeType: file.type || null,
    })
  } catch (err) {
    console.error('❌ Error pujant fitxer espai:', err)
    return NextResponse.json(
      { error: 'Error intern pujant el fitxer.' },
      { status: 500 }
    )
  }
}
