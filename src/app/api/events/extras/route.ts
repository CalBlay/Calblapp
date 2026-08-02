export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  buildEventExtrasDocId,
  getEventStageContext,
  isWeddingLn,
  normalizeEventDay,
  sanitizeExtraEntries,
} from '@/lib/eventExtras'
import { notifyCommercialInternalForEventExtras } from '@/lib/eventExtrasNotifications'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

async function getAuthContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { id?: string; role?: string; department?: string; name?: string | null; email?: string | null }
    | undefined

  if (!user?.id) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }
  const role = normalizeRole(user.role || '')
  const department = role === 'comercial' ? 'comercial' : resolveAuditDepartmentForUser(user.department || '')
  return { user, role, department }
}

function canManageExtras(role: string, department: string | null) {
  if (['admin', 'direccio', 'cap', 'comercial'].includes(role)) return true
  return department === 'serveis'
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(req.url)
    const eventId = String(searchParams.get('eventId') || '').trim()
    const eventDay = normalizeEventDay(searchParams.get('eventDay'))

    if (!eventId) {
      return NextResponse.json({ error: 'eventId es obligatori' }, { status: 400 })
    }

    if (!canManageExtras(auth.role, auth.department)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const stage = await getEventStageContext(eventId)
    const required = auth.department === 'serveis' && isWeddingLn(stage?.lnKey)
    const docId = buildEventExtrasDocId(eventId, eventDay)
    const snap = await firestoreAdmin.collection('event_extras').doc(docId).get()
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null

    return NextResponse.json(
      {
        extras: data
          ? {
              id: snap.id,
              ...data,
            }
          : null,
        required,
        commercialInternal: stage?.commercialInternal || null,
        lnKey: stage?.lnKey || null,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error

    if (!canManageExtras(auth.role, auth.department)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await req.json()) as {
      eventId?: string
      eventDay?: string
      eventSummary?: string
      eventCode?: string
      eventLocation?: string
      entries?: unknown
    }

    const eventId = String(body.eventId || '').trim()
    const eventDay = normalizeEventDay(body.eventDay)
    const eventSummary = String(body.eventSummary || '').replace(/#.*$/, '').trim()
    const eventCode = String(body.eventCode || '').trim()
    const eventLocation = String(body.eventLocation || '').trim()
    const entries = sanitizeExtraEntries(body.entries)

    if (!eventId) {
      return NextResponse.json({ error: 'eventId es obligatori' }, { status: 400 })
    }

    const stage = await getEventStageContext(eventId)
    const required = auth.department === 'serveis' && isWeddingLn(stage?.lnKey)
    if (!required) {
      return NextResponse.json(
        { error: 'Els extres nomes estan disponibles per auditories de serveis en casaments' },
        { status: 400 }
      )
    }
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Cal registrar almenys un extra' }, { status: 400 })
    }

    const now = Date.now()
    const docId = buildEventExtrasDocId(eventId, eventDay)
    await firestoreAdmin.collection('event_extras').doc(docId).set(
      {
        eventId,
        eventDay: eventDay || null,
        eventSummary: eventSummary || stage?.summary || null,
        eventCode: eventCode || stage?.eventCode || null,
        eventLocation: eventLocation || stage?.location || null,
        lnKey: stage?.lnKey || null,
        commercialInternal: stage?.commercialInternal || null,
        entries,
        entriesCount: entries.length,
        updatedAt: now,
        updatedById: auth.user.id,
        updatedByName: auth.user.name || auth.user.email || 'Usuari',
      },
      { merge: true }
    )

    const origin = new URL(req.url).origin
    const notification = await notifyCommercialInternalForEventExtras({
      commercialInternalName: stage?.commercialInternal || null,
      baseUrl: origin,
      eventId,
      eventCode: eventCode || stage?.eventCode || null,
      eventSummary: eventSummary || stage?.summary || null,
      eventDay: eventDay || null,
      entriesCount: entries.length,
      createdByName: auth.user.name || auth.user.email || 'Usuari',
    })

    return NextResponse.json(
      {
        ok: true,
        extras: {
          id: docId,
          eventId,
          eventDay: eventDay || null,
          eventSummary: eventSummary || stage?.summary || null,
          eventCode: eventCode || stage?.eventCode || null,
          eventLocation: eventLocation || stage?.location || null,
          lnKey: stage?.lnKey || null,
          commercialInternal: stage?.commercialInternal || null,
          entries,
          entriesCount: entries.length,
          updatedAt: now,
        },
        notification,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
