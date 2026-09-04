import { FieldValue } from 'firebase-admin/firestore'
import { NextRequest, NextResponse } from 'next/server'
import type { AccessUser } from '@/lib/accessControl'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import {
  calendarAttachmentFieldKeys,
  isAllowedCalendarAttachmentField,
  isAllowedCalendarManualCollection,
} from '@/lib/calendar/calendarManualCollection'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'

export const runtime = 'nodejs'

function accessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
}): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; field: string } }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canDelete = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.deleteDocuments,
    })
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, field: rawField } = await params
    const field = rawField.trim()
    const collection = new URL(req.url).searchParams.get('collection') || ''
    if (!id || !isAllowedCalendarManualCollection(collection)) {
      return NextResponse.json({ error: 'Col·lecció o esdeveniment invàlid' }, { status: 400 })
    }
    if (!isAllowedCalendarAttachmentField(field)) {
      return NextResponse.json({ error: 'Camp de document invàlid' }, { status: 400 })
    }

    const docRef = db.collection(collection).doc(id)
    const snap = await docRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
    }

    const data = snap.data() || {}
    const attachmentId = String(data[`${field}AttachmentId`] || '').trim()
    const storagePath = String(data[`${field}Path`] || '').trim()
    const source = String(data[`${field}Source`] || '').trim().toLowerCase()
    const isZohoAttachment = field.toLowerCase().startsWith('zohofile') || source.startsWith('zoho')

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    for (const key of calendarAttachmentFieldKeys(field)) {
      updates[key] = FieldValue.delete()
    }
    if (isZohoAttachment && attachmentId) {
      updates.calendarDeletedZohoAttachmentIds = FieldValue.arrayUnion(attachmentId)
    }

    await docRef.update(updates)

    if (isZohoAttachment && storagePath) {
      try {
        await storageAdmin.bucket().file(storagePath).delete({ ignoreNotFound: true })
      } catch (error) {
        console.warn('No s’ha pogut eliminar la còpia de l’adjunt del bucket:', error)
      }
    }

    return NextResponse.json({ ok: true, field })
  } catch (error) {
    console.error('Error eliminant document del calendari:', error)
    return NextResponse.json({ error: 'Error eliminant el document' }, { status: 500 })
  }
}
