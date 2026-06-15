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
import {
  isVisitVideoFieldKey,
  listVisitVideoFieldKeys,
  nextVisitVideoField,
  normalizeVisitVideoUserId,
} from '@/lib/eventVisitVideo'
import { cleanText } from '@/lib/media/collectMediaRefs'
import { registerMediaRef, deleteMediaIndexByPath } from '@/lib/media/storageMediaIndex'
import {
  GOOGLE_DRIVE_VIDEO_MIME,
  isGoogleDriveVideoRef,
  normalizeGoogleDriveVideoRef,
} from '@/lib/googleDriveVideoLink'

export const runtime = 'nodejs'

const cleanId = normalizeVisitVideoUserId

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

async function allocateVisitVideoField(
  eventId: string,
  eventCode: string | null | undefined,
  userId: string
) {
  const snap = await resolveEventDoc(eventId, eventCode || null)
  if (!snap.exists) {
    return { error: NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 }) }
  }

  const data = (snap.data() || {}) as Record<string, unknown>
  const existingKeys = listVisitVideoFieldKeys(data)
  const field = nextVisitVideoField(existingKeys)
  if (!field) {
    return {
      error: NextResponse.json(
        { error: 'Ja hi ha el màxim de vídeos de visita per aquest esdeveniment' },
        { status: 400 }
      ),
    }
  }

  return { snap, data, field, userId }
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

    const userId = cleanId(auth.user.id)
    if (!userId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const contentType = String(req.headers.get('content-type') || '').toLowerCase()

    if (contentType.includes('application/json')) {
      const body = (await req.json().catch(() => ({}))) as {
        driveUrl?: string
        eventCode?: string
        name?: string
      }
      const eventCode = String(body.eventCode || '').trim()
      const driveUrl = String(body.driveUrl || '').trim()
      const normalized = normalizeGoogleDriveVideoRef(driveUrl)
      if (!normalized) {
        return NextResponse.json(
          { error: 'Enllaç de Google Drive no vàlid. Enganxa l’enllaç del fitxer de vídeo.' },
          { status: 400 }
        )
      }

      const allocated = await allocateVisitVideoField(eventId, eventCode, userId)
      if ('error' in allocated && allocated.error) return allocated.error
      const { snap, field } = allocated

      const now = new Date().toISOString()
      const displayName =
        cleanText(body.name) || `Google Drive · ${now.slice(0, 10)}`

      await snap!.ref.set(
        {
          [field!]: normalized.ref,
          [`${field}Name`]: displayName,
          [`${field}MimeType`]: GOOGLE_DRIVE_VIDEO_MIME,
          [`${field}At`]: now,
          [`${field}By`]: userId,
          updatedAt: now,
        },
        { merge: true }
      )

      return NextResponse.json({
        ok: true,
        field,
        ref: normalized.ref,
        url: normalized.viewUrl,
        name: displayName,
        mimeType: GOOGLE_DRIVE_VIDEO_MIME,
        source: 'google-drive',
      })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const eventCode = String(form.get('eventCode') || '').trim()

    if (!file) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    if (!isTicketVideoMime(file.type)) {
      return NextResponse.json({ error: 'Només es permeten vídeos' }, { status: 400 })
    }

    if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
      return NextResponse.json({ error: 'Vídeo massa gran' }, { status: 400 })
    }

    const allocated = await allocateVisitVideoField(eventId, eventCode, userId)
    if ('error' in allocated && allocated.error) return allocated.error
    const { snap, data, field } = allocated

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

    await snap!.ref.set(
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
      firestoreDocId: snap!.id,
      refSuffix: field,
      url,
      size: buffer.length,
      contentType: file.type,
      title: [eventCodeLabel, eventTitle, displayName].filter(Boolean).join(' · '),
      createdAt: Date.now(),
      eventEventId: snap!.id,
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

export async function DELETE(
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

    const body = (await req.json().catch(() => ({}))) as {
      field?: string
      eventCode?: string
    }
    const field = String(body.field || '').trim()
    const eventCode = String(body.eventCode || '').trim()
    const userId = cleanId(auth.user.id)

    if (!field || !isVisitVideoFieldKey(field)) {
      return NextResponse.json({ error: 'Camp de vídeo no vàlid' }, { status: 400 })
    }

    const snap = await resolveEventDoc(eventId, eventCode || null)
    if (!snap.exists) {
      return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
    }

    const data = (snap.data() || {}) as Record<string, unknown>
    const path = cleanText(data[field])
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'Vídeo no trobat' }, { status: 404 })
    }

    const createdBy = cleanId(String(data[`${field}By`] || ''))
    if (!createdBy || createdBy !== userId) {
      return NextResponse.json(
        { error: 'Només qui ha pujat el vídeo pot eliminar-lo' },
        { status: 403 }
      )
    }

    try {
      if (!isGoogleDriveVideoRef(path)) {
        await storageAdmin.bucket().file(path).delete()
      }
    } catch {
      // ignore missing files
    }

    await snap!.ref.set(
      {
        [field]: null,
        [`${field}Name`]: null,
        [`${field}MimeType`]: null,
        [`${field}At`]: null,
        [`${field}By`]: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    if (!isGoogleDriveVideoRef(path)) {
      await deleteMediaIndexByPath(path)
    }

    return NextResponse.json({ ok: true, field, path })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
