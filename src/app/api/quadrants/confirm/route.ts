// file: src/app/api/quadrants/confirm/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import { Timestamp } from 'firebase-admin/firestore'
import { ensureEventChatChannel } from '@/lib/messaging/eventChat'

export const runtime = 'nodejs'

interface QuadrantDoc {
  status?: string
  treballadors?: Array<{ name: string }>
  conductors?: Array<{ name: string }>
  responsable?: { name: string }
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  [key: string]: unknown
}

interface TokenWithUser {
  email?: string
  user?: { email?: string }
}

type ValidUser = {
  userId: string
  name: string
}

const norm = (v?: string) =>
  (v || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function resolveValidUsers(doc: QuadrantDoc | null): Promise<ValidUser[]> {
  if (!doc) return []

  const assignedNames = [
    doc.responsable?.name,
    ...(doc.conductors || []).map((person) => person.name),
    ...(doc.treballadors || []).map((person) => person.name),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  if (assignedNames.length === 0) return []

  const wanted = new Set(assignedNames.map((value) => norm(value)))
  const usersSnap = await db.collection('users').get()

  return usersSnap.docs
    .map((userDoc) => {
      const data = userDoc.data() as { name?: string }
      const name = String(data.name || '').trim()
      if (!name || !wanted.has(norm(name))) return null
      return { userId: userDoc.id, name }
    })
    .filter((item): item is ValidUser => item !== null)
}

export async function POST(req: NextRequest) {
  try {
    // -------------------------------------------------------
    // 1) Validació sessió
    // -------------------------------------------------------
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as TokenWithUser | null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // -------------------------------------------------------
    // 2) Validació paràmetres
    // -------------------------------------------------------
    const body = await req.json()
    const deptRaw = body?.department || body?.dept || ''
    const eventId = body?.eventId || body?.id || ''

    if (!deptRaw || !eventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing department or eventId' },
        { status: 400 }
      )
    }

    const dept = norm(deptRaw)
    const colName = `quadrants${capitalize(dept)}`
    const ref = db.collection(colName).doc(String(eventId))

    // -------------------------------------------------------
    // 3) Obtenir informació extres (event code + quadrant data)
    // -------------------------------------------------------
    const stageSnap = await db.collection('stage_verd').doc(String(eventId)).get()
    const stageData = stageSnap.exists ? stageSnap.data() : null

    const snap = await ref.get()
    const prev = snap.exists ? (snap.data() as QuadrantDoc) : null
    const already = prev?.status === 'confirmed'
    const validUsers = await resolveValidUsers(prev)

    // -------------------------------------------------------
    // 4) Confirmar quadrant
    // -------------------------------------------------------
    await ref.set(
      {
        status: 'confirmed',
        confirmedAt: Timestamp.fromDate(new Date()),
        confirmedBy: token.user?.email || token.email || 'system',
        code: stageData?.code || stageData?.C_digo || '',
      },
      { merge: true }
    )

    try {
      await ensureEventChatChannel(String(eventId))
    } catch {
      // ignore chat creation errors
    }

    // Crear notificacions + push
    const eventName = stageData?.eventName || stageData?.Nom || 'Nou esdeveniment'
    const pushTitle = 'Tens un nou torn assignat'
    const pushBody = `${eventName} – ${prev?.startDate} ${prev?.startTime}`

    if (validUsers.length > 0) {
      const batch = db.batch()
      const now = Date.now()
      for (const u of validUsers) {
        const notifRef = db
          .collection('users')
          .doc(u.userId)
          .collection('notifications')
          .doc()
        batch.set(notifRef, {
          title: pushTitle,
          body: pushBody,
          createdAt: now,
          read: false,
          type: 'torn',
          eventId: String(eventId),
          eventDate: prev?.startDate || null,
        })
      }
      await batch.commit()

      await Promise.all(
        validUsers.map(u =>
          fetch(`${req.nextUrl.origin}/api/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: u.userId,
              title: pushTitle,
              body: pushBody,
              url: `/menu/torns?open=${eventId}`,
            }),
          }).catch(() => {})
        )
      )
    }

    return NextResponse.json({ ok: true, already })
  } catch (e) {
    console.error('[quadrants/confirm] error', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
