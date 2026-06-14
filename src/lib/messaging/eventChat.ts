import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

type EventInfo = {
  id: string
  code: string
  name: string
  startDate: string
  endDate: string
  location: string
  commercialName: string
}

type AssignedUser = { id?: string; name?: string }

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string | null) => unaccent(String(s || '')).toLowerCase().trim()
const dayKey = (iso?: string | null) => (iso || '').slice(0, 10)

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

const normalizeCode = (raw?: string | null) =>
  String(raw || '').trim().toUpperCase()

const isValidEventCode = (code?: string | null) => {
  const c = normalizeCode(code)
  return Boolean(c)
}

const hasFirestoreToDate = (v: unknown): v is { toDate: () => Date } =>
  typeof v === 'object' &&
  v !== null &&
  'toDate' in v &&
  typeof (v as { toDate?: unknown }).toDate === 'function'

const extractCommercialName = (data: Record<string, unknown>): string => {
  const keys = [
    'Comercial',
    'COMERCIAL',
    'comercial',
    'comercialNom',
    'Comercial_nom',
    'Commercial',
    'Sales',
    'ResponsableComercial',
    'ComercialName',
    'ComercialNom',
  ] as const
  for (const k of keys) {
    const v = data[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

async function fetchEventInfo(eventId: string): Promise<EventInfo | null> {
  const snap = await db.collection('stage_verd').doc(String(eventId)).get()
  if (!snap.exists) return null
  const data = snap.data() as Record<string, unknown>

  const code =
    data?.code ||
    data?.Code ||
    data?.C_digo ||
    data?.codi ||
    data?.Codi ||
    ''
  if (!isValidEventCode(String(code ?? ''))) return null

  const name = data?.NomEvent || data?.eventName || data?.name || ''
  const startDate = data?.DataInici || data?.startDate || ''
  const endDate = data?.DataFi || data?.endDate || startDate
  const location = data?.Ubicacio || data?.location || ''
  const commercialName = extractCommercialName(data)

  return {
    id: String(eventId),
    code: String(code),
    name: String(name),
    startDate: String(startDate),
    endDate: String(endDate),
    location: String(location),
    commercialName: String(commercialName || ''),
  }
}

async function lookupUidForAssigned(user: AssignedUser): Promise<string | null> {
  const rawId = String(user?.id || '').trim()
  if (!rawId) return null

  const direct = await db.collection('users').doc(rawId).get()
  if (direct.exists) return rawId

  const q = await db.collection('users').where('userId', '==', rawId).limit(1).get()
  if (!q.empty) return q.docs[0].id

  return null
}

async function lookupUidByName(name?: string | null): Promise<string | null> {
  const rawName = String(name || '').trim()
  if (!rawName) return null

  let q = await db.collection('users').where('name', '==', rawName).limit(1).get()
  if (!q.empty) return q.docs[0].id

  q = await db.collection('personnel').where('name', '==', rawName).limit(1).get()
  if (!q.empty) {
    const personId = q.docs[0].id
    const userDoc = await db.collection('users').doc(personId).get()
    if (userDoc.exists) return userDoc.id
  }

  return null
}

async function lookupUidByNameLoose(name?: string | null): Promise<string | null> {
  const rawName = String(name || '').trim()
  if (!rawName) return null

  const exact = await lookupUidByName(rawName)
  if (exact) return exact

  const target = norm(rawName)
  if (!target) return null

  const usersSnap = await db.collection('users').get()
  for (const doc of usersSnap.docs) {
    const data = doc.data() as Record<string, unknown>
    const candidates = [
      data?.name,
      data?.fullName,
      data?.displayName,
      data?.nom,
      data?.Nom,
    ]
    for (const c of candidates) {
      if (norm(String(c ?? '')) === target) return doc.id
    }
  }

  const personnelSnap = await db.collection('personnel').get()
  for (const doc of personnelSnap.docs) {
    const data = doc.data() as Record<string, unknown>
    const candidates = [data?.name, data?.fullName, data?.displayName, data?.nom, data?.Nom]
    if (candidates.some((c) => norm(String(c ?? '')) === target)) {
      const userDoc = await db.collection('users').doc(doc.id).get()
      if (userDoc.exists) return userDoc.id
    }
  }

  return null
}

async function resolveUid(user: AssignedUser): Promise<string | null> {
  const byId = await lookupUidForAssigned(user)
  if (byId) return byId
  return lookupUidByName(user?.name)
}

async function resolveUids(users: AssignedUser[]): Promise<string[]> {
  if (!users.length) return []
  const raw = await Promise.all(users.map((u) => resolveUid(u)))
  return Array.from(new Set(raw.filter(Boolean) as string[]))
}

function extractAssignedUsers(q: Record<string, unknown>): AssignedUser[] {
  const out: AssignedUser[] = []
  const push = (u?: AssignedUser | null) => {
    if (!u) return
    if (!u.id && !u.name) return
    out.push({ id: u.id, name: u.name })
  }
  const pushArr = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    arr.forEach((item) => {
      if (typeof item === 'string') push({ name: item })
      else if (item && typeof item === 'object') {
        const o = item as { id?: string; userId?: string; name?: string }
        push({ id: o.id || o.userId, name: o.name })
      }
    })
  }

  if (q?.responsableName) push({ name: String(q.responsableName) })
  const responsable = q?.responsable as { name?: string } | undefined
  if (responsable?.name) push({ name: responsable.name })
  pushArr(q?.responsables)
  pushArr(q?.treballadors)
  pushArr(q?.workers)
  pushArr(q?.conductors)

  return out
}

function isConfirmedQuadrant(data: Record<string, unknown>): boolean {
  const status = String(data?.status ?? '').toLowerCase()
  const confirmedAtVal = data?.confirmedAt
  const confirmedAt = hasFirestoreToDate(confirmedAtVal)
    ? confirmedAtVal.toDate()
    : confirmedAtVal
  return (
    status === 'confirmed' ||
    Boolean(confirmedAt) ||
    Boolean(data?.confirmada) ||
    Boolean(data?.confirmed)
  )
}

async function collectQuadrantAssigned(
  eventId: string,
  eventCode: string,
  eventName: string,
  dateKeyValue: string
) {
  const quadrantCollections = [
    'quadrantsServeis',
    'quadrantsLogistica',
    'quadrantsCuina',
    'quadrantsProduccio',
    'quadrantsComercial',
  ]

  const normCode = (value?: string | null) =>
    (value ? unaccent(String(value)).toLowerCase().trim().replace(/\s+/g, '') : '')
  const eventNameNorm = norm(eventName)
  const users: AssignedUser[] = []
  const seenDocs = new Set<string>()

  const matchesEvent = (data: Record<string, unknown>) => {
    if (normalizeEventId(String(data.eventId || '')) === normalizeEventId(eventId)) {
      return true
    }
    if (eventCode && data.code && normCode(String(data.code)) === normCode(eventCode)) {
      return true
    }
    if (data.eventName && norm(String(data.eventName)) === eventNameNorm) return true
    return false
  }

  const pushDocs = (snap: FirebaseFirestore.QuerySnapshot | null) => {
    if (!snap || snap.empty) return
    snap.forEach((doc) => {
      if (seenDocs.has(doc.id)) return
      const data = doc.data() as Record<string, unknown>
      if (!matchesEvent(data)) return
      if (!isConfirmedQuadrant(data)) return
      seenDocs.add(doc.id)
      users.push(...extractAssignedUsers(data))
    })
  }

  for (const coll of quadrantCollections) {
    const ref = db.collection(coll)
    const byId = await ref.where('eventId', '==', eventId).get().catch(() => null)
    pushDocs(byId)
    if (byId && !byId.empty) continue

    const [byCode, byDate] = await Promise.all([
      eventCode ? ref.where('code', '==', eventCode).get().catch(() => null) : Promise.resolve(null),
      dateKeyValue
        ? ref.where('startDate', '==', dateKeyValue).get().catch(() => null)
        : Promise.resolve(null),
    ])
    pushDocs(byCode)
    pushDocs(byDate)
  }

  return users
}

async function collectProductionCapUids() {
  const snap = await db.collection('users').get()
  const out: string[] = []
  snap.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>
    const dept = normalizeDept(String(data.department || data.departmentLower || ''))
    const role = normalizeRole(String(data.role || data.rol || data.nivell || ''))
    if (dept !== 'produccio' || role !== 'cap') return
    out.push(doc.id)
  })
  return out
}

