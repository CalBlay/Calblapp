import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import type { ZohoDeal } from '@/services/zoho/sync-types'
import {
  collectServeisNamesFromDeals,
  planNewServeisCreates,
} from '@/services/zoho/sync-serveis-names'

export {
  collectServeisNamesFromDeals,
  planNewServeisCreates,
} from '@/services/zoho/sync-serveis-names'

type SyncServeisOptions = {
  deals: ZohoDeal[]
  slugify: (text: string) => string
}

export async function syncServeisFromDeals({
  deals,
  slugify,
}: SyncServeisOptions): Promise<number> {
  const serveisRaw = collectServeisNamesFromDeals(deals)

  const existSnap = await firestore.collection('serveis').get()
  const existing = new Set<string>()
  existSnap.docs.forEach((doc) => {
    const nom = String(doc.data().nom || '')
    existing.add(slugify(nom))
  })

  const planned = planNewServeisCreates({
    names: serveisRaw,
    existingNorms: existing,
    slugify,
  })

  const batchServeis = firestore.batch()
  let created = 0

  for (const item of planned) {
    const ref = firestore.collection('serveis').doc(item.norm)
    batchServeis.set(ref, {
      nom: item.nomRaw,
      codi: item.norm,
      searchable: item.searchable,
      updatedAt: new Date().toISOString(),
      origen: 'zoho',
    })
    created += 1
  }

  if (created > 0) {
    await batchServeis.commit()
  }

  return created
}
