import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { processTransportReviewNotifications } from '@/lib/transportReviewNotifications'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireTransportsFleetEdit } from '@/lib/server/transportsApiAuth'

type TransportDocument = {
  id?: string
  name?: string
  url?: string
  uploadedAt?: string
}

type MonthlyMileageEntry = {
  month?: string
  km?: number
  updatedAt?: string
}

const normalizeDocument = (doc: TransportDocument, index: number) => {
  const url = String(doc?.url || '').trim()
  if (!url) return null
  return {
    id: String(doc?.id || `doc-${index}`),
    name: String(doc?.name || url.split('/').pop()?.split('?')[0] || `Document ${index + 1}`),
    url,
    uploadedAt: String(doc?.uploadedAt || new Date().toISOString()),
  }
}

const normalizeMonthlyMileage = (entries: MonthlyMileageEntry[] | undefined) =>
  Array.isArray(entries)
    ? entries
        .map((entry) => {
          const month = String(entry?.month || '').trim()
          const km = Number(entry?.km)
          if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(km) || km < 0) return null
          return {
            month,
            km,
            updatedAt: String(entry?.updatedAt || new Date().toISOString()),
          }
        })
        .filter(Boolean)
        .sort((a, b) => String((a as { month: string }).month).localeCompare(String((b as { month: string }).month)))
    : []

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const denied = await requireTransportsFleetEdit(auth)
    if (denied) return denied

    const body = await req.json()
    const {
      plate,
      type,
      conductorId,
      itvDate,
      itvExpiry,
      lastService,
      lastServiceKm,
      nextService,
      documents,
      monthlyMileage,
    } = body as {
      plate: string
      type: string
      conductorId?: string | null
      itvDate?: string | null
      itvExpiry?: string | null
      lastService?: string | null
      lastServiceKm?: number | null
      nextService?: string | null
      documents?: TransportDocument[]
      monthlyMileage?: MonthlyMileageEntry[]
    }

    if (!plate || !type) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }

    const normalizedDocuments = Array.isArray(documents)
      ? documents
          .map((doc, index) => normalizeDocument(doc, index))
          .filter(Boolean)
      : []
    const normalizedMonthlyMileage = normalizeMonthlyMileage(monthlyMileage)
    const normalizedLastServiceKm =
      typeof lastServiceKm === 'number' && Number.isFinite(lastServiceKm) && lastServiceKm >= 0
        ? lastServiceKm
        : null

    const ref = await firestoreAdmin.collection('transports').add({
      plate: String(plate).trim(),
      type: String(type).trim(),
      conductorId: conductorId || null,
      itvDate: itvDate || null,
      itvExpiry: itvExpiry || null,
      lastService: lastService || null,
      lastServiceKm: normalizedLastServiceKm,
      nextService: nextService || null,
      documents: normalizedDocuments,
      monthlyMileage: normalizedMonthlyMileage,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    try {
      const origin = new URL(req.url).origin
      await processTransportReviewNotifications(origin)
    } catch (error) {
      console.error('[API /transports] review notifications POST:', error)
    }

    return NextResponse.json({ success: true, id: ref.id })
  } catch (error: unknown) {
    console.error('[API /transports] Error POST:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const snap = await firestoreAdmin.collection('transports').get()
    const data = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }))
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('[API /transports] Error GET:', error)
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
