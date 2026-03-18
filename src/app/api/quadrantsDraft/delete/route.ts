import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const norm = (v?: string) =>
  (v || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const canonicalCollectionFor = (dept: string) => {
  const key = norm(dept)
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1)
  return `quadrants${capitalized}`
}

export async function POST(req: Request) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { department, eventId, phaseKey } = await req.json()

    if (!department || !eventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing department or eventId' },
        { status: 400 }
      )
    }

    const collection = db.collection(canonicalCollectionFor(department))
    const directRef = collection.doc(String(eventId))
    const directSnap = await directRef.get()

    if (directSnap.exists) {
      if (phaseKey) {
        const data = directSnap.data() as any
        const phases = Array.isArray(data?.logisticaPhases) ? data.logisticaPhases : []
        const target = String(phaseKey).toLowerCase().trim()
        const next = phases.filter((phase: any) => {
          const key = (phase?.key || phase?.label || '').toString().toLowerCase().trim()
          return key !== target
        })
        await directRef.set({ logisticaPhases: next }, { merge: true })
        return NextResponse.json({ ok: true, phaseDeleted: true, deletedCount: 1 })
      }

      await directRef.delete()
      return NextResponse.json({ ok: true, deletedCount: 1 })
    }

    const byEvent = await collection.where('eventId', '==', String(eventId)).get()
    if (byEvent.empty) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, deletedCount: 0 })
    }

    const targetPhase = String(phaseKey || '').toLowerCase().trim()
    const docsToDelete = byEvent.docs.filter((doc) => {
      if (!targetPhase) return true
      const data = doc.data() as any
      const keys = [data?.phaseKey, data?.phaseType, data?.phaseLabel]
        .map((value) => String(value || '').toLowerCase().trim())
        .filter(Boolean)
      return keys.includes(targetPhase)
    })

    if (docsToDelete.length === 0) {
      return NextResponse.json({ ok: true, alreadyDeleted: true, deletedCount: 0 })
    }

    const batch = db.batch()
    docsToDelete.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()

    return NextResponse.json({ ok: true, deletedCount: docsToDelete.length })
  } catch (e) {
    console.error('[quadrantsDraft/delete] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
