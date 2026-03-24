import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const collections = ['stage_taronja', 'stage_verd'] as const
    const results: Array<Record<string, unknown>> = []

    for (const name of collections) {
      const snapshot = await firestoreAdmin.collection(name).get()

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

    return NextResponse.json({ data: results, total: results.length })
  } catch (error) {
    console.error('Error llegint esdeveniments de Firestore:', error)
    return NextResponse.json(
      { error: 'Error llegint esdeveniments de Firestore' },
      { status: 500 }
    )
  }
}
