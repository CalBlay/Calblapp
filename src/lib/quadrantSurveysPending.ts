import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

const SURVEYS_COLLECTION = 'quadrantSurveys'
const RESPONSES_COLLECTION = 'quadrantSurveyResponses'

type SurveyDoc = {
  resolvedTargets?: Array<{ userId?: string | null; personnelId?: string | null }>
  targetUserIds?: string[]
  deadlineAt?: number
}

type ResponseData = { response?: unknown }

function deriveTargetUserIds(survey: SurveyDoc): string[] {
  const fromField = Array.isArray(survey.targetUserIds)
    ? survey.targetUserIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (fromField.length > 0) return fromField
  if (!Array.isArray(survey.resolvedTargets)) return []
  return survey.resolvedTargets
    .map((target) => String(target?.userId || '').trim())
    .filter(Boolean)
}

async function countPendingFromSurveyDocs(
  userId: string,
  docs: Array<{ id: string; data: SurveyDoc }>
): Promise<number> {
  if (docs.length === 0) return 0

  const responseSnaps = await Promise.all(
    docs.map(async ({ id, data }) => {
      const target = (data.resolvedTargets || []).find(
        (item) => String(item?.userId || '').trim() === userId
      )
      const personnelId = String(target?.personnelId || '').trim()
      if (!personnelId) return { surveyId: id, hasResponse: false }
      const snap = await db.collection(RESPONSES_COLLECTION).doc(`${id}__${personnelId}`).get()
      if (!snap.exists) return { surveyId: id, hasResponse: false }
      const response = (snap.data() as ResponseData)?.response
      return { surveyId: id, hasResponse: response != null && response !== '' }
    })
  )

  return responseSnaps.filter((item) => !item.hasResponse).length
}

/** Compta sondeigs pendents sense escanejar tota la col·lecció (quan hi ha `targetUserIds`). */
export async function countPendingUserQuadrantSurveys(userId: string): Promise<number> {
  const uid = String(userId || '').trim()
  if (!uid) return 0
  const now = Date.now()

  const indexedSnap = await db
    .collection(SURVEYS_COLLECTION)
    .where('targetUserIds', 'array-contains', uid)
    .where('deadlineAt', '>', now)
    .get()

  if (!indexedSnap.empty) {
    return countPendingFromSurveyDocs(
      uid,
      indexedSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as SurveyDoc }))
    )
  }

  const legacySnap = await db.collection(SURVEYS_COLLECTION).get()
  const legacyMatches = legacySnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as SurveyDoc }))
    .filter((item) => {
      if (Number(item.data.deadlineAt || 0) <= now) return false
      return deriveTargetUserIds(item.data).includes(uid)
    })

  return countPendingFromSurveyDocs(uid, legacyMatches)
}

export function targetUserIdsFromResolved(
  resolvedTargets: Array<{ userId?: string | null }>
): string[] {
  return [...new Set(resolvedTargets.map((t) => String(t?.userId || '').trim()).filter(Boolean))]
}
