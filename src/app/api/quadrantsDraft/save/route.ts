// src/app/api/quadrantsDraft/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import {
  normalizeDepartmentKey,
  type EditorGroup as GroupInput,
  type EditorRow as RowInput,
} from '@/lib/quadrantsDraftEditor'
import { saveDraftByDepartment } from '@/lib/quadrantsDraftSaveAdapters'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { listAllCollectionIds } from '@/lib/firestoreCollections'
import { findQuadrantOverlapConflicts } from '@/lib/quadrantOverlapGuard'

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
  const cols = await listAllCollectionIds()

  for (const id of cols) {
    const plain = id
      .replace(/^quadrants/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()

    if (plain === key) return id
  }

  return canonicalCollectionFor(dept)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
    if (!canView) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    const canSave = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/quadrants', 'draft:save'),
    })
    if (canSave !== true) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { department, eventId, rows, groups, vestimentModel, ...docMetaFields } = (await req.json()) as {
      department: string
      eventId: string
      rows: RowInput[]
      groups?: GroupInput[]
      vestimentModel?: string | null
      phaseType?: string | null
      phaseLabel?: string | null
      phaseDate?: string | null
      code?: string | null
      eventName?: string | null
      location?: string | null
      meetingPoint?: string | null
      startDate?: string | null
      endDate?: string | null
      startTime?: string | null
      endTime?: string | null
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
    const overlapConflicts = await findQuadrantOverlapConflicts({
      assignments: rows
        .filter((row) => String(row?.name || '').trim() && String(row?.name || '').trim() !== 'Extra')
        .map((row) => ({
          id: row.id || null,
          name: row.name || null,
          startDate: row.startDate,
          endDate: row.endDate || row.startDate,
          startTime: row.startTime || '00:00',
          endTime: row.endTime || '23:59',
        })),
      excludeEventId: canonicalEventId,
      excludeDocIds: [sourceDocId].filter(Boolean),
    })
    if (overlapConflicts.length > 0) {
      const first = overlapConflicts[0]
      return NextResponse.json(
        {
          ok: false,
          error: `No es pot desar: ${first.personLabel} ja està assignat a ${first.source.eventId || first.source.docId} (${first.busy.startDate} ${first.busy.startTime}-${first.busy.endTime}).`,
          conflicts: overlapConflicts,
        },
        { status: 409 }
      )
    }
    const saved = await saveDraftByDepartment({
      db,
      coll,
      department,
      sourceDocId,
      canonicalEventId,
      rows,
      groups,
      vestimentModel,
      docMeta: docMetaFields,
    })

    revalidateQuadrantsListCache()
    return NextResponse.json({ ok: true, saved })
  } catch (e) {
    console.error('[quadrantsDraft/save] error:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    )
  }
}
