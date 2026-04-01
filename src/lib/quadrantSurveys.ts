import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'

const SURVEYS_COLLECTION = 'quadrantSurveys'
const RESPONSES_COLLECTION = 'quadrantSurveyResponses'
const CHANNEL_MEMBERS_COLLECTION = 'channelMembers'
const MESSAGES_COLLECTION = 'messages'
const CHANNELS_COLLECTION = 'channels'

const norm = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export type QuadrantSurveyResponse = 'yes' | 'no' | 'maybe'

export type SurveyTargetWorker = {
  personnelId: string
  userId: string | null
  name: string
  department: string
}

export type QuadrantSurveySnapshot = {
  eventName: string
  location: string
  service: string | null
  startTime: string
  endTime: string
  phaseType?: string | null
  totalWorkers?: number | null
  totalDrivers?: number | null
}

export type QuadrantSurvey = {
  id: string
  eventId: string
  department: string
  serviceDate: string
  deadlineAt: number
  status: 'sent' | 'closed' | 'cancelled'
  createdAt: number
  createdById: string
  createdByName: string
  targetGroupIds: string[]
  targetWorkerIds: string[]
  targetGroupNames?: string[]
  targetWorkerNames?: string[]
  resolvedTargets: SurveyTargetWorker[]
  snapshot: QuadrantSurveySnapshot
  channelId: string | null
  counts?: {
    yes: number
    no: number
    maybe: number
    pending: number
  }
  responses?: Array<{
    workerName: string
    response: QuadrantSurveyResponse
    respondedAt: number
  }>
  responseGroups?: {
    yes: Array<{ workerName: string; respondedAt: number }>
    maybe: Array<{ workerName: string; respondedAt: number }>
    no: Array<{ workerName: string; respondedAt: number }>
    pending: Array<{ workerName: string }>
  }
}

export type QuadrantSurveyResponseDoc = {
  id: string
  surveyId: string
  workerId: string
  workerName: string
  department: string
  response: QuadrantSurveyResponse
  respondedAt: number
  userId: string | null
}

type SurveyNotificationPayload = {
  type: 'quadrant_survey'
  title: string
  body: string
  surveyId: string
  eventId: string
  department: string
  serviceDate: string
}

export async function loadDepartmentSurveyGroups(department: string) {
  const snap = await db.collection('quadrantPremises').doc(norm(department)).get()
  if (!snap.exists) return []
  const data = snap.data() as any
  return Array.isArray(data?.surveyGroups) ? data.surveyGroups : []
}

async function lookupUserIdByPersonnelId(personnelId: string) {
  const rawId = String(personnelId || '').trim()
  if (!rawId) return null

  const userDoc = await db.collection('users').doc(rawId).get()
  if (userDoc.exists) return userDoc.id

  const byUserId = await db.collection('users').where('userId', '==', rawId).limit(1).get()
  if (!byUserId.empty) return byUserId.docs[0].id

  return null
}

async function canUserRespondSurveys(userId: string | null) {
  if (!userId) return false
  const userSnap = await db.collection('users').doc(userId).get()
  if (!userSnap.exists) return false
  const data = userSnap.data() as any
  return Boolean(data?.canRespondSurveys)
}

export async function resolveSurveyTargetWorkers(input: {
  department: string
  targetGroupIds?: string[]
  targetWorkerIds?: string[]
}) {
  const department = norm(input.department)
  const targetWorkerIds = Array.isArray(input.targetWorkerIds) ? input.targetWorkerIds : []
  const targetGroupIds = Array.isArray(input.targetGroupIds) ? input.targetGroupIds : []
  const groups = await loadDepartmentSurveyGroups(department)
  const groupWorkerIds = groups
    .filter((group: any) => targetGroupIds.includes(String(group?.id || '')))
    .flatMap((group: any) =>
      Array.isArray(group?.workerIds) ? group.workerIds.map((id: unknown) => String(id || '').trim()) : []
    )

  const uniquePersonnelIds = Array.from(
    new Set([...targetWorkerIds, ...groupWorkerIds].map((id) => String(id || '').trim()).filter(Boolean))
  )

  if (uniquePersonnelIds.length === 0) return []

  const personnelRefs = uniquePersonnelIds.map((id) => db.collection('personnel').doc(id))
  const personnelDocs = await db.getAll(...personnelRefs)

  const targets = await Promise.all(
    personnelDocs
      .filter((doc) => doc.exists)
      .map(async (doc) => {
        const data = doc.data() as any
        return {
          personnelId: doc.id,
          userId: await lookupUserIdByPersonnelId(doc.id),
          name: String(data?.name || '').trim(),
          department: norm(data?.department || department),
        } satisfies SurveyTargetWorker
      })
  )
  const filteredTargets = await Promise.all(
    targets
      .filter((target) => target.name)
      .map(async (target) => ((await canUserRespondSurveys(target.userId)) ? target : null))
  )

  return filteredTargets.filter((target): target is SurveyTargetWorker => Boolean(target))
}

