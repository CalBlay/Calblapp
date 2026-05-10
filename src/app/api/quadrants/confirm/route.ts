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
    const [stageSnap, firstSnap] = await Promise.all([
      db.collection('stage_verd').doc(String(eventId)).get(),
      firstRef.get(),
    ])
    const stageData = stageSnap.exists ? (stageSnap.data() as Record<string, unknown>) : null
    const firstPrev = firstSnap.exists ? (firstSnap.data() as QuadrantConfirmDoc) : null
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
