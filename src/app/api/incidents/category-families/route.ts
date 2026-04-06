export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { canManageIncidentCategories } from '@/lib/incidentPolicy'
import { mergeFamilyLabels, normalizeFamilyPrefix } from '@/lib/incidentTypology'

const DOC_PATH = 'incident_settings'
const DOC_ID = 'category_families'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canManageIncidentCategories(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const ref = firestoreAdmin.collection(DOC_PATH).doc(DOC_ID)
    const snap = await ref.get()
    const raw = snap.exists ? (snap.data()?.labels as Record<string, unknown> | undefined) : undefined
    const families = mergeFamilyLabels(raw)

    return NextResponse.json({ families }, { status: 200 })
  } catch (e) {
    console.error('[incidents/category-families GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canManageIncidentCategories(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const body = (await req.json()) as { labels?: Record<string, string> }
    const incoming = body.labels
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ error: 'Falten labels' }, { status: 400 })
    }

    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(incoming)) {
      const prefix = normalizeFamilyPrefix(k)
      if (!prefix) continue
      if (typeof v === 'string' && v.trim()) cleaned[prefix] = v.trim()
    }

    const ref = firestoreAdmin.collection(DOC_PATH).doc(DOC_ID)
    await ref.set(
      {
        labels: cleaned,
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    )

    const merged = mergeFamilyLabels(cleaned)
    return NextResponse.json({ families: merged }, { status: 200 })
  } catch (e) {
    console.error('[incidents/category-families PATCH]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
