import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireQuadrantsPremissesEdit } from '@/lib/server/quadrantsApiAuth'
import { QUADRANTS_ALLOWED_DEPARTMENTS } from '@/lib/quadrantsPermissions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

type PersonnelItem = {
  id: string
  name: string
  isDriver: boolean
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const requestedDept = norm(
      searchParams.get('department') || auth.user.department || ''
    )

    if (!QUADRANTS_ALLOWED_DEPARTMENTS.has(requestedDept)) {
      return NextResponse.json({ error: 'Departament no vàlid' }, { status: 400 })
    }

    const canAccess = await requireQuadrantsPremissesEdit(auth, requestedDept)
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

    try {
      const lowerSnap = await db
        .collection('personnel')
        .where('departmentLower', '==', requestedDept)
        .get()
      lowerSnap.docs.forEach((doc) => byId.set(doc.id, doc))
      if (lowerSnap.empty) {
        const exactSnap = await db
          .collection('personnel')
          .where('department', '==', requestedDept)
          .get()
        exactSnap.docs.forEach((doc) => byId.set(doc.id, doc))
      }
    } catch {}

    if (byId.size === 0) {
      const fallbackSnap = await db.collection('personnel').get()
      fallbackSnap.docs.forEach((doc) => {
        const data = doc.data() as { department?: string; departmentLower?: string }
        if (norm(data?.department || data?.departmentLower || '') === requestedDept) {
          byId.set(doc.id, doc)
        }
      })
    }

    const personnel = Array.from(byId.values())
      .map((doc) => {
        const data = doc.data() as {
          name?: string
          department?: string
          departmentLower?: string
          isDriver?: boolean
          driver?: { isDriver?: boolean; camioGran?: boolean; camioPetit?: boolean }
        }
        const isDriver =
          data?.isDriver === true ||
          data?.driver?.isDriver === true ||
          data?.driver?.camioGran === true ||
          data?.driver?.camioPetit === true

        return {
          id: doc.id,
          name: String(data?.name || '').trim(),
          department: norm(data?.department || data?.departmentLower || ''),
          isDriver,
        }
      })
      .filter((item) => item.department === requestedDept && item.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'ca'))

    const people: PersonnelItem[] = personnel.map((item) => ({
      id: item.id,
      name: item.name,
      isDriver: item.isDriver,
    }))

    return NextResponse.json({
      people,
      drivers: people.filter((item) => item.isDriver),
    })
  } catch (error) {
    console.error('[quadrants/premises/personnel] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
