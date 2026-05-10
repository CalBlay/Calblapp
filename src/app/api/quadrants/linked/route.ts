// filename: src/app/api/quadrants/linked/route.ts
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { QUADRANTS_LIST_CACHE_TAG } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

const LINKED_REVALIDATE_SEC = 90

/**
 * Marge per multi-dia: quadrants que comencen abans del rang pero
 * acaben dins. 14 dies cobreix qualsevol esdeveniment realista.
 */
const RANGE_LOOKBACK_DAYS = 14

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type LinkedQuadrantEntry = {
  dept: string
  startTime: string
  responsable: string
}

function readResponsableName(raw: Record<string, unknown>): string {
  const r = raw.responsable
  if (r && typeof r === 'object' && r !== null && 'name' in r) {
    return String((r as { name?: unknown }).name ?? '')
  }
  return ''
}

function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const fetchLinkedCached = unstable_cache(
  async (start: string, end: string) => {
    const collections = ['quadrantsServeis', 'quadrantsCuina', 'quadrantsLogistica']
    const linked: Record<string, LinkedQuadrantEntry[]> = {}

    const lookbackStart = shiftIsoDate(start, -RANGE_LOOKBACK_DAYS)

    await Promise.all(
      collections.map(async (col) => {
        let docs: FirebaseFirestore.QueryDocumentSnapshot[] = []
        try {
          const snap = await db
            .collection(col)
            .where('startDate', '>=', lookbackStart)
            .where('startDate', '<=', end)
            .get()
          docs = snap.docs
        } catch (err) {
          console.warn(`[linked] fallback per ${col}`, err)
          const snap = await db.collection(col).get()
          docs = snap.docs
        }

        for (const doc of docs) {
          const d = doc.data() as Record<string, unknown>
          const code = String(d.code ?? '').trim().toUpperCase()
          if (!code) continue

          // Descarta docs amb endDate anterior al rang sol·licitat.
          const endDateField = String(d.endDate ?? d.startDate ?? '').slice(0, 10)
          if (endDateField && ISO_DAY.test(endDateField) && endDateField < start) continue

          if (!linked[code]) linked[code] = []
          linked[code].push({
            dept:
              String(d.department ?? '')
                .trim()
                .toLowerCase() || col.replace('quadrants', '').toLowerCase(),
            startTime: String(d.startTime ?? ''),
            responsable: readResponsableName(d),
          })
        }
      })
    )

    return linked
  },
  ['api-quadrants-linked-v1'],
  { revalidate: LINKED_REVALIDATE_SEC, tags: [QUADRANTS_LIST_CACHE_TAG] }
)

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const startRaw = searchParams.get('start') || ''
    const endRaw = searchParams.get('end') || ''
    const start = ISO_DAY.test(startRaw.slice(0, 10)) ? startRaw.slice(0, 10) : ''
    const end = ISO_DAY.test(endRaw.slice(0, 10)) ? endRaw.slice(0, 10) : ''

    if (!start || !end) {
      return NextResponse.json(
        { error: 'Falten start/end (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const linked = await fetchLinkedCached(start, end)
    return NextResponse.json({ ok: true, linked })
  } catch (err: unknown) {
    console.error('[linked] Error intern:', err)
    const message = err instanceof Error ? err.message : 'Error intern del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
