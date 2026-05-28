import { NextResponse } from 'next/server'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { v4 as uuid } from 'uuid'
import { requireAuth } from '@/lib/server/apiAuth'
import { SPACES_ACTION } from '@/lib/spacesPermissions'
import { requireSpacesAction } from '@/lib/server/spacesApiAuth'

export const runtime = 'nodejs'

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

    if (!file || !fincaId) {
      return NextResponse.json(
        { error: 'Falta el fitxer o el fincaId.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${uuid()}.${ext}`

    const destPath = `finques/${fincaId}/images/${fileName}`
    const bucket = storageAdmin.bucket()

    const fileUpload = bucket.file(destPath)
    await fileUpload.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000',
      },
    })

    await fileUpload.makePublic()

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('❌ Error pujant imatge:', err)
    return NextResponse.json(
      { error: 'Error intern pujant imatge.' },
      { status: 500 }
    )
  }
}
