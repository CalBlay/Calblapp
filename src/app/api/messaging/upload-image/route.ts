import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { storageAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const MAX_SIZE = 1024 * 1024

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const channelId = String(form.get('channelId') || '').trim()
    const userId = String((session.user as any)?.id || '').trim()

    if (!file || !channelId || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = file.type.includes('png') ? 'png' : 'jpg'
    const path = `messaging/${channelId}/${userId}/${Date.now()}.${ext}`

    const bucket = storageAdmin.bucket()
    const fileRef = bucket.file(path)
    await fileRef.save(bytes, {
      contentType: file.type || 'image/jpeg',
      resumable: false,
    })

    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
    })

    return NextResponse.json({
      url,
      path,
      meta: { size: file.size, type: file.type || 'image/jpeg' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
