// file: src/app/menu/spaces/info/page.tsx
export const dynamic = 'force-dynamic'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import SpacesInfoShell from './SpacesInfoShell'

type FincaDoc = {
  code?: string
  codi?: string
  tipus?: string
  nom?: string
  ln?: string
  LN?: string
  comercial?: Record<string, unknown>
  produccio?: Record<string, unknown>
}

export default async function SpacesInfoPage() {
  // Llegim totes les finques de Firestore
  const snap = await firestoreAdmin.collection('finques').get()

  // Normalitzem dades base
  const espais = snap.docs.map((doc) => {
    const d = doc.data() as FincaDoc
    const rawCode = d.code || d.codi || ''
    const rawTipus = d.tipus || ''
    return {
      id: doc.id,
      code: rawCode,
      nom: d.nom || doc.id,
      ln: d.ln || d.LN || '',
      tipus: rawTipus || (rawCode.startsWith('CC') ? 'Propi' : 'Extern'),
      comercial: d.comercial || {},
      produccio: d.produccio || {},
    }
  })

  // ────────────────────────────────────────────────
  // NORMALITZADOR GENERAL (igual que fem amb Departaments)
  // ────────────────────────────────────────────────
  const normalizeLN = (ln?: string) =>
    (ln || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  // ────────────────────────────────────────────────
  // GENERAR LN ÚNICS, NETS I REALS
  // ────────────────────────────────────────────────
  const lnMap = new Map<string, string>() // norm → original

  for (const e of espais) {
    const raw = e.ln || ''
    const norm = normalizeLN(raw)

    if (norm) {
      lnMap.set(norm, raw.trim())
    }
  }

  const lnOptions = Array.from(lnMap.values()).sort()

  // ────────────────────────────────────────────────
  // RENDER (Server → Client component)
  // ────────────────────────────────────────────────
  return (
    <SpacesInfoShell espais={espais} lnOptions={lnOptions} />
  )
}
