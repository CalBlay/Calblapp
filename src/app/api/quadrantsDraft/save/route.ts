// src/app/api/quadrantsDraft/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  normalizeDepartmentKey,
  type EditorGroup as GroupInput,
  type EditorRow as RowInput,
} from '@/lib/quadrantsDraftEditor'
import { saveDraftByDepartment } from '@/lib/quadrantsDraftSaveAdapters'

export const runtime = 'nodejs'
const ORIGIN = 'Molí Vinyals, 11, 08776 Sant Pere de Riudebitlles, Barcelona'
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

const norm = normalizeDepartmentKey

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

// Si no trobem col·lecció existent, fem un nom canònic
const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1)
  return `quadrants${capitalized}` // ex: quadrantsLogistica
}

async function resolveDeptCollection(dept: string): Promise<string> {
  const key = norm(dept)
  const cols = await db.listCollections()

  for (const c of cols) {
    const plain = c.id
      .replace(/^quadrants/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()

    if (plain === key) return c.id
  }

  // Fallback canònic (no cal que existeixi prèviament)
  return canonicalCollectionFor(dept)
}

async function calcDistanceKm(destination: string): Promise<number | null> {
  if (!GOOGLE_KEY || !destination) return null
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', ORIGIN)
    url.searchParams.set('destinations', destination)
    url.searchParams.set('key', GOOGLE_KEY)
    url.searchParams.set('mode', 'driving')
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const json = await res.json()
    const el = json?.rows?.[0]?.elements?.[0]
    if (el?.status !== 'OK') return null
    const meters = el.distance?.value
    if (!meters) return null
    return (meters / 1000) * 2 // anada+tornada
  } catch (err) {
    console.warn('[quadrantsDraft/save] distance error', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { department, eventId, rows, groups } = (await req.json()) as {
      department: string
      eventId: string
      rows: RowInput[]
      groups?: GroupInput[]
    }

    if (!department || !eventId || !Array.isArray(rows)) {
      return NextResponse.json(
        { ok: false, error: 'Bad payload' },
        { status: 400 }
      )
    }

    const coll = await resolveDeptCollection(department)
    const sourceDocId = String(eventId || '').trim()
    const canonicalEventId = normalizeEventId(eventId)
    const ref = db.collection(coll).doc(sourceDocId || canonicalEventId)
    await saveDraftByDepartment({
      db,
      coll,
      department,
      sourceDocId,
      canonicalEventId,
      rows,
      groups,
    })

    // Distància: sempre recalculada amb l'adreça actual
    const evSnap = await db.collection('stage_verd').doc(String(canonicalEventId)).get()
    const ev = evSnap.data() as any
    const destination = ev?.Ubicacio || ev?.location || ev?.address || ''
    const km = await calcDistanceKm(destination)
    if (km) {
      await ref.set({ distanceKm: km, distanceCalcAt: new Date() }, { merge: true })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quadrantsDraft/save] error:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    )
  }
}
