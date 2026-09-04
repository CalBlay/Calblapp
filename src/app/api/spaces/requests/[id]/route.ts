import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { canManageSpaceRequests } from '@/lib/spaces/spaceRequests.server'
import { SPACES_REQUESTS_COLLECTION } from '@/lib/spacesPermissions'
import { buildUnreadIncrement } from '@/lib/messaging/channelUnread'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_LABELS = {
  pending: 'Pendent',
  in_review: 'En revisió',
  accepted: 'Acceptada',
  rejected: 'Rebutjada',
  applied: 'Aplicada',
} as const

type SpaceRequestStatus = keyof typeof STATUS_LABELS

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await canManageSpaceRequests(auth.user))) {
    return NextResponse.json({ error: "No tens permisos per gestionar peticions d'espais." }, { status: 403 })
  }

  const { id } = await ctx.params
  const requestId = String(id || '').trim()
  const body = (await req.json().catch(() => null)) as { status?: string } | null
  const status = String(body?.status || '') as SpaceRequestStatus
  if (!requestId || !(status in STATUS_LABELS)) {
    return NextResponse.json({ error: 'Dades no vàlides.' }, { status: 400 })
  }

  const requestRef = db.collection(SPACES_REQUESTS_COLLECTION).doc(requestId)
  const requestSnap = await requestRef.get()
  if (!requestSnap.exists) {
    return NextResponse.json({ error: 'Petició no trobada.' }, { status: 404 })
  }

  const requestData = requestSnap.data() as Record<string, unknown>
  const channelId = String(requestData.channelId || '').trim()
  if (!channelId) {
    return NextResponse.json({ error: 'La petició no té cap sala Ops vinculada.' }, { status: 409 })
  }

  const now = Date.now()
  const actorName = String(auth.user.name || auth.user.email || 'Gestor Espais').trim()
  const systemBody = `${actorName} ha canviat l'estat a: ${STATUS_LABELS[status]}`
  const messageRef = db.collection('messages').doc()
  const membersSnap = await db.collection('channelMembers').where('channelId', '==', channelId).get()
  const batch = db.batch()

  batch.set(requestRef, {
    status,
    updatedAt: now,
    updatedById: auth.user.id,
    updatedByName: actorName,
    statusHistory: FieldValue.arrayUnion({ status, at: now, byId: auth.user.id, byName: actorName }),
  }, { merge: true })
  batch.set(db.collection('channels').doc(channelId), {
    requestStatus: status,
    updatedAt: now,
    lastMessagePreview: systemBody,
    lastMessageAt: now,
    lastSenderName: actorName,
  }, { merge: true })
  batch.set(messageRef, {
    channelId,
    senderId: auth.user.id,
    senderName: actorName,
    body: systemBody,
    createdAt: now,
    visibility: 'channel',
    targetUserIds: [],
    readCount: 0,
    system: true,
    spaceRequestId: requestId,
    spaceRequestStatus: status,
  })

  const recipientIds: string[] = []
  for (const memberDoc of membersSnap.docs) {
    const member = memberDoc.data() as Record<string, unknown>
    const userId = String(member.userId || '').trim()
    if (!userId || userId === auth.user.id) continue
    recipientIds.push(userId)
    batch.set(memberDoc.ref, buildUnreadIncrement('channel', member), { merge: true })
  }
  await batch.commit()

  try {
    const { getAblyRest } = await import('@/lib/server/ablyRest')
    const rest = getAblyRest()
    await rest.channels.get(`chat:${channelId}`).publish('message', {
      id: messageRef.id,
      channelId,
      senderId: auth.user.id,
      senderName: actorName,
      body: systemBody,
      createdAt: now,
      visibility: 'channel',
      system: true,
    })
    await Promise.all(
      recipientIds.map((userId) =>
        rest.channels.get(`user:${userId}:inbox`).publish('updated', { channelId, at: now })
      )
    )
  } catch {
    // El registre queda desat encara que el temps real no estigui disponible.
  }

  return NextResponse.json({ ok: true, status })
}
