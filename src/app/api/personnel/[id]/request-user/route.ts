// src/app/api/personnel/[id]/request-user/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'
import { normalizeRole } from '@/lib/roles'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { canViewUiPath } from '@/lib/server/permissions'

interface SessionUser {
  id?: string
  userId?: string
  name?: string
  role?: string
  department?: string
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean
  isTransportLead?: boolean
  [key: string]: unknown
}

interface PersonnelDoc {
  name?: string
  role?: string
  department?: string
  departmentLower?: string
  workerRank?: string | null
  email?: string | null
  phone?: string | null
  maxHoursWeek?: number | null
  driver?: {
    isDriver: boolean
    camioGran: boolean
    camioPetit: boolean
  }
  available?: boolean
  [key: string]: unknown
}

interface UserRequestDoc {
  personId: string
  departmentLower: string
  department?: string | null
  requestedByUserId: string | null
  requestedByName: string | null
  email?: string | null
  phone?: string | null
  maxHoursWeek?: number | null
  createdAt: number
  updatedAt: number
  status: 'pending' | 'approved' | 'rejected'
  name: string
  role: string
  workerRank?: string | null
  driver: PersonnelDoc['driver']
  available: boolean
}

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normLower = (s?: string) => unaccent((s || '').toString().trim()).toLowerCase()

const requiredFields = ['name', 'role', 'department'] as const

function findMissingFields(person: PersonnelDoc) {
  const missing: string[] = []
  const isEmpty = (v?: unknown) => {
    if (v === undefined || v === null) return true
    if (typeof v === 'string' && v.trim() === '') return true
    return false
  }

  requiredFields.forEach((field) => {
    if (isEmpty((person as Record<string, unknown>)[field])) missing.push(field)
  })

  const dept = normLower(person.department || person.departmentLower)
  const deptRaw = normLower(`${person.department || ''} ${person.departmentLower || ''}`)
  const isServeis = dept.includes('servei') || deptRaw.includes('servei')
  if (person.driver?.isDriver && !isServeis) {
    const hasType = person.driver.camioGran || person.driver.camioPetit
    if (!hasType) missing.push('driverType')
  }

  return missing
}

function userRequestNotificationDocId(personId: string) {
  return `user_request__${String(personId || '').trim()}`
}

async function notifyAdmins(params: {
  title: string
  body: string
  personId: string
  requesterName: string
  department: string
}) {
  const { title, body, personId, requesterName, department } = params
  const notifDocId = userRequestNotificationDocId(personId)

  const snap = await firestoreAdmin.collection('users').get()
  const admins = snap.docs.filter((d) => {
    const data = d.data() as { role?: string }
    return normalizeRole(String(data.role || '')) === 'admin'
  })

  if (!admins.length) return

  const now = Date.now()
  const batch = firestoreAdmin.batch()
  const adminsToAlert: string[] = []

  for (const d of admins) {
    const notifRef = d.ref.collection('notifications').doc(notifDocId)
    const existing = await notifRef.get()
    const wasUnread =
      existing.exists && (existing.data() as { read?: boolean }).read === false

    batch.set(notifRef, {
      title,
      body,
      createdAt: now,
      read: false,
      type: 'user_request',
      personId,
      requesterName,
      department,
    })

    if (!wasUnread) adminsToAlert.push(d.id)
  }

  await batch.commit()

  if (adminsToAlert.length > 0) {
    const { afterNotificationsCommitted } = await import('@/lib/notifications/writeUserNotification')
    await afterNotificationsCommitted(
      adminsToAlert.map((userId) => ({ userId, type: 'user_request' }))
    )
  }

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      const channel = rest.channels.get('admin:user-requests')
      await channel.publish('created', {
        personId,
        requesterName,
        department,
        createdAt: now,
      })
    } catch (err) {
      console.error('[request-user] Ably publish error', err)
    }
  } else {
    console.warn('[request-user] Missing ABLY_API_KEY, skipping realtime')
  }

  if (adminsToAlert.length > 0) {
    try {
      await sendPushToUsers(adminsToAlert, {
        title: 'Nova sollicitud d usuari',
        body: `${requesterName} ha enviat una sollicitud.`,
        url: '/menu/users',
      })
    } catch (err) {
      console.error('[request-user] push error:', err)
    }
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const personId = id

  const su = session.user as SessionUser
  const requesterId = String(su.id || su.userId || '').trim()
  const requesterName = String(su.name || '-').trim() || '-'

  try {
    if (!requesterId) {
      return NextResponse.json({ success: false, error: 'Usuari de sessio invalid' }, { status: 400 })
    }

    const canRequestFromPersonnel = await canViewUiPath({
      user: {
        id: requesterId,
        role: su.role,
        department: su.department,
        canRespondSurveys: Boolean(su.canRespondSurveys),
        isDepartmentRobaLead: Boolean(su.isDepartmentRobaLead),
        robaLinkedPersonnelId:
          typeof su.robaLinkedPersonnelId === 'string' ? su.robaLinkedPersonnelId : null,
        opsProjectsConfigurable:
          typeof su.opsProjectsConfigurable === 'boolean' ? su.opsProjectsConfigurable : undefined,
        isTransportLead: Boolean(su.isTransportLead),
      },
      path: '/menu/personnel',
    })

    if (!canRequestFromPersonnel) {
      return NextResponse.json({ success: false, error: 'Permis denegat' }, { status: 403 })
    }

    const personSnap = await firestoreAdmin.collection('personnel').doc(personId).get()
    if (!personSnap.exists) {
      return NextResponse.json({ success: false, error: 'No existeix el personal' }, { status: 404 })
    }
    const p = personSnap.data() as PersonnelDoc

    const missing = findMissingFields(p)
    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Falten camps obligatoris per sollicitar usuari: ${missing.join(', ')}`,
          missing,
        },
        { status: 400 }
      )
    }

    const userDoc = await firestoreAdmin.collection('users').doc(personId).get()
    if (userDoc.exists) {
      return NextResponse.json({ success: false, error: 'Aquest treballador ja te usuari' }, { status: 409 })
    }

    const reqRef = firestoreAdmin.collection('userRequests').doc(personId)
    const now = Date.now()
    const payload: UserRequestDoc = {
      personId,
      departmentLower: normLower(p.departmentLower || p.department),
      department: p.department || null,
      requestedByUserId: requesterId || null,
      requestedByName: requesterName || null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      maxHoursWeek: p.maxHoursWeek ?? null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      name: p.name || '',
      role: p.role || 'equip',
      workerRank: p.workerRank || null,
      driver: p.driver || {
        isDriver: false,
        camioGran: false,
        camioPetit: false,
      },
      available: p.available ?? true,
    }

    let alreadyPending = false
    await firestoreAdmin.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef)
      const existing = reqSnap.data() as UserRequestDoc | undefined
      if (reqSnap.exists && existing?.status === 'pending') {
        alreadyPending = true
        return
      }
      tx.set(reqRef, payload, { merge: true })
    })

    if (alreadyPending) {
      return NextResponse.json({ success: true, alreadyPending: true, status: 'pending' })
    }

    await notifyAdmins({
      title: 'Nova sollicitud d usuari',
      body: `${requesterName} demana crear usuari per a ${p.name || personId} (${p.department || ''}).`,
      personId,
      requesterName,
      department: p.department || '',
    })

    return NextResponse.json({ success: true, status: 'pending' })
  } catch (e: unknown) {
    console.error('[request-user] error:', e)
    if (e instanceof Error) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
    return NextResponse.json({ success: false, error: 'Error intern' }, { status: 500 })
  }
}
