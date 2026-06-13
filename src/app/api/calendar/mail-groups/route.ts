import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { accessUserFromSession } from '@/lib/calendar/calendarApiAuth'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import {
  CALENDAR_MAIL_GROUPS_COLLECTION,
  normalizeMailGroupMembers,
  serializeMailGroup,
} from '@/lib/calendar/calendarMailGroups'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canManage = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.manageMailGroups,
    })
    const canSend = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.sendDocuments,
    })
    if (!canManage && !canSend) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const ln = String(searchParams.get('ln') || '').trim()

    const snap = await db
      .collection(CALENDAR_MAIL_GROUPS_COLLECTION)
      .where('createdByUserId', '==', auth.user.id)
      .get()

    let groups = snap.docs.map((doc) => serializeMailGroup(doc.id, doc.data() as Record<string, unknown>))
    groups.sort((a, b) => a.name.localeCompare(b.name, 'ca'))

    if (ln) {
      groups = groups.filter((group) => !group.ln || group.ln === ln)
    }

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('[calendar/mail-groups GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canManage = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.manageMailGroups,
    })
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = (await req.json()) as {
      name?: string
      description?: string
      ln?: string
      members?: unknown
    }

    const name = String(body.name || '').trim()
    const members = normalizeMailGroupMembers(body.members)
    if (!name) return NextResponse.json({ error: 'Falta el nom del grup' }, { status: 400 })
    if (members.length === 0) {
      return NextResponse.json({ error: 'Cal afegir almenys un destinatari' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const payload = {
      name,
      description: String(body.description || '').trim() || null,
      ln: String(body.ln || '').trim() || null,
      members,
      createdByUserId: auth.user.id,
      createdByName: String(auth.user.name || auth.user.email || '').trim() || null,
      createdAt: now,
      updatedAt: now,
    }

    const ref = await db.collection(CALENDAR_MAIL_GROUPS_COLLECTION).add(payload)
    return NextResponse.json({
      group: serializeMailGroup(ref.id, payload),
    })
  } catch (err) {
    console.error('[calendar/mail-groups POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}