async function ensureChannelMembership(channelId: string, targets: SurveyTargetWorker[]) {
  const existingSnap = await db
    .collection(CHANNEL_MEMBERS_COLLECTION)
    .where('channelId', '==', channelId)
    .get()
  const existingUserIds = new Set(
    existingSnap.docs.map((doc) => String((doc.data() as any)?.userId || '').trim()).filter(Boolean)
  )
  const usersSnap = await db.collection('users').get()
  const userNameMap = new Map<string, string>()
  usersSnap.forEach((doc) => {
    const data = doc.data() as any
    if (data?.name) userNameMap.set(doc.id, String(data.name))
  })

  const batch = db.batch()
  const now = Date.now()
  targets.forEach((target) => {
    if (!target.userId || existingUserIds.has(target.userId)) return
    const ref = db.collection(CHANNEL_MEMBERS_COLLECTION).doc(`${channelId}_${target.userId}`)
    batch.set(ref, {
      channelId,
      userId: target.userId,
      userName: userNameMap.get(target.userId) || target.name,
      role: 'member',
      joinedAt: now,
      unreadCount: 0,
      hidden: false,
      notify: true,
      muted: false,
    })
  })
  await batch.commit()
}

async function publishSurveyMessages(params: {
  surveyId: string
  channelId: string
  eventId: string
  serviceDate: string
  department: string
  createdById: string
  createdByName: string
  deadlineAt: number
  snapshot: QuadrantSurveySnapshot
  targets: SurveyTargetWorker[]
}) {
  const { channelId, targets } = params
  if (targets.length === 0) return

  const channelSnap = await db.collection(CHANNELS_COLLECTION).doc(channelId).get()
  const channelData = channelSnap.exists ? (channelSnap.data() as any) : null
  const channelName = String(channelData?.name || channelData?.eventTitle || 'Ops').trim()

  const now = Date.now()
  const batch = db.batch()
  const memberSnap = await db.collection(CHANNEL_MEMBERS_COLLECTION).where('channelId', '==', channelId).get()
  const members = memberSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
  const pushRecipients: string[] = []

  targets.forEach((target) => {
    if (!target.userId) return
    const messageRef = db.collection(MESSAGES_COLLECTION).doc()
    batch.set(messageRef, {
      channelId,
      senderId: params.createdById,
      senderName: params.createdByName,
      body: '',
      createdAt: now,
      visibility: 'direct',
      targetUserIds: [target.userId],
      readCount: 0,
      surveyId: params.surveyId,
      surveyType: 'quadrant-availability',
      surveyState: 'pending',
      surveyPayload: {
        eventId: params.eventId,
        department: params.department,
        serviceDate: params.serviceDate,
        deadlineAt: params.deadlineAt,
        eventName: params.snapshot.eventName,
        location: params.snapshot.location,
        service: params.snapshot.service,
        startTime: params.snapshot.startTime,
        endTime: params.snapshot.endTime,
      },
      system: true,
    })

    const member = members.find((item) => item.userId === target.userId)
    if (member && !member.hidden && member.notify !== false) {
      batch.set(
        db.collection(CHANNEL_MEMBERS_COLLECTION).doc(member.id),
        { unreadCount: Number(member.unreadCount || 0) + 1 },
        { merge: true }
      )
      if (!member.muted) pushRecipients.push(target.userId)
    }
  })

  batch.set(
    db.collection(CHANNELS_COLLECTION).doc(channelId),
    {
      lastMessagePreview: 'Sondeig de disponibilitat',
      lastMessageAt: now,
    },
    { merge: true }
  )

  await batch.commit()

  const baseUrl = process.env.NEXTAUTH_URL
  if (baseUrl) {
    await Promise.all(
      Array.from(new Set(pushRecipients)).map((userId) =>
        fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: channelName ? `Sondeig: ${channelName}` : 'Nou sondeig de disponibilitat',
            body: `${params.snapshot.eventName} · ${params.serviceDate}`,
            url: `/menu/missatgeria?channel=${channelId}`,
          }),
        }).catch(() => {})
      )
    )
  }
}

