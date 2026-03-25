// src/app/api/quadrantsDraft/unconfirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

// ── Utils locals
const norm = (s?: string | null) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  return `quadrants${key.charAt(0).toUpperCase()}${key.slice(1)}`
}

async function resolveDeptCollection(dept: string) {
  const key = norm(dept)
  const cols = await db.listCollections()
  for (const c of cols) {
    const plain = c.id
      .replace(/^quadrants/i, '')
      .replace(/[_\-\s]/g, '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
    if (plain === key) return c.id
  }
  return canonicalCollectionFor(dept)
}

type TokenLike = {
  email?: string
  role?: string
  department?: string
  user?: {
    email?: string
    role?: string
    department?: string
  }
}

async function getRoleAndDept(token: TokenLike) {
  const email: string | undefined = token?.email || token?.user?.email
  let role = String(token?.role || token?.user?.role || '').toLowerCase()
  let dept = norm(token?.department || token?.user?.department || '')

  // Si falta rol/dept, intenta llegir-ho de Firestore (users/{email})
  if ((!role || !dept) && email) {
    const snap = await db.collection('users').doc(email).get()
    if (snap.exists) {
      const u = snap.data() as { role?: string; department?: string; dept?: string } | undefined
      role = role || String(u?.role || '').toLowerCase()
      dept = dept || norm(u?.department || u?.dept || '')
    }
  }
  return { role, dept, email }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = (await req.json()) as { department: string; eventId: string }
    const department = payload.department
    const eventId = normalizeEventId(payload.eventId)
    if (!department || !eventId) {
      return NextResponse.json({ ok: false, error: 'Bad payload' }, { status: 400 })
    }

    const reqDept = norm(department)
    const { role, dept } = await getRoleAndDept(token as TokenLike)

    // ✅ Mateixa política que a confirm:
    //  - Admin/Direcció → tot
    //  - Cap Departament → el seu dept
    //  - Rol desconegut → PERMESSIU si tenim dept i coincideix amb el de la petició
    const isAdminLike = ['admin', 'direccio', 'direcció'].includes(role)
    const isCapDept =
      role === 'cap departament' ||
      role === 'capdepartament' ||
      role === 'cap'

    const permissiveWhenUnknown =
      (!role || role === 'unknown' || role === '') && !!dept && dept === reqDept

    if (!(isAdminLike || (isCapDept && dept === reqDept) || permissiveWhenUnknown)) {
      return NextResponse.json(
        { ok: false, error: `Forbidden: rol ${role || '(unknown)'} sense permís al departament ${reqDept}` },
        { status: 403 }
      )
    }

    const coll = await resolveDeptCollection(department)
    const collection = db.collection(coll)
    const directRef = collection.doc(eventId)
    const directSnap = await directRef.get()
    const byEvent = await collection.where('eventId', '==', eventId).get()

    const refs = new Map<string, FirebaseFirestore.DocumentReference>()
    if (directSnap.exists) refs.set(directRef.id, directRef)
    byEvent.docs.forEach((doc) => refs.set(doc.id, doc.ref))

    if (refs.size === 0) {
      await directRef.set(
        {
          status: 'draft',
          confirmedAt: null,
          confirmedBy: null,
          updatedAt: new Date(),
        },
        { merge: true }
      )
    } else {
      const batch = db.batch()
      refs.forEach((ref) => {
        batch.set(
          ref,
          {
            status: 'draft',
            confirmedAt: null,
            confirmedBy: null,
            updatedAt: new Date(),
          },
          { merge: true }
        )
      })
      await batch.commit()
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[quadrantsDraft/unconfirm] error', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
