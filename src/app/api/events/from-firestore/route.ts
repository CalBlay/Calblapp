import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const DEFAULT_LIMIT_PER_COLLECTION = 400
const MAX_LIMIT_PER_COLLECTION = 1500

/**
 * Lectura acotada de stage_taronja / stage_verd (evita .get() sense límit).
 * Query: limitPerCol (default 400, max 1500 per col·lecció).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const raw = Number(searchParams.get('limitPerCol') || searchParams.get('limit') || '')
    const limitPerCol = Math.min(
      MAX_LIMIT_PER_COLLECTION,
      Math.max(
        1,
        Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMIT_PER_COLLECTION
      )
    )

    const collections = ['stage_taronja', 'stage_verd'] as const
    const results: Array<Record<string, unknown>> = []

    for (const name of collections) {
      const snapshot = await firestoreAdmin.collection(name).limit(limitPerCol).get()

      snapshot.forEach((doc) => {
        const data = doc.data() as Record<string, unknown>
        const normalizedData = {
          ...data,
          LN:
            data.LN ||
            data.ln ||
            (typeof data.LN === 'string' && data.LN.trim()) ||
            'Altres',
        }

        const stageGroup = name === 'stage_taronja' ? 'Proposta' : 'Confirmat'
        const origen = data.origen || 'zoho'

        results.push({
          id: doc.id,
          ...normalizedData,
          StageGroup: stageGroup,
          origen,
        })
      })
    }

    results.sort(
      (a, b) =>
        new Date(String(a.DataInici || a.Data || 0)).getTime() -
        new Date(String(b.DataInici || b.Data || 0)).getTime()
    )

    if (results[0]) {
      console.log('Firestore sample:', {
        LN: results[0].LN,
        Servei: results[0].Servei,
        StageGroup: results[0].StageGroup,
      })
    }

    return NextResponse.json({
      data: results,
      total: results.length,
      limitPerCol,
      capped: true,
    })
  } catch (error) {
    console.error('Error llegint esdeveniments de Firestore:', error)
    return NextResponse.json(
      { error: 'Error llegint esdeveniments de Firestore' },
      { status: 500 }
    )
  }
}