async function createSurveyNotifications(
  targets: SurveyTargetWorker[],
  payload: SurveyNotificationPayload
) {
  const userIds = Array.from(
    new Set(
      targets
        .map((target) => String(target.userId || '').trim())
        .filter(Boolean)
    )
  )
  if (userIds.length === 0) return

  const now = Date.now()
  const batch = db.batch()
  for (const userId of userIds) {
    const ref = db.collection('users').doc(userId).collection('notifications').doc()
    batch.set(ref, {
      ...payload,
      createdAt: now,
      read: false,
    })
  }
  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const Ably = (await import('ably')).default
      const rest = new Ably.Rest({ key: apiKey })
      await Promise.all(
        userIds.map((uid) =>
          rest.channels.get(`user:${uid}:notifications`).publish('created', {
            type: payload.type,
            surveyId: payload.surveyId,
            createdAt: now,
          })
        )
      )
    } catch (error) {
      console.error('[quadrantSurveys] Ably notification publish error', error)
    }
  }

  const baseUrl = process.env.NEXTAUTH_URL
  if (baseUrl) {
    await Promise.all(
      userIds.map((userId) =>
        fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: payload.title,
            body: payload.body,
            url: '/menu/sondeigs',
          }),
        }).catch(() => {})
      )
    )
  }
}

export async function createQuadrantSurvey(input: {
  eventId: string
  department: string
  serviceDate: string
  deadlineAt: number
  createdById: string
  createdByName: string
  targetGroupIds?: string[]
  targetWorkerIds?: string[]
  snapshot: QuadrantSurveySnapshot
}) {
  const resolvedTargets = await resolveSurveyTargetWorkers({
    department: input.department,
    targetGroupIds: input.targetGroupIds,
    targetWorkerIds: input.targetWorkerIds,
  })

  const surveyRef = db.collection(SURVEYS_COLLECTION).doc()
  const ensuredChannel = await ensureEventChatChannel(input.eventId)
  const channelId = ensuredChannel?.channelId || null

  if (channelId) {
    await ensureChannelMembership(channelId, resolvedTargets)
  }

  const surveyData = {
    eventId: input.eventId,
    department: norm(input.department),
    serviceDate: input.serviceDate,
    deadlineAt: Number(input.deadlineAt || 0),
    status: 'sent',
    createdAt: Date.now(),
    createdById: input.createdById,
    createdByName: input.createdByName,
    targetGroupIds: Array.isArray(input.targetGroupIds) ? input.targetGroupIds : [],
    targetWorkerIds: Array.isArray(input.targetWorkerIds) ? input.targetWorkerIds : [],
    resolvedTargets,
    snapshot: input.snapshot,
    channelId,
  }

  await surveyRef.set(surveyData)

  await createSurveyNotifications(resolvedTargets, {
    type: 'quadrant_survey',
    title: 'Nou sondeig de disponibilitat',
    body: `${input.snapshot.eventName} · ${input.serviceDate}`,
    surveyId: surveyRef.id,
    eventId: input.eventId,
    department: norm(input.department),
    serviceDate: input.serviceDate,
  })

  if (channelId) {
    await publishSurveyMessages({
      surveyId: surveyRef.id,
      channelId,
      eventId: input.eventId,
      serviceDate: input.serviceDate,
      department: norm(input.department),
      createdById: input.createdById,
      createdByName: input.createdByName,
      deadlineAt: Number(input.deadlineAt || 0),
      snapshot: input.snapshot,
      targets: resolvedTargets,
    })
  }

  return { id: surveyRef.id, ...surveyData }
}

