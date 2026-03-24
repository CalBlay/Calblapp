// file: src/services/sync/sapSync.ts
import { firestoreAdmin } from '../../lib/firebaseAdmin'

import { SapRow, normalizeDateToISO, toLower, isFuzzyMatch } from '@/lib/parseSapCsv'

type FsEvent = {
  id: string
  NomEvent?: string
  Comercial?: string
  DataInici?: string
  NomEventLower?: string
  ComercialLower?: string
}

/**
 * Busca candidats a Firestore per Comercial+Data i aplica fuzzy al NomEvent.
 * Escriu code=Proyecto quan hi ha match.
 */
export async function syncRowsToFirestore(rows: SapRow[], opts?: { threshold?: number }) {
  const threshold = opts?.threshold ?? 0.8

  let total = 0
  let candidatesChecked = 0
  let updated = 0
  let noMatch = 0

  // Per rendiment: creem un map local per evitar reconsultar els mateixos conjunts
  const cache = new Map<string, FsEvent[]>()

  const batch = firestoreAdmin.batch()
  let pending = 0
  const flush = async () => {
    if (pending > 0) {
      await batch.commit()
      pending = 0
    }
  }

  for (const row of rows) {
    total++
    const sapName = row['Nombre IC'] || ''
    const sapCom = toLower(row['Ultimo empl.dpto.ventas'])
    const sapDate = normalizeDateToISO(row['Fecha inicio'])
    const code = (row['Proyecto'] || '').trim()

    if (!sapCom || !sapDate || !code) {
      noMatch++
      continue
    }

    const cacheKey = `${sapCom}|${sapDate}`
    let candidates: FsEvent[]
    if (cache.has(cacheKey)) {
      candidates = cache.get(cacheKey)!
    } else {
      // Query a stage_verd per ComercialLower + DataInici
      const snap = await firestoreAdmin
        .collection('stage_verd')
        .where('ComercialLower', '==', sapCom)
        .where('DataInici', '==', sapDate)
        .get()

      candidates = snap.docs.map(d => ({
        id: d.id,
        NomEvent: d.get('NomEvent') || '',
        Comercial: d.get('Comercial') || '',
        DataInici: d.get('DataInici') || '',
        NomEventLower: (d.get('NomEvent') || '').toLowerCase(),
        ComercialLower: (d.get('Comercial') || '').toLowerCase(),
      }))

      cache.set(cacheKey, candidates)
    }

    candidatesChecked += candidates.length

    // Aplica fuzzy sobre el nom
    const match = candidates.find(c => isFuzzyMatch(sapName, c.NomEvent || '', threshold))
    if (match) {
      const ref = firestoreAdmin.collection('stage_verd').doc(match.id)
      batch.update(ref, { code })
      pending++
      updated++

      // Firestore batch limita ~500 operacions
      if (pending >= 450) await flush()
    } else {
      noMatch++
    }
  }

  await flush()

  return { totalRows: total, candidatesQueried: candidatesChecked, updated, noMatch, threshold }
}
