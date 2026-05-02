//filename: src/app/api/quadrants/details/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

type StageData = {
  comercial: string
  servei: string
  stageColor: string
}

type DepartamentQuadrant = {
  responsable: string
  startTime: string
  conductors: unknown[]
  treballadors: unknown[]
}

function asRecord(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const code = (searchParams.get('code') || '').trim().toUpperCase()

    if (!code) {
      return NextResponse.json({ error: 'Falta el codi' }, { status: 400 })
    }

    console.log('🔎 [quadrants/details] Buscant dades per code:', code)

    // 1️⃣ Buscar dins les col·leccions de stage
    const stageCollections = ['stage_taronja', 'stage_taronja', 'stage_verd']
    let stageData: StageData | null = null

    for (const col of stageCollections) {
      const snap = await db.collection(col).where('code', '==', code).limit(1).get()
      if (!snap.empty) {
        const d = asRecord(snap.docs[0].data())
        stageData = {
          comercial: String(d.comercial ?? ''),
          servei: String(d.servei ?? ''),
          stageColor: col.replace('stage_', ''),
        }
        break
      }
    }

    // 2️⃣ Buscar coincidències en altres departaments
    const quadrantCollections = ['quadrantsServeis', 'quadrantsCuina', 'quadrantsLogistica']
    const departaments: Record<string, DepartamentQuadrant> = {}

    for (const col of quadrantCollections) {
      const snap = await db.collection(col).where('code', '==', code).limit(1).get()
      if (!snap.empty) {
        const d = asRecord(snap.docs[0].data())
        const dept =
          String(d.department ?? '')
            .trim()
            .toLowerCase() || col.replace('quadrants', '').toLowerCase()

        const resp = d.responsable
        const responsableName =
          resp && typeof resp === 'object' && resp !== null && 'name' in resp
            ? String((resp as { name?: unknown }).name ?? '')
            : ''

        departaments[dept] = {
          responsable: responsableName,
          startTime: String(d.startTime ?? ''),
          conductors: Array.isArray(d.conductors) ? d.conductors : [],
          treballadors: Array.isArray(d.treballadors) ? d.treballadors : [],
        }
      }
    }

    return NextResponse.json({
      ok: true,
      code,
      stage: stageData,
      departaments,
    })
  } catch (err: unknown) {
    console.error('❌ [quadrants/details] Error:', err)
    const message = err instanceof Error ? err.message : 'Error intern del servidor'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
