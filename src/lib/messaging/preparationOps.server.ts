import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { worksInDepartment } from '@/lib/additionalWorkDepartments'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import { PREPARATION_WAREHOUSE_LABELS } from '@/lib/logistics/preparationWarehouses'

const SOURCE_COLLECTIONS = ['logistics_preparation_services', 'stage_verd'] as const

type PreparationSourceCollection = (typeof SOURCE_COLLECTIONS)[number]

export type PreparationOpsRoom = {
  roomId: string
  label: string
  channelId: string
  channelReady: boolean
  unreadCount: number
  warehouseCode: PreparationWarehouseCode
  warehouseName: string
  canManageMembers: false
}

function clean(value: unknown, max = 200) {
  return String(value ?? '').trim().slice(0, max)
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function channelIdFor(
  sourceCollection: PreparationSourceCollection,
  rowId: string,
  warehouseCode: PreparationWarehouseCode
) {
  return `logistics_prep_${sourceCollection}_${safeId(rowId)}_${warehouseCode}`
}

async function findPreparationSource(rowId: string) {
  for (const sourceCollection of SOURCE_COLLECTIONS) {
    const snap = await db.collection(sourceCollection).doc(rowId).get()
    if (snap.exists) {
      return {
        sourceCollection,
        data: (snap.data() || {}) as Record<string, unknown>,
      }
    }
  }
  throw new Error('No s\'ha trobat l\'esdeveniment de preparació.')
}

function sourceLabel(data: Record<string, unknown>, rowId: string) {
  const code = clean(data.EventCode ?? data.eventCode ?? data.Codi ?? data.code)
  const name = clean(
    data.PreparacioNomEvent ??
      data.NomEvent ??
      data.eventName ??
      data.name ??
      data.ServiceName
  ) || rowId
  return { code, name }
}

async function unreadCount(channelId: string, userId: string) {
  const snap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .where('userId', '==', userId)
    .limit(1)
    .get()
  return snap.empty ? 0 : Math.max(0, Number(snap.docs[0].data().unreadCount) || 0)
}

async function productionMembers() {
  const snap = await db.collection('users').get()
  return snap.docs.flatMap((doc) => {
    const data = doc.data() as Record<string, unknown>
    if (data.active === false || data.isActive === false || data.disabled === true) return []
    if (!worksInDepartment(data, 'Producció')) return []
    return [{
      userId: doc.id,
      userName: clean(data.name ?? data.displayName ?? data.email) || doc.id,
    }]
  })
}

export async function getPreparationOpsRoom(params: {
  rowId: string
  warehouseCode: PreparationWarehouseCode
  userId: string
}): Promise<PreparationOpsRoom> {
  const source = await findPreparationSource(params.rowId)
  const warehouseName = PREPARATION_WAREHOUSE_LABELS[params.warehouseCode]
  const meta = sourceLabel(source.data, params.rowId)
  const channelId = channelIdFor(source.sourceCollection, params.rowId, params.warehouseCode)
  const channelSnap = await db.collection('channels').doc(channelId).get()

  return {
    roomId: `${params.rowId}--${params.warehouseCode}`,
    label: `${warehouseName} · ${meta.code || meta.name}`,
    channelId,
    channelReady: channelSnap.exists,
    unreadCount: channelSnap.exists ? await unreadCount(channelId, params.userId) : 0,
    warehouseCode: params.warehouseCode,
    warehouseName,
    canManageMembers: false,
  }
}

export async function ensurePreparationOpsChannel(params: {
  rowId: string
  warehouseCode: PreparationWarehouseCode
  actor: { id: string; name?: string | null }
}) {
  const source = await findPreparationSource(params.rowId)
  const warehouseName = PREPARATION_WAREHOUSE_LABELS[params.warehouseCode]
  const meta = sourceLabel(source.data, params.rowId)
  const channelId = channelIdFor(source.sourceCollection, params.rowId, params.warehouseCode)
  const channelRef = db.collection('channels').doc(channelId)
  const [channelSnap, existingMembersSnap, production] = await Promise.all([
    channelRef.get(),
    db.collection('channelMembers').where('channelId', '==', channelId).get(),
    productionMembers(),
  ])
  const now = Date.now()
  const actorName = clean(params.actor.name) || params.actor.id
  const members = new Map<string, { userId: string; userName: string }>()
  for (const doc of existingMembersSnap.docs) {
    const data = doc.data() as Record<string, unknown>
    const userId = clean(data.userId)
    if (!userId) continue
    members.set(userId, { userId, userName: clean(data.userName) || userId })
  }
  for (const member of production) members.set(member.userId, member)
  members.set(params.actor.id, { userId: params.actor.id, userName: actorName })

  await channelRef.set({
    name: `Preparació · ${meta.code || meta.name} · ${warehouseName}`,
    type: 'group',
    source: 'logistics_preparation',
    eventRowId: params.rowId,
    eventCode: meta.code || null,
    eventTitle: meta.name,
    warehouseCode: params.warehouseCode,
    warehouseName,
    preparationSourceCollection: source.sourceCollection,
    status: 'active',
    updatedAt: now,
    ...(channelSnap.exists ? {} : {
      createdAt: now,
      createdBy: params.actor.id,
      lastMessageAt: 0,
      lastMessagePreview: '',
    }),
  }, { merge: true })

  const batch = db.batch()
  for (const member of members.values()) {
    const ref = db.collection('channelMembers').doc(`${channelId}_${member.userId}`)
    const existing = existingMembersSnap.docs.find(
      (doc) => clean(doc.data().userId) === member.userId
    )?.data() as Record<string, unknown> | undefined
    batch.set(ref, {
      channelId,
      userId: member.userId,
      userName: member.userName,
      role: 'member',
      joinedAt: Number(existing?.joinedAt || now),
      unreadCount: Number(existing?.unreadCount || 0),
      muted: Boolean(existing?.muted),
      hidden: Boolean(existing?.hidden),
      notify: existing?.notify !== false,
    }, { merge: true })
  }
  await batch.commit()

  return { channelId, memberCount: members.size }
}
