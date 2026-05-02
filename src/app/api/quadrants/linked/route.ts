// ✅ filename: src/app/api/quadrants/linked/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

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

export async function GET(req: Request) {
  try {
    console.log('🟢 [linked] Iniciant consulta a Firestore...')
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    if (start && end) {
      console.log(`📆 [linked] Paràmetres rebuts: ${start} → ${end}`)
    }

    const collections = ['quadrantsServeis', 'quadrantsCuina', 'quadrantsLogistica']
    const linked: Record<string, LinkedQuadrantEntry[]> = {}

    await Promise.all(
      collections.map(async (col) => {
        console.log(`📂 [linked] Llegint col·lecció: ${col}`)
        const snapshot = await db.collection(col).get()
        console.log(`📊 [linked] Docs trobats a ${col}:`, snapshot.size)

        snapshot.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>
          const code = String(d.code ?? '')
            .trim()
            .toUpperCase()
          if (!code) return

          if (!linked[code]) linked[code] = []
          linked[code].push({
            dept:
              String(d.department ?? '')
                .trim()
                .toLowerCase() || col.replace('quadrants', '').toLowerCase(),
            startTime: String(d.startTime ?? ''),
            responsable: readResponsableName(d),
          })
        })
      })
    )

    const codes = Object.keys(linked)
    console.log('✅ [linked] Codis totals trobats:', codes.length)
    if (codes.length) console.log('📦 Exemple primer codi:', codes[0], linked[codes[0]])

    return NextResponse.json({ ok: true, linked })
  } catch (err: unknown) {
    console.error('❌ [linked] Error intern:', err)
    const message = err instanceof Error ? err.message : 'Error intern del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
