import { collectQuadrantLinePersonnel } from '@/lib/quadrantLinePersonnel'

const text = (value: unknown) => String(value ?? '').trim()

const normalizeIdentity = (value: unknown) =>
  text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

const canonicalEventId = (value: unknown) => text(value).split('__')[0].trim()

export function isUserOperationalResponsibleInQuadrants(params: {
  docs: Array<Record<string, unknown>>
  userId?: string | null
  userName?: string | null
}): boolean {
  const userId = text(params.userId)
  const userName = normalizeIdentity(params.userName)
  if (!userId && !userName) return false

  return params.docs.some((doc) =>
    collectQuadrantLinePersonnel(doc).some((person) => {
      if (person.role !== 'responsable') return false
      const personId = text(person.id)
      if (userId && personId && userId === personId) return true
      return Boolean(userName && normalizeIdentity(person.name) === userName)
    })
  )
}

export async function isUserOperationalResponsibleForEvent(params: {
  eventId: string
  userId?: string | null
  userName?: string | null
}): Promise<boolean> {
  const eventId = canonicalEventId(params.eventId)
  if (!eventId) return false

  const [{ firestoreAdmin }, { listQuadrantCollectionIds }] = await Promise.all([
    import('@/lib/firebaseAdmin'),
    import('@/lib/firestoreCollections'),
  ])
  const collections = await listQuadrantCollectionIds()
  const docsByCollection = await Promise.all(
    collections.map(async (collectionId) => {
      const collection = firestoreAdmin.collection(collectionId)
      const byEvent = await collection.where('eventId', '==', eventId).get()
      if (!byEvent.empty) {
        return byEvent.docs.map((doc) => doc.data() as Record<string, unknown>)
      }

      const direct = await collection.doc(eventId).get()
      return direct.exists ? [(direct.data() || {}) as Record<string, unknown>] : []
    })
  )

  return isUserOperationalResponsibleInQuadrants({
    docs: docsByCollection.flat(),
    userId: params.userId,
    userName: params.userName,
  })
}