export async function listQuadrantSurveys(params: {
  eventId: string
  department?: string
  serviceDate?: string
}) {
  const eventId = String(params.eventId || '').trim()
  if (!eventId) return []

  const snap = await db.collection(SURVEYS_COLLECTION).where('eventId', '==', eventId).get()
  let surveys = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as QuadrantSurvey[]

  if (params.department) {
    const department = norm(params.department)
    surveys = surveys.filter((survey) => norm(survey.department) === department)
  }
  if (params.serviceDate) {
    surveys = surveys.filter((survey) => String(survey.serviceDate || '').slice(0, 10) === params.serviceDate)
  }

  if (surveys.length === 0) return []

  const responseSnap = await db
    .collection(RESPONSES_COLLECTION)
    .where('surveyId', 'in', surveys.map((s) => s.id).slice(0, 10))
    .get()
    .catch(() => null)
  const responses = responseSnap ? responseSnap.docs.map((doc) => doc.data() as any) : []

  const groupsByDepartment = new Map<string, any[]>()

  return (
    await Promise.all(
      surveys.map(async (survey) => {
        const surveyDepartment = norm(survey.department)
        if (!groupsByDepartment.has(surveyDepartment)) {
          groupsByDepartment.set(surveyDepartment, await loadDepartmentSurveyGroups(surveyDepartment))
        }
        const availableGroups = groupsByDepartment.get(surveyDepartment) || []
        const targetGroupNames = availableGroups
          .filter((group: any) => Array.isArray(survey.targetGroupIds) && survey.targetGroupIds.includes(String(group?.id || '')))
          .map((group: any) => String(group?.name || '').trim())
          .filter(Boolean)
        const targetWorkerNames = (Array.isArray(survey.resolvedTargets) ? survey.resolvedTargets : [])
          .filter(
            (target) =>
              Array.isArray(survey.targetWorkerIds) &&
              survey.targetWorkerIds.includes(String(target?.personnelId || '').trim())
          )
          .map((target) => String(target?.name || '').trim())
          .filter(Boolean)

      const surveyResponses = responses.filter((response) => response.surveyId === survey.id)
      const yes = surveyResponses.filter((response) => response.response === 'yes').length
      const no = surveyResponses.filter((response) => response.response === 'no').length
      const maybe = surveyResponses.filter((response) => response.response === 'maybe').length
      const pending = Math.max((survey.resolvedTargets || []).length - yes - no - maybe, 0)
      const respondedNames = new Set(
        surveyResponses.map((response) => String(response.workerName || '').trim()).filter(Boolean)
      )
      const yesResponses = surveyResponses
        .filter((response) => response.response === 'yes')
        .map((response) => ({
          workerName: String(response.workerName || '').trim(),
          respondedAt: Number(response.respondedAt || 0),
        }))
        .filter((response) => response.workerName)
      const maybeResponses = surveyResponses
        .filter((response) => response.response === 'maybe')
        .map((response) => ({
          workerName: String(response.workerName || '').trim(),
          respondedAt: Number(response.respondedAt || 0),
        }))
        .filter((response) => response.workerName)
      const noResponses = surveyResponses
        .filter((response) => response.response === 'no')
        .map((response) => ({
          workerName: String(response.workerName || '').trim(),
          respondedAt: Number(response.respondedAt || 0),
        }))
        .filter((response) => response.workerName)
      const pendingResponses = (Array.isArray(survey.resolvedTargets) ? survey.resolvedTargets : [])
        .map((target) => ({ workerName: String(target?.name || '').trim() }))
        .filter((target) => target.workerName && !respondedNames.has(target.workerName))
        return {
          ...survey,
          targetGroupNames,
          targetWorkerNames,
          counts: { yes, no, maybe, pending },
          responses: surveyResponses
            .map((response) => ({
              workerName: String(response.workerName || '').trim(),
              response: response.response as QuadrantSurveyResponse,
              respondedAt: Number(response.respondedAt || 0),
            }))
            .filter((response) => response.workerName)
            .sort((a, b) => a.respondedAt - b.respondedAt),
          responseGroups: {
            yes: yesResponses,
            maybe: maybeResponses,
            no: noResponses,
            pending: pendingResponses,
          },
        }
      })
    )
  ).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

export async function respondQuadrantSurvey(input: {
  surveyId: string
  userId: string
  userName: string
  response: QuadrantSurveyResponse
}) {
  const surveySnap = await db.collection(SURVEYS_COLLECTION).doc(input.surveyId).get()
  if (!surveySnap.exists) {
    throw new Error('Sondeig no trobat')
  }

  const survey = surveySnap.data() as any
  const target = Array.isArray(survey?.resolvedTargets)
    ? survey.resolvedTargets.find((item: any) => String(item?.userId || '') === input.userId)
    : null
  if (!target) {
    throw new Error('Aquest usuari no forma part del sondeig')
  }

  const responseRef = db.collection(RESPONSES_COLLECTION).doc(`${input.surveyId}__${target.personnelId}`)
  await responseRef.set({
    surveyId: input.surveyId,
    workerId: target.personnelId,
    workerName: target.name || input.userName,
    department: survey.department || target.department,
    response: input.response,
    respondedAt: Date.now(),
    userId: input.userId,
  })

  const surveyMessages = await db
    .collection(MESSAGES_COLLECTION)
    .where('surveyId', '==', input.surveyId)
    .get()
  const batch = db.batch()
  surveyMessages.docs.forEach((doc) => {
    const data = doc.data() as any
    const targets = Array.isArray(data?.targetUserIds) ? data.targetUserIds.map((item: unknown) => String(item || '')) : []
    if (!targets.includes(input.userId)) return
    batch.set(
      doc.ref,
      {
        surveyState: input.response,
      },
      { merge: true }
    )
  })
  await batch.commit()

  return { ok: true }
}

export async function getSurveyPreferredCandidates(params: {
  eventId: string
  department: string
  serviceDate: string
}) {
  const surveys = await listQuadrantSurveys(params)
  const activeSurvey = surveys.find((survey) => survey.status === 'sent') || surveys[0]
  if (!activeSurvey) {
    return { yes: [], maybe: [] }
  }

  const responseSnap = await db
    .collection(RESPONSES_COLLECTION)
    .where('surveyId', '==', activeSurvey.id)
    .get()
  const responses = responseSnap.docs.map((doc) => doc.data() as any)
  const personnelIds = Array.from(
    new Set(
      responses
        .map((item) => String(item?.workerId || '').trim())
        .filter(Boolean)
    )
  )
  const personnelDocs =
    personnelIds.length > 0
      ? await db.getAll(...personnelIds.map((id) => db.collection('personnel').doc(id)))
      : []
  const personnelMap = new Map(
    personnelDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() as any])
  )

  const sortByPriority = (a: any, b: any) => {
    const aPersonnel = personnelMap.get(String(a.workerId || '')) || {}
    const bPersonnel = personnelMap.get(String(b.workerId || '')) || {}
    const aContracted = Number(aPersonnel?.contractHours || aPersonnel?.hoursContracted || Infinity)
    const bContracted = Number(bPersonnel?.contractHours || bPersonnel?.hoursContracted || Infinity)
    if (aContracted !== bContracted) return aContracted - bContracted
    const aMonth = Number(aPersonnel?.monthHrs || aPersonnel?.workedHoursMonth || Infinity)
    const bMonth = Number(bPersonnel?.monthHrs || bPersonnel?.workedHoursMonth || Infinity)
    if (aMonth !== bMonth) return aMonth - bMonth
    return Number(a.respondedAt || 0) - Number(b.respondedAt || 0)
  }

  return {
    yes: responses.filter((item) => item.response === 'yes').sort(sortByPriority).map((item) => item.workerName),
    maybe: responses.filter((item) => item.response === 'maybe').sort(sortByPriority).map((item) => item.workerName),
  }
}