async function fetchUserDisplayNames(uids: string[]) {
  const map = new Map<string, string>()
  const unique = [...new Set(uids.filter(Boolean))]
  const chunkSize = 10
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const refs = chunk.map((uid) => db.collection('users').doc(uid))
    const snaps = await db.getAll(...refs)
    snaps.forEach((doc) => {
      if (!doc.exists) return
      const data = doc.data() as Record<string, unknown>
      const name = String(data?.name || '').trim()
      if (name) map.set(doc.id, name)
    })
  }
  return map
}

export async function ensureEventChatChannel(eventId: string) {
  const info = await fetchEventInfo(eventId)
  if (!info) return null
  if (!String(info.commercialName || '').trim()) return null

  const channelId = `event_${info.id}`
  const channelRef = db.collection('channels').doc(channelId)
  const channelSnap = await channelRef.get()

  const endDateKey = dayKey(info.endDate || info.startDate)
  const startDateKey = dayKey(info.startDate || info.endDate)
  const endDate = endDateKey ? new Date(`${endDateKey}T00:00:00.000Z`) : null
  const visibleUntil = endDate ? endDate.getTime() + 24 * 60 * 60 * 1000 : null
  const status =
    visibleUntil && Date.now() > visibleUntil ? 'archived' : 'active'

  const commercialUid = info.commercialName
    ? await lookupUidByNameLoose(info.commercialName)
    : null

  const name = `Event - ${info.code} - ${info.name || info.id}`

  const baseData: Record<string, unknown> = {
    type: 'event',
    source: 'events',
    name,
    location: info.location || '',
    eventId: info.id,
    eventCode: info.code,
    eventTitle: info.name || '',
    eventStart: info.startDate || null,
    eventEnd: info.endDate || null,
    visibleUntil,
    status,
    responsibleUserId: commercialUid,
    responsibleUserName: info.commercialName || null,
  }

  const newOnlyData = channelSnap.exists
    ? {}
    : {
        lastMessagePreview: '',
        lastMessageAt: 0,
        createdAt: Date.now(),
        createdBy: 'system',
      }

  await channelRef.set({ ...baseData, ...newOnlyData }, { merge: true })

  const assigned = await collectQuadrantAssigned(
    info.id,
    normalizeCode(info.code),
    info.name,
    startDateKey
  )
  const assignedUids = await resolveUids(assigned)

  const productionCapUids = await collectProductionCapUids()
  const channelData = channelSnap.exists ? (channelSnap.data() as Record<string, unknown>) : {}
  const extraMemberIds = Array.isArray(channelData.chatExtraMemberIds)
    ? channelData.chatExtraMemberIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    : []

  const defaultMemberUids = new Set<string>([
    ...assignedUids,
    ...productionCapUids,
    ...extraMemberIds,
  ])
  if (commercialUid) defaultMemberUids.add(commercialUid)

  const existingSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()

  const userNameMap = await fetchUserDisplayNames([...defaultMemberUids])

  const batch = db.batch()
  const now = Date.now()

  for (const uid of defaultMemberUids) {
    const ref = db.collection('channelMembers').doc(`${channelId}_${uid}`)
    const existingDoc = existingSnap.docs.find(
      (doc) => String((doc.data() as { userId?: string })?.userId || '') === uid
    )
    const currentData = existingDoc?.data() as Record<string, unknown> | undefined
    batch.set(
      ref,
      {
        channelId,
        userId: uid,
        userName: userNameMap.get(uid) || String(currentData?.userName || ''),
        role: 'member',
        joinedAt: Number(currentData?.joinedAt || now),
        unreadCount: Number(currentData?.unreadCount || 0),
        hidden: false,
        notify: true,
        muted: Boolean(currentData?.muted),
      },
      { merge: true }
    )
  }

  for (const doc of existingSnap.docs) {
    const uid = String((doc.data() as { userId?: string })?.userId || '')
    if (uid && !defaultMemberUids.has(uid)) {
      batch.delete(doc.ref)
    }
  }

  await batch.commit()

  return { channelId, memberIds: [...defaultMemberUids] }
}

