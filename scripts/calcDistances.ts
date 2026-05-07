// Script: scripts/calcDistances.ts
// ⚠️ OBOLET: la web ja no calcula ni desa distàncies amb Google Maps.
// Aquest script només existeix si algú vol una migració manual puntual amb xarxa + clau.
//
// Execució (un cop amb xarxa habilitada):
//   npx ts-node scripts/calcDistances.ts 2025-01-01 2025-12-31
//
// Si no passes dates, per defecte avui +/- 30 dies.

import 'dotenv/config'
import fetch from 'node-fetch'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

const ORIGIN = 'Molí Vinyals, 11, 08776 Sant Pere de Riudebitlles, Barcelona'
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

if (!API_KEY) {
  console.error('Falta NEXT_PUBLIC_GOOGLE_API_KEY al .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const startArg = args[0]
const endArg = args[1]
const defaultStart = new Date()
defaultStart.setDate(defaultStart.getDate() - 30)
const defaultEnd = new Date()
defaultEnd.setDate(defaultEnd.getDate() + 30)

const start = startArg || defaultStart.toISOString().slice(0, 10)
const end = endArg || defaultEnd.toISOString().slice(0, 10)

type RoleKey = 'responsable' | 'conductor' | 'treballador' | 'brigada'

const isIndexError = (err: any) =>
  err?.code === 9 || String(err?.message || '').toLowerCase().includes('requires an index')

async function listQuadrantCollections() {
  const cols = await db.listCollections()
  return cols.map(c => c.id).filter(id => id.toLowerCase().startsWith('quadrants'))
}

async function distanceKm(destination: string): Promise<number | null> {
  if (!destination) return null
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', ORIGIN)
  url.searchParams.set('destinations', destination)
  url.searchParams.set('key', API_KEY!)
  url.searchParams.set('mode', 'driving')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`DistanceMatrix HTTP ${res.status}`)
  const json = await res.json()
  const element = json?.rows?.[0]?.elements?.[0]
  if (element?.status !== 'OK') return null
  const meters = element.distance?.value
  if (!meters) return null
  return (meters / 1000) * 2 // anada+tornada
}

async function main() {
  const colNames = await listQuadrantCollections()
  console.log(`Processant col·leccions: ${colNames.join(', ')} | rang ${start} -> ${end}`)

  for (const colName of colNames) {
    const ref = db.collection(colName)
    let snap
    try {
      snap = await ref.where('startDate', '<=', end).where('endDate', '>=', start).get()
    } catch (err: any) {
      if (isIndexError(err)) {
        console.warn(`⚠️ Falta index per ${colName}, ometent.`)
        continue
      }
      throw err
    }

    if (snap.empty) continue

    for (const doc of snap.docs) {
      const d = doc.data() as any
      if (d.distanceKm) continue // ja calculat

      // Intenta obtenir destinació
      const dest =
        d.address ||
        d.location ||
        d.fincaAddress ||
        d.finca ||
        d.fincaNom ||
        d.FincaCode ||
        d.NomEvent ||
        ''

      const km = await distanceKm(dest)
      if (km === null) {
        console.warn(`No s'ha pogut calcular distància per ${colName}/${doc.id} -> ${dest}`)
        continue
      }

      await doc.ref.update({ distanceKm: km })
      console.log(`✓ ${colName}/${doc.id} distanceKm=${km.toFixed(2)} km`)
    }
  }
  console.log('Fi')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
