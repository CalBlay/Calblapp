import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import { accessUserFromSession } from '@/lib/calendar/calendarApiAuth'
import { isAllowedCalendarManualCollection } from '@/lib/calendar/calendarManualCollection'
import { calendarCancelledFromRequest } from '@/lib/calendar/calendarCancellation'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const allowed = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.cancelEvent,
    })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = (await req.json()) as { collection?: string; cancelled?: boolean }
    const collection = String(body.collection || '').trim()
    if (!id || !isAllowedCalendarManualCollection(collection)) {
      return NextResponse.json({ error: 'Esdeveniment o col·lecció invàlids' }, { status: 400 })
    }

    const docRef = db.collection(collection).doc(id)
    const snap = await docRef.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
    }

    const cancelled = calendarCancelledFromRequest(body.cancelled)
    const now = new Date().toISOString()
    await docRef.set(
      cancelled
        ? {
            cancelled: true,
            cancelledAt: now,
            cancelledByUserId: auth.user.id,
            cancelledByName: String(auth.user.name || auth.user.email || '').trim(),
            updatedAt: now,
          }
        : {
            cancelled: false,
            cancelledAt: null,
            cancelledByUserId: null,
            cancelledByName: null,
            cancellationNoticeSentAt: null,
            cancellationNoticeSentByUserId: null,
            updatedAt: now,
          },
      { merge: true }
    )

    return NextResponse.json({ ok: true, cancelled })
  } catch (error) {
    console.error('[calendar/manual/[id]/cancel POST]', error)
    return NextResponse.json({ error: 'No s\'ha pogut actualitzar la cancel·lació' }, { status: 500 })
  }
}
