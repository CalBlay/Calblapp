// src/app/api/user-requests/[id]/approve/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { incrementUserUnreadCount } from '@/lib/notifications/unreadCounts'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'

import { normalizeRole } from '@/lib/roles'
import { saveUserAccessAssignment } from '@/lib/server/userAccessAssignment'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { stripPassword } from '@/lib/server/userApiSerialization'
import type { UserAccessAssignmentInput } from '@/lib/permissions/types'

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normLower = (s?: string) =>
  unaccent((s || '').toString().trim()).toLowerCase()

const isTreballador = (role?: string) => normLower(role) === 'treballador'
const isCapDepartament = (role?: string) => normalizeRole(role) === 'cap'
const requiresCorporateEmail = (role?: string, isAdmin?: boolean) =>
  Boolean(isAdmin) || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

interface UserRequest {
  status?: string
  createdAt?: number
  updatedAt?: number
  requestedByUserId?: string | null
  requestedByName?: string | null
  email?: string | null
  phone?: string | null
}

interface Personnel {
  name?: string
  department?: string
  departmentLower?: string
  email?: string
  phone?: string
  available?: boolean
  isDriver?: boolean
  workerRank?: string
}

interface UserDoc {
  name?: string
}

async function notifyRequester(params: {
  requesterId?: string | null
  title: string
  body: string
  personId: string
  baseUrl: string
}) {
  const { requesterId, title, body, personId } = params
  if (!requesterId) return

  try {
    const doc = await firestoreAdmin.collection('users').doc(requesterId).get()
    if (!doc.exists) return

    await doc.ref.collection('notifications').add({
      title,
      body,
      createdAt: Date.now(),
      read: false,
      type: 'user_request_result',
      personId,
    })
    await incrementUserUnreadCount(requesterId, 'user_request_result', 1)

    if (hasAblyApiKey()) {
      try {
        const rest = getAblyRest()
        const channel = rest.channels.get(`user:${requesterId}:notifications`)
        await channel.publish('created', {
          type: 'user_request_result',
          personId,
          createdAt: Date.now(),
        })
      } catch (err) {
        console.error('[approve user request] Ably publish error', err)
      }
    }

    try {
      await sendPushToUsers([requesterId], {
        title,
        body,
        url: '/menu/personnel',
      })
    } catch (err) {
      console.error('Error enviant push al requester:', err)
    }
  } catch (err) {
    console.error('Error notificació requester:', err)
  }
}

async function usernameExists(username: string, excludeId?: string) {
  const snap = await firestoreAdmin
    .collection('users')
    .where('name', '==', username)
    .get()

  const conflict = snap.docs.find(
    d =>
      d.id !== excludeId &&
      normLower((d.data() as UserDoc).name) === normLower(username)
  )

  return Boolean(conflict)
}


