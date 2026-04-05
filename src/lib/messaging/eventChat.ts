import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
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

const normalizeCode = (raw?: string | null) =>
  String(raw || '').trim().toUpperCase()

const isValidEventCode = (code?: string | null) => {
  const c = normalizeCode(code)
  return Boolean(c)
}

const extractCommercialName = (data: any): string => {
  return (
    data?.Comercial ||
    data?.COMERCIAL ||
    data?.comercial ||
    data?.comercialNom ||
    data?.Comercial_nom ||
    data?.Commercial ||
    data?.Sales ||
    data?.ResponsableComercial ||
    data?.ComercialName ||
    data?.ComercialNom ||
    ''
  )
}

async function fetchEventInfo(eventId: string): Promise<EventInfo | null> {
  const snap = await db.collection('stage_verd').doc(String(eventId)).get()
  if (!snap.exists) return null
  const data = snap.data() as any

  const code =
    data?.code ||
    data?.Code ||
    data?.C_digo ||
    data?.codi ||
    data?.Codi ||
    ''
  if (!isValidEventCode(code)) return null

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
    const data = doc.data() as any
    const candidates = [
      data?.name,
      data?.fullName,
      data?.displayName,
      data?.nom,
      data?.Nom,
    ]
    for (const c of candidates) {
      if (norm(c) === target) return doc.id
    }
  }

  const personnelSnap = await db.collection('personnel').get()
  for (const doc of personnelSnap.docs) {
    const data = doc.data() as any
    const candidates = [data?.name, data?.fullName, data?.displayName, data?.nom, data?.Nom]
    if (candidates.some((c) => norm(c) === target)) {
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

function extractAssignedUsers(q: any): AssignedUser[] {
  const out: AssignedUser[] = []
  const push = (u?: AssignedUser | null) => {
    if (!u) return
    if (!u.id && !u.name) return
    out.push({ id: u.id, name: u.name })
  }
  const pushArr = (arr?: any[] | null) => {
    if (!Array.isArray(arr)) return
    arr.forEach((item) => {
      if (typeof item === 'string') push({ name: item })
      else push({ id: item?.id || item?.userId, name: item?.name })
    })
  }

  if (q?.responsableName) push({ name: q.responsableName })
  if (q?.responsable?.name) push({ name: q.responsable.name })
  pushArr(q?.responsables)
  pushArr(q?.treballadors)
  pushArr(q?.workers)
  pushArr(q?.conductors)

  return out
}

function isConfirmedQuadrant(data: any): boolean {
  const status = String(data?.status ?? '').toLowerCase()
  const confirmedAtVal = data?.confirmedAt
  const confirmedAt =
    typeof confirmedAtVal === 'object' && confirmedAtVal?.toDate
      ? confirmedAtVal.toDate()
      : confirmedAtVal
  return (
    status === 'confirmed' ||
    Boolean(confirmedAt) ||
    Boolean(data?.confirmada) ||
    Boolean(data?.confirmed)
  )
}

async function collectQuadrantAssigned(eventId: string, eventCode: string, dateKeyValue: string) {
  const quadrantCollections = [
    'quadrantsServeis',
    'quadrantsLogistica',
    'quadrantsCuina',
    'quadrantsProduccio',
    'quadrantsComercial',
  ]

  const users: AssignedUser[] = []

  for (const coll of quadrantCollections) {
    const ref = db.collection(coll)
    const byId = await ref.where('eventId', '==', eventId).get().catch(() => null)
    const byCode = eventCode
      ? await ref.where('code', '==', eventCode).get().catch(() => null)
      : null
    const byDate = dateKeyValue
      ? await ref.where('startDate', '==', dateKeyValue).get().catch(() => null)
      : null

    const pushDocs = (snap: FirebaseFirestore.QuerySnapshot | null) => {
      if (!snap || snap.empty) return
      snap.forEach((doc) => {
        const data = doc.data()
        if (!isConfirmedQuadrant(data)) return
        users.push(...extractAssignedUsers(data))
      })
    }

    pushDocs(byId)
    pushDocs(byCode)
    pushDocs(byDate)
  }

  return users
}

async function collectProductionUids() {
  try {
    const snap = await db.collection('users').where('departmentLower', '==', 'produccio').get()
    if (!snap.empty) return snap.docs.map((d) => d.id)
  } catch {
    // Falta índex o camp legacy: fallback lectura completa
  }
  const snap = await db.collection('users').get()
  const out: string[] = []
  snap.forEach((doc) => {
    const data = doc.data() as any
    const dept = norm(data.department || data.departmentLower)
    if (dept === 'produccio') out.push(doc.id)
  })
  return out
}

async function collectAdminUids() {
  const ids = new Set<string>()
  const merge = (snap: FirebaseFirestore.QuerySnapshot) => {
    snap.forEach((d) => ids.add(d.id))
  }
  try {
    merge(await db.collection('users').where('isAdmin', '==', true).get())
  } catch {
    /* ignore */
  }
  try {
    merge(
      await db
        .collection('users')
        .where('role', 'in', ['admin', 'direccio', 'Admin', 'Direcció', 'direcció', 'Direccio'])
        .get()
    )
  } catch {
    /* ignore */
  }
  if (ids.size > 0) return [...ids]

  const snap = await db.collection('users').get()
  snap.forEach((doc) => {
    const data = doc.data() as any
    const role = normalizeRole(
      data?.role || data?.rol || data?.nivell || data?.nivel || data?.level || ''
    )
    if (role === 'admin' || role === 'direccio') ids.add(doc.id)
  })
  return [...ids]
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
      const data = doc.data() as any
      const name = String(data?.name || '').trim()
      if (name) map.set(doc.id, name)
    })
  }
  return map
}