export async function canManageEventProductionChatMembers(params: {
  channel: {
    responsibleUserId?: string | null
    eventId?: string | null
  }
  userId: string
  role: string
}) {
  const role = normalizeRole(params.role)
  if (role === 'admin' || role === 'direccio') return true

  const responsibleId = String(params.channel.responsibleUserId || '').trim()
  if (responsibleId && responsibleId === params.userId) return true

  if (role !== 'cap') return false

  const userSnap = await db.collection('users').doc(params.userId).get()
  if (!userSnap.exists) return false
  const data = userSnap.data() as Record<string, unknown>
  return normalizeDept(String(data.department || data.departmentLower || '')) === 'produccio'
}

export async function addEventProductionChatExtraMember(params: {
  channelId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const channelId = String(params.channelId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!channelId || !targetUserId) throw new Error('Dades no vàlides.')

  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) throw new Error('Canal no trobat.')
  const channel = channelSnap.data() as Record<string, unknown>
  if (String(channel.source || '') !== 'events') {
    throw new Error('Canal no compatible.')
  }

  const canManage = await canManageEventProductionChatMembers({
    channel: {
      responsibleUserId: String(channel.responsibleUserId || ''),
      eventId: String(channel.eventId || ''),
    },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per afegir participants.')

  const extraMemberIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  extraMemberIds.add(targetUserId)

  await db.collection('channels').doc(channelId).set(
    { chatExtraMemberIds: [...extraMemberIds], updatedAt: Date.now() },
    { merge: true }
  )

  const eventId = String(channel.eventId || '').trim()
  if (!eventId) throw new Error('Esdeveniment no vàlid.')
  return ensureEventChatChannel(eventId)
}

export async function removeEventProductionChatExtraMember(params: {
  channelId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const channelId = String(params.channelId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!channelId || !targetUserId) throw new Error('Dades no vàlides.')

  const channelSnap = await db.collection('channels').doc(channelId).get()
  if (!channelSnap.exists) throw new Error('Canal no trobat.')
  const channel = channelSnap.data() as Record<string, unknown>
  if (String(channel.source || '') !== 'events') {
    throw new Error('Canal no compatible.')
  }

  const extraMemberIds = new Set(
    (Array.isArray(channel.chatExtraMemberIds) ? channel.chatExtraMemberIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  if (!extraMemberIds.has(targetUserId)) {
    throw new Error('Només es poden treure participants afegits manualment.')
  }

  const canManage = await canManageEventProductionChatMembers({
    channel: {
      responsibleUserId: String(channel.responsibleUserId || ''),
      eventId: String(channel.eventId || ''),
    },
    userId: params.actorUserId,
    role: params.actorRole,
  })
  if (!canManage) throw new Error('Sense permís per treure participants.')

  extraMemberIds.delete(targetUserId)
  await db.collection('channels').doc(channelId).set(
    { chatExtraMemberIds: [...extraMemberIds], updatedAt: Date.now() },
    { merge: true }
  )

  const eventId = String(channel.eventId || '').trim()
  if (!eventId) throw new Error('Esdeveniment no vàlid.')
  return ensureEventChatChannel(eventId)
}
