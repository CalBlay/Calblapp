import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  indexSpaceOwnershipDocs,
  type SpaceOwnershipIndex,
} from '@/lib/costServeis/spaceOwnership'

export async function loadSpaceOwnershipIndex(): Promise<SpaceOwnershipIndex> {
  const snap = await db.collection('finques').get()
  return indexSpaceOwnershipDocs(
    snap.docs.map((doc) => ({
      id: doc.id,
      data: (doc.data() || {}) as Record<string, unknown>,
    }))
  )
}
