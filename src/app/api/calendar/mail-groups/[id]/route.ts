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

async function loadOwnedGroup(userId: string, id: string) {
  const ref = db.collection(CALENDAR_MAIL_GROUPS_COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ref, group: null as null }
  const data = snap.data() as Record<string, unknown>
  if (String(data.createdByUserId || '') !== userId) {
    return { ref, group: null as null, forbidden: true as const }
  }
  return { ref, group: serializeMailGroup(snap.id, data) }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canManage = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.manageMailGroups,
    })
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const owned = await loadOwnedGroup(auth.user.id, id)
    if (owned.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!owned.group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 })

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
      updatedAt: now,
    }

    await owned.ref.update(payload)
    return NextResponse.json({
      group: serializeMailGroup(id, {
        ...owned.group,
        ...payload,
      }),
    })
  } catch (err) {
    console.error('[calendar/mail-groups/[id] PUT]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canManage = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.manageMailGroups,
    })
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const owned = await loadOwnedGroup(auth.user.id, id)
    if (owned.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!owned.group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 })

    await owned.ref.delete()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[calendar/mail-groups/[id] DELETE]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}
