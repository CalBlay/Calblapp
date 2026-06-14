import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const MAX_SIZE = 10 * 1024 * 1024

type SessionUser = {
  id: string
  name?: string
  role?: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = session.user as SessionUser
    const userId = String(user.id || '').trim()
    const role = normalizeRole(user.role || '')
    const form = await req.formData()
    const file = form.get('file') as File | null
    const channelId = String(form.get('channelId') || '').trim()

    if (!file || !channelId || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if ((file.type || '').startsWith('image/')) {
      return NextResponse.json({ error: 'Use image upload for images' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const channelSnap = await db.collection('channels').doc(channelId).get()
    if (!channelSnap.exists) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    const channel = channelSnap.data() as Record<string, unknown>
    if (String(channel.source || '') !== 'projects') {
      return NextResponse.json({ error: 'Only project channels support file upload' }, { status: 400 })
    }
    if (String(channel.status || '').toLowerCase() === 'archived') {
      return NextResponse.json({ error: 'Canal tancat' }, { status: 400 })
    }

    if (role !== 'admin' && role !== 'direccio') {
      const memberSnap = await db
        .collection('channelMembers')
        .where('channelId', '==', channelId)
        .where('userId', '==', userId)
        .limit(1)
        .get()
      if (memberSnap.empty) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const projectId = String(channel.projectId || '').trim()
    const roomId = String(channel.roomId || '').trim()
    if (!projectId || !roomId) {
      return NextResponse.json({ error: 'Project room not linked' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const safeName = (file.name || `file-${Date.now()}`).replace(/[^\w.\-]+/g, '_')
    const path = `projects/${projectId}/rooms/${roomId}/chat/${Date.now()}-${safeName}`

    const bucket = storageAdmin.bucket()
    const fileRef = bucket.file(path)
    await fileRef.save(bytes, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
    })

    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
    })

    const projectRef = db.collection('projects').doc(projectId)
    const projectSnap = await projectRef.get()
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = projectSnap.data() as Record<string, unknown>
    const rooms = Array.isArray(project.rooms) ? [...(project.rooms as Record<string, unknown>[])] : []
    const roomIndex = rooms.findIndex((room) => String(room.id || '') === roomId)
    if (roomIndex < 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const document = {
      id: `room-doc-${Date.now()}`,
      name: file.name || '',
      label: file.name || 'Document operatiu',
      category: 'other',
      path,
      url,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }

    const currentDocs = Array.isArray(rooms[roomIndex].documents)
      ? (rooms[roomIndex].documents as Record<string, unknown>[])
      : []

    rooms[roomIndex] = {
      ...rooms[roomIndex],
      documents: [...currentDocs, document],
    }

    await projectRef.set(
      {
        rooms,
        updatedAt: Date.now(),
        updatedById: userId,
        updatedByName: user.name || '',
      },
      { merge: true }
    )

    return NextResponse.json({ document })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