export async function listUserQuadrantSurveys(userId: string) {
  const now = Date.now()
  const allSurveysSnap = await db.collection(SURVEYS_COLLECTION).get()
  const allSurveys = allSurveysSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
    .filter((survey: any) =>
      Array.isArray(survey?.resolvedTargets) &&
      survey.resolvedTargets.some((target: any) => String(target?.userId || '') === userId) &&
      Number(survey?.deadlineAt || 0) > now
    )

  if (allSurveys.length === 0) return []

  const responseSnaps = await Promise.all(
    allSurveys.map(async (survey: any) => {
      const target = survey.resolvedTargets.find((item: any) => String(item?.userId || '') === userId)
      if (!target?.personnelId) return null
      const snap = await db.collection(RESPONSES_COLLECTION).doc(`${survey.id}__${target.personnelId}`).get()
      return snap.exists ? { surveyId: survey.id, ...(snap.data() as any) } : { surveyId: survey.id, response: null, respondedAt: null }
    })
  )

  return allSurveys
    .map((survey: any) => {
      const myResponse = responseSnaps.find((item) => item?.surveyId === survey.id) || null
      return {
        ...survey,
        myResponse: myResponse?.response || null,
        respondedAt: myResponse?.respondedAt || null,
      }
    })
    .sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}
