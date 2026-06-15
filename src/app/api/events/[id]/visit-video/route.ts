import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import {
  EVENT_VISIT_VIDEO_PERM,
  visitVideoAccessUserFromSession,
} from '@/lib/eventVisitVideoPermissions'
import {
  extensionForVideoMime,
  isTicketVideoMime,
  MAX_UPLOAD_VIDEO_BYTES,
} from '@/lib/media/ticketAttachments'
import { listVisitVideoFieldKeys, nextVisitVideoField } from '@/lib/eventVisitVideo'
import { cleanText } from '@/lib/media/collectMediaRefs'
import { registerMediaRef } from '@/lib/media/storageMediaIndex'

export const runtime = 'nodejs'

const cleanId = (value: string) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')

async function resolveEventDoc(eventId: string, eventCode?: string | null) {
  let snap = await db.collection('stage_verd').doc(eventId).get()
  if (!snap.exists && eventCode) {
    const alt = await db
      .collection('stage_verd')
      .where('code', '==', eventCode)
      .limit(1)
      .get()
    if (!alt.empty) snap = alt.docs[0]
  }
  return snap
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const allowed = await isUiPermissionGranted({
      user: visitVideoAccessUserFromSession(auth.user),
      permission: EVENT_VISIT_VIDEO_PERM,
    })
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const eventId = cleanId(id)
    if (!eventId) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const eventCode = String(form.get('eventCode') || '').trim()
    const userId = cleanId(auth.user.id)

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (!isTicketVideoMime(file.type)) {
      return NextResponse.json({ error: 'Només es permeten vídeos' }, { status: 400 })
    }

    if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
      return NextResponse.json({ error: 'Vídeo massa gran' }, { status: 400 })
    }

    const snap = await resolveEventDoc(eventId, eventCode || null)
    if (!snap.exists) {
      return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
    }

    const data = (snap.data() || {}) as Record<string, unknown>
    const existingKeys = listVisitVideoFieldKeys(data)
    const field = nextVisitVideoField(existingKeys)
    if (!field) {
      return NextResponse.json(
        { error: 'Ja hi ha el màxim de vídeos de visita per aquest esdeveniment' },
        { status: 400 }
      )
    }

    const extension = extensionForVideoMime(file.type)
    const buffer = Buffer.from(await file.arrayBuffer())
    const path = `events/${eventId}/visits/${userId}/${Date.now()}_${randomUUID()}.${extension}`
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

    const now = new Date().toISOString()
    const displayName = `Visita comercial ${now.slice(0, 10)}`

    await snap.ref.set(
      {
        [field]: path,
        [`${field}Name`]: displayName,
        [`${field}MimeType`]: file.type,
        [`${field}At`]: now,
        [`${field}By`]: userId,
        updatedAt: now,
      },
      { merge: true }
    )

    const eventCodeLabel =
      cleanText(data.code) ||
      cleanText(data.Code) ||
      cleanText(data.C_digo) ||
      eventCode
    const eventTitle = cleanText(data.NomEvent).split('/')[0].trim()

    void registerMediaRef({
      path,
      source: 'events',
      firestoreDocId: snap.id,
      refSuffix: field,
      url,
      size: buffer.length,
      contentType: file.type,
      title: [eventCodeLabel, eventTitle, displayName].filter(Boolean).join(' · '),
      createdAt: Date.now(),
      eventEventId: snap.id,
    })

    return NextResponse.json({
      ok: true,
      field,
      path,
      url,
      name: displayName,
      mimeType: file.type,
      meta: { size: buffer.length, type: file.type },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