async function filterEnabledEventUids(uids: string[], adminUids: string[]) {
  if (uids.length === 0) return []
  const adminSet = new Set(adminUids)
  const refs = uids.map((uid) => db.collection('users').doc(uid))
  const snaps = await db.getAll(...refs)
  const out: string[] = []
  snaps.forEach((doc) => {
    if (!doc.exists) return
    const data = doc.data() as any
    if (adminSet.has(doc.id)) {
      out.push(doc.id)
      return
    }
    const configurable = data?.opsEventsConfigurable
    if (configurable === false) return
    const enabled = data?.opsEventsEnabled
    if (enabled === false) return
    out.push(doc.id)
  })
  return out
}

export async function ensureEventChatChannel(eventId: string) {
  const info = await fetchEventInfo(eventId)
  if (!info) return null
  if (!String(info.commercialName || '').trim()) return null

  const channelId = `event_${info.id}`
  const channelRef = db.collection('channels').doc(channelId)
  const channelSnap = await channelRef.get()

  const endDateKey = dayKey(info.endDate || info.startDate)
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

  const assigned = await collectQuadrantAssigned(info.id, normalizeCode(info.code), endDateKey)
  const assignedUids = await resolveUids(assigned)

  const productionUids = await collectProductionUids()
  const adminUids = await collectAdminUids()
  const eventEligible = await filterEnabledEventUids(
    Array.from(new Set([...assignedUids, ...productionUids])),
    adminUids
  )
  const allUids = new Set<string>([...eventEligible, ...adminUids])
  if (commercialUid) allUids.add(commercialUid)

  if (allUids.size === 0) {
    return { channelId }
  }

  const existingSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()
  const existing = new Set(
    existingSnap.docs.map((d) => (d.data() as any)?.userId).filter(Boolean)
  )
  const existingDocs = new Map(
    existingSnap.docs
      .map((d) => [String((d.data() as any)?.userId || ''), d] as const)
      .filter(([uid]) => uid)
  )

  const userNameMap = await fetchUserDisplayNames([...allUids])

  const batch = db.batch()
  const now = Date.now()
  for (const uid of allUids) {
    const isAdminMember = adminUids.includes(uid)
    if (!existing.has(uid)) {
      const ref = db.collection('channelMembers').doc(`${channelId}_${uid}`)
      batch.set(ref, {
        channelId,
        userId: uid,
        userName: userNameMap.get(uid) || '',
        role: 'member',
        joinedAt: now,
        unreadCount: 0,
        hidden: isAdminMember,
        notify: !isAdminMember,
        muted: isAdminMember,
      })
      continue
    }

    if (isAdminMember) {
      const doc = existingDocs.get(uid)
      if (doc) {
        batch.set(
          doc.ref,
          {
            hidden: true,
            notify: false,
            muted: true,
          },
          { merge: true }
        )
      }
    }
  }
  await batch.commit()

  return { channelId }
}
