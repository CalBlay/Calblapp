import { after, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import {
  SPACES_BBDD_PATH,
  SPACES_REQUESTS_COLLECTION,
} from '@/lib/spacesPermissions'
import { resolveSpaceRequestManagers } from '@/lib/spaces/spaceRequests.server'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RequestBody = {
  type?: 'new' | 'update'
  spaceId?: string
  spaceName?: string
  requestedName?: string
  subject?: string
  description?: string
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const canView = await canViewUiPath({ user: auth.user, path: SPACES_BBDD_PATH })
  if (!canView) {
    return NextResponse.json({ error: "No tens permisos per consultar espais." }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null
  const requestType = body?.type === 'update' ? 'update' : body?.type === 'new' ? 'new' : null
  const description = String(body?.description || '').trim()
  const requestedName = String(body?.requestedName || '').trim()
  const subject = String(body?.subject || '').trim()
  const spaceId = String(body?.spaceId || '').trim()

  if (!requestType || description.length < 5) {
    return NextResponse.json({ error: 'Indica el tipus i una descripció de la petició.' }, { status: 400 })
  }
  if (requestType === 'new' && !requestedName) {
    return NextResponse.json({ error: "Indica el nom del nou espai." }, { status: 400 })
  }
  if (requestType === 'update' && !spaceId) {
    return NextResponse.json({ error: "Selecciona l'espai que vols modificar." }, { status: 400 })
  }

  let spaceName = String(body?.spaceName || '').trim()
  if (requestType === 'update') {
    const spaceSnap = await db.collection('finques').doc(spaceId).get()
    if (!spaceSnap.exists) {
      return NextResponse.json({ error: 'Espai no trobat.' }, { status: 404 })
    }
    spaceName = String(spaceSnap.get('nom') || spaceSnap.id).trim()
  }

  const managers = await resolveSpaceRequestManagers()
  if (managers.length === 0) {
    return NextResponse.json(
      { error: "No hi ha cap gestor amb permisos per rebre peticions d'espais." },
      { status: 409 }
    )
  }

  const now = Date.now()
  const requesterId = auth.user.id
  const requesterName = String(auth.user.name || auth.user.email || 'Usuari').trim()
  const requestRef = db.collection(SPACES_REQUESTS_COLLECTION).doc()
  const channelId = `space-request-${requestRef.id}`
  const channelRef = db.collection('channels').doc(channelId)
  const messageRef = db.collection('messages').doc()
  const targetName = requestType === 'new' ? requestedName : spaceName
  const requestLabel = requestType === 'new' ? 'Nou espai' : 'Modificació'
  const channelTitle = `${requestLabel} · ${targetName}`
  const messageBody = [subject || channelTitle, description].filter(Boolean).join('\n\n')
  const memberMap = new Map(managers.map((manager) => [manager.id, manager.name]))
  memberMap.set(requesterId, requesterName)

  const batch = db.batch()
  batch.set(requestRef, {
    type: requestType,
    status: 'pending',
    spaceId: requestType === 'update' ? spaceId : null,
    spaceName: requestType === 'update' ? spaceName : null,
    requestedName: requestType === 'new' ? requestedName : null,
    subject: subject || channelTitle,
    description,
    requesterId,
    requesterName,
    channelId,
    createdAt: now,
    updatedAt: now,
  })
  batch.set(channelRef, {
    name: channelTitle,
    type: 'group',
    source: 'spaces',
    location: channelTitle,
    spaceRequestId: requestRef.id,
    spaceId: requestType === 'update' ? spaceId : null,
    requestType,
    requestStatus: 'pending',
    requesterUserId: requesterId,
    requesterUserName: requesterName,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: description.slice(0, 180),
    lastMessageAt: now,
    lastSenderName: requesterName,
  })
  batch.set(messageRef, {
    channelId,
    senderId: requesterId,
    senderName: requesterName,
    body: messageBody,
    createdAt: now,
    visibility: 'channel',
    targetUserIds: [],
    readCount: 0,
    spaceRequestId: requestRef.id,
  })

  for (const [userId, userName] of memberMap) {
    const isRequester = userId === requesterId
    batch.set(db.collection('channelMembers').doc(`${channelId}_${userId}`), {
      channelId,
      userId,
      userName,
      role: managers.some((manager) => manager.id === userId) ? 'manager' : 'member',
      joinedAt: now,
      unreadCount: isRequester ? 0 : 1,
      directUnreadCount: 0,
      channelUnreadCount: isRequester ? 0 : 1,
      muted: false,
      hidden: false,
      notify: true,
    })
  }
  await batch.commit()

  const managerIds = managers.map((manager) => manager.id).filter((id) => id !== requesterId)
  const url = `/menu/missatgeria?channel=${encodeURIComponent(channelId)}`
  after(async () => {
    await Promise.allSettled([
      sendPushToUsers(managerIds, {
        title: "Nova petició d'espais",
        body: channelTitle,
        url,
      }),
      (async () => {
        const { getAblyRest } = await import('@/lib/server/ablyRest')
        const rest = getAblyRest()
        await rest.channels.get(`chat:${channelId}`).publish('message', {
          id: messageRef.id,
          channelId,
          senderId: requesterId,
          senderName: requesterName,
          body: messageBody,
          createdAt: now,
          visibility: 'channel',
        })
        await Promise.all(
          managerIds.map((userId) =>
            rest.channels.get(`user:${userId}:inbox`).publish('updated', { channelId, at: now })
          )
        )
      })(),
    ])
  })

  return NextResponse.json({ ok: true, requestId: requestRef.id, channelId, url }, { status: 201 })
}
