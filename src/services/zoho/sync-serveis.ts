import { firestoreAdmin as firestore } from '@/lib/firebaseAdmin'
import type { ZohoDeal } from '@/services/zoho/sync-types'

type SyncServeisOptions = {
  deals: ZohoDeal[]
  slugify: (text: string) => string
}

export async function syncServeisFromDeals({
  deals,
  slugify,
}: SyncServeisOptions): Promise<number> {
  const serveisRaw = new Set<string>()
  for (const deal of deals) {
    const nom = String(deal.Servicio_texto || deal.Men_texto || '').trim()
    if (nom) serveisRaw.add(nom)
  }

  const existSnap = await firestore.collection('serveis').get()
  const existing = new Set<string>()
  existSnap.docs.forEach((doc) => {
    const nom = String(doc.data().nom || '')
    existing.add(slugify(nom))
  })

  const batchServeis = firestore.batch()
  let created = 0

  for (const nomRaw of Array.from(serveisRaw)) {
    const norm = slugify(nomRaw)
    if (!norm || existing.has(norm)) continue

    const ref = firestore.collection('serveis').doc(norm)
    batchServeis.set(ref, {
      nom: nomRaw,
      codi: norm,
      searchable: `${nomRaw} ${norm}`.toLowerCase(),
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
