// file: src/app/api/quadrants/confirm/route.ts
import { after, NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import { Timestamp } from 'firebase-admin/firestore'
import {
  commitQuadrantConfirmedFirestoreBatch,
  deferQuadrantConfirmSideEffects,
  quadrantConfirmTrim,
  extractAssignedNamesFromQuadrant,
  computeQuadrantProposalDiff,
  type QuadrantConfirmDoc,
  qcNorm,
} from '@/lib/quadrantsConfirmDeferred'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import { findQuadrantOverlapConflicts } from '@/lib/quadrantOverlapGuard'

export const runtime = 'nodejs'

interface TokenWithUser {
  email?: string
  user?: { email?: string }
}

/**
 * Delega al modul `firestoreCollections` que comparteix el cache de
 * `listCollections()` entre tots els call sites del projecte.
 * Aquesta col·leccio prefereix `quadrant{Dept}` (singular) si existeix.
 */
async function resolveWriteCollectionForDepartment(department: string) {
  return resolveQuadrantCollection(department, { fallback: 'plural' })
}

export async function POST(req: NextRequest) {
  try {
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as TokenWithUser | null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const deptRaw = body?.department || body?.dept || ''
    const eventId = body?.eventId || body?.id || ''
    const docIdsIn = Array.isArray(body?.docIds) ? body.docIds : null

    if (!deptRaw || !eventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing department or eventId' },
        { status: 400 }
      )
    }

    const dept = qcNorm(deptRaw)
    const docIds: string[] =
      docIdsIn && docIdsIn.length
        ? Array.from(
            new Set(
              docIdsIn
                .map((x: unknown) => String(x || '').trim())
                .filter((id): id is string => id.length > 0)
            )
          )
        : [String(eventId)]

    const colName = await resolveWriteCollectionForDepartment(deptRaw)
    const firstRef = db.collection(colName).doc(docIds[0])
    const [stageSnap, firstSnap, currentDocsSnap] = await Promise.all([
      db.collection('stage_verd').doc(String(eventId)).get(),
      firstRef.get(),
      Promise.all(docIds.map((docId) => db.collection(colName).doc(docId).get())),
    ])
    const stageData = stageSnap.exists ? (stageSnap.data() as Record<string, unknown>) : null
    const firstPrev = firstSnap.exists ? (firstSnap.data() as QuadrantConfirmDoc) : null
    const overlapAssignments = currentDocsSnap.flatMap((snap) => {
      if (!snap.exists) return []
      const data = snap.data() as QuadrantConfirmDoc & {
        responsables?: Array<Record<string, unknown>>
        conductors?: Array<Record<string, unknown>>
        treballadors?: Array<Record<string, unknown>>
      }
      const assignments: Array<{
        id?: string | null
        name?: string | null
        startDate: string
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }> = []
      const push = (entry: {
        id?: string | null
        name?: string | null
        startDate?: string | null
        endDate?: string | null
        startTime?: string | null
        endTime?: string | null
      }) => {
        const id = String(entry.id || '').trim()
        const name = String(entry.name || '').trim()
        const startDate = String(entry.startDate || data.startDate || '').trim()
        const endDate = String(entry.endDate || data.endDate || startDate).trim()
        const startTime = String(entry.startTime || data.startTime || '00:00').trim() || '00:00'
        const endTime = String(entry.endTime || data.endTime || '23:59').trim() || '23:59'
        if ((!id && !name) || !startDate || !endDate) return
        assignments.push({ id: id || null, name: name || null, startDate, endDate, startTime, endTime })
      }
      push({ name: String(data.responsableName || data.responsable?.name || '').trim() || null })
      ;(Array.isArray(data.responsables) ? data.responsables : []).forEach((line) => push(line))
      ;(Array.isArray(data.conductors) ? data.conductors : []).forEach((line) => push(line))
      ;(Array.isArray(data.treballadors) ? data.treballadors : []).forEach((line) => push(line))
      return assignments
    })
    const overlapConflicts = await findQuadrantOverlapConflicts({
      assignments: overlapAssignments,
      excludeDocIds: docIds,
    })
    if (overlapConflicts.length > 0) {
      const first = overlapConflicts[0]
      return NextResponse.json(
        {
          ok: false,
          error: `No es pot confirmar: ${first.personLabel} ja està assignat a ${first.source.eventId || first.source.docId} (${first.busy.startDate} ${first.busy.startTime}-${first.busy.endTime}).`,
          conflicts: overlapConflicts,
        },
        { status: 409 }
      )
    }
    const already = firstPrev?.status === 'confirmed'
    const assigned = extractAssignedNamesFromQuadrant(firstPrev)
    const diff = computeQuadrantProposalDiff({ proposal: firstPrev?.autoProposal || null, finalAssigned: assigned })

    const confirmedAt = Timestamp.fromDate(new Date())
    const confirmedBy = token.user?.email || token.email || 'system'

    await commitQuadrantConfirmedFirestoreBatch({
      colName,
      docIds,
      confirmPatch: {
        status: 'confirmed',
        confirmedAt,
        confirmedBy,
        code: quadrantConfirmTrim(stageData?.code ?? stageData?.C_digo ?? ''),
      },
    })

    const requestOrigin = req.nextUrl.origin
    after(async () => {
      await deferQuadrantConfirmSideEffects({
        requestOrigin,
        dept,
        colName,
        eventId: String(eventId),
        confirmedAtIso: confirmedAt.toDate().toISOString(),
        confirmedBy,
        firstPrev,
        stageData,
        assigned,
        diff,
      })
    })

    return NextResponse.json({ ok: true, already })
  } catch (e) {
    console.error('[quadrants/confirm] error', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