type ApproveBody = {
  password?: string
  name?: string
  role?: string
  isAdmin?: boolean
  department?: string
  commercialName?: string
  email?: string
  phone?: string
  opsEventsConfigurable?: boolean
  opsEventsEnabled?: boolean
  opsProjectsConfigurable?: boolean
  opsChannelsConfigurable?: string[]
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  accessAssignment?: UserAccessAssignmentInput
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const roleNorm = normalizeRole((session.user?.role as string | undefined) || '')
  if (roleNorm !== 'admin') {
    return NextResponse.json({ success: false, error: 'Només Admin' }, { status: 403 })
  }

  const adminUserId = String((session.user as { id?: string })?.id || '').trim()
  const personId = ctx.params.id

  try {
    const body = (await req.json().catch(() => ({}))) as ApproveBody
    const { password: passwordFromBody } = body
    console.log('[approve] Inici aprovació per personId:', personId)

    const reqRef = firestoreAdmin.collection('userRequests').doc(personId)
    const reqSnap = await reqRef.get()
    if (!reqSnap.exists) {
      console.error('[approve] Sol·licitud no trobada:', personId)
      return NextResponse.json(
        { success: false, error: 'Sol·licitud no trobada' },
        { status: 404 }
      )
    }
    const reqData = reqSnap.data() as UserRequest | undefined
    console.log('[approve] Dades de la sol·licitud:', reqData)

    // Si l'usuari ja existeix, només marquem aprovat
    const userRef = firestoreAdmin.collection('users').doc(personId)
    const userDoc = await userRef.get()
    if (userDoc.exists) {
      console.warn('[approve] Usuari ja existia, no es crearà de nou:', personId)
      await reqRef.set({ status: 'approved', updatedAt: Date.now() }, { merge: true })
      return NextResponse.json({ success: true, alreadyExists: true, user: userDoc.data() })
    }

    // Reaprofitem dades de personnel
    const personSnap = await firestoreAdmin.collection('personnel').doc(personId).get()
    if (!personSnap.exists) {
      console.error('[approve] Personal no trobat:', personId)
      return NextResponse.json(
        { success: false, error: 'Personal no trobat' },
        { status: 404 }
      )
    }
    const p = personSnap.data() as Personnel | undefined
    console.log('[approve] Dades de personnel:', p)

    const role = (body.role || 'Treballador').toString().trim()
    const isAdmin = Boolean(body.isAdmin || normalizeRole(role) === 'admin')
    const department = (body.department || p?.department || '').toString().trim()
    const desiredUsername = (body.name || p?.name || reqData?.requestedByName || personId)
      .toString()
      .trim()
    const email = (body.email ?? p?.email ?? reqData?.email ?? null)?.toString().trim() || null
    const phone = (body.phone ?? p?.phone ?? reqData?.phone ?? null)?.toString().trim() || null

    if (requiresCorporateEmail(role, isAdmin) && !email) {
      return NextResponse.json(
        { success: false, error: 'Email corporatiu obligatori per admin, direccio i caps de departament' },
        { status: 400 }
      )
    }

    if (await usernameExists(desiredUsername, personId)) {
      return NextResponse.json(
        { success: false, error: "Nom d'usuari ja existeix", code: 'username_taken' },
        { status: 409 }
      )
    }

    const passwordPlain =
      (passwordFromBody || '').toString().trim() || Math.random().toString(36).slice(-8)

    const commercialName = (body.commercialName || '').toString().trim()
    const departmentLower = normLower(department || p?.departmentLower)

    // Payload per crear usuari nou
    const userPayload: Record<string, unknown> = {
      name: desiredUsername,
      nameFold: normLower(desiredUsername),
      password: passwordPlain,
      role,
      isAdmin,
      department,
      departmentLower,
      commercialName: commercialName || undefined,
      commercialNameFold: commercialName ? normLower(commercialName) : undefined,
      email,
      phone,
      userId: personId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      opsEventsConfigurable: Boolean(body.opsEventsConfigurable),
      opsEventsEnabled: Boolean(body.opsEventsEnabled),
      opsProjectsConfigurable:
        typeof body.opsProjectsConfigurable === 'boolean' ? body.opsProjectsConfigurable : true,
      opsChannelsConfigurable: Array.isArray(body.opsChannelsConfigurable)
        ? body.opsChannelsConfigurable.map(String).filter(Boolean)
        : [],
      canRespondSurveys: Boolean(body.canRespondSurveys),
      isDepartmentRobaLead: Boolean(body.isDepartmentRobaLead),
      isTransportLead:
        isCapDepartament(role) && departmentLower === 'logistica'
          ? Boolean(body.isTransportLead)
          : false,
      available:
        isTreballador(role) || isCapDepartament(role)
          ? (body.available ?? p?.available ?? true)
          : undefined,
      isDriver:
        isTreballador(role) || isCapDepartament(role)
          ? (body.isDriver ?? p?.isDriver ?? false)
          : undefined,
      workerRank:
        isTreballador(role) || isCapDepartament(role)
          ? (body.workerRank || p?.workerRank || 'equip')
          : undefined,
    }

    const cleanedPayload = Object.fromEntries(
      Object.entries(userPayload).filter(([, v]) => v !== undefined)
    )

    console.log('[approve] Creant usuari a Firestore.users:', stripPassword(cleanedPayload))

    // Crear usuari amb docId = personId
    await userRef.set(cleanedPayload, { merge: true })

    if (body.accessAssignment && adminUserId) {
      await saveUserAccessAssignment({
        userId: personId,
        role,
        department,
        overrides: body.accessAssignment.overrides ?? [],
        updatedBy: adminUserId,
      })
    }

    // Sincronitzar personnel si cal
    if (isTreballador(role) || isCapDepartament(role)) {
      const personRef = firestoreAdmin.collection('personnel').doc(personId)
      const isCap = isCapDepartament(role)
      await personRef.set(
        {
          id: personId,
          name: desiredUsername,
          department,
          departmentLower,
          role: isCap ? 'responsable' : 'treballador',
          available: (cleanedPayload.available as boolean | undefined) ?? true,
          isDriver: (cleanedPayload.isDriver as boolean | undefined) ?? false,
          workerRank: isCap
            ? 'responsable'
            : ((cleanedPayload.workerRank as string | undefined) ?? 'equip'),
          email,
          phone,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    }

    // Actualitzar sol·licitud com aprovada
    await reqRef.set({ status: 'approved', updatedAt: Date.now() }, { merge: true })

    console.log('[approve] Usuari creat i sol·licitud marcada com aprovada:', personId)

    await notifyRequester({
      requesterId: reqData?.requestedByUserId,
      title: 'Usuari aprovat',
      body: `S'ha creat l'usuari ${userPayload.name}. Contacta amb administració per obtenir la contrasenya d'accés.`,
      personId,
      baseUrl: req.nextUrl.origin,
    })

    return NextResponse.json({
      success: true,
      user: stripPassword({ id: personId, ...cleanedPayload }),
    })
  } catch (error: unknown) {
    console.error('[approve user request] error:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
