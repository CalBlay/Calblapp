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
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

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

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { department, eventId, rows, groups, vestimentModel } = (await req.json()) as {
      department: string
      eventId: string
      rows: RowInput[]
      groups?: GroupInput[]
      vestimentModel?: string | null
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
    await saveDraftByDepartment({
      db,
      coll,
      department,
      sourceDocId,
      canonicalEventId,
      rows,
      groups,
      vestimentModel,
    })

    revalidateQuadrantsListCache()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quadrantsDraft/save] error:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    )
  }
}
