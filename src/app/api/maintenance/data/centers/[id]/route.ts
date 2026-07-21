import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { combineTravelParts, normalizeMaintenanceLocationKey } from '@/lib/maintenanceCenterTravel'
import {
  flattenMaintenanceLocationNodes,
  sanitizeMaintenanceInternalLocations,
  sanitizeMaintenanceLocationNodes,
} from '@/lib/maintenanceLocationCatalog'
import { requireMaintenanceDataAccess } from '@/lib/server/maintenanceApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const normalizeTipus = (raw?: unknown) => {
  const value = String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'propi') return 'propi'
  if (value === 'extern' || value === 'externo') return 'extern'
  const code = String(raw || '').trim().toUpperCase()
  if (code.startsWith('CC')) return 'propi'
  return value || '-'
}

const normalizeCode = (raw?: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()

type PatchBody = {
  name?: string
  code?: string
  tipus?: string
  travelMinutes?: number
  travelHours?: number
  travelMinutesPart?: number
  internalLocations?: string[]
  locationNodes?: unknown[]
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as PatchBody
    const ref = db.collection('finques').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Centre no trobat' }, { status: 404 })
    }

    let travelMinutes: number
    if (body.travelMinutes !== undefined) {
      travelMinutes = Math.max(0, Math.round(Number(body.travelMinutes) || 0))
    } else {
      travelMinutes = combineTravelParts(
        Number(body.travelHours ?? 0),
        Number(body.travelMinutesPart ?? 0)
      )
    }

    if (travelMinutes > 24 * 60) {
      return NextResponse.json(
        { error: 'El temps de desplacament no pot superar 24 hores' },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {
      maintenanceTravelMinutes: travelMinutes,
      maintenanceTravelUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    }

    const name = String(body.name || '').trim()
    const code = normalizeCode(body.code)
    if (name) {
      patch.nom = name
      patch.name = name
    }
    if (body.code !== undefined) {
      patch.code = code || undefined
      patch.codi = code || undefined
    }
    if (body.tipus !== undefined) {
      patch.tipus = normalizeTipus(body.tipus || code)
    }

    let nextLocationNodes: ReturnType<typeof sanitizeMaintenanceLocationNodes> | undefined
    if (body.internalLocations !== undefined) {
      patch.maintenanceInternalLocations = sanitizeMaintenanceInternalLocations(body.internalLocations)
    }
    if (body.locationNodes !== undefined) {
      nextLocationNodes = sanitizeMaintenanceLocationNodes(body.locationNodes)
      patch.maintenanceLocationNodes = nextLocationNodes
      patch.maintenanceInternalLocations = flattenMaintenanceLocationNodes(nextLocationNodes)
    }

    if (name || body.code !== undefined) {
      const duplicated = (await db.collection('finques').get()).docs.some((doc) => {
        if (doc.id === id) return false
        const data = doc.data() as Record<string, unknown>
        const currentName = String(data.nom || data.name || '').trim().toLowerCase()
        const currentCode = normalizeCode(data.codi || data.code || doc.id)
        return (name && currentName === name.toLowerCase()) || (code && currentCode === code)
      })
      if (duplicated) {
        return NextResponse.json(
          { error: 'Ja existeix un centre amb aquest nom o codi' },
          { status: 409 }
        )
      }
    }

    await ref.set(patch, { merge: true })

    return NextResponse.json({
      ok: true,
      id,
      travelMinutes,
      internalLocations:
        body.locationNodes !== undefined
          ? flattenMaintenanceLocationNodes(nextLocationNodes || [])
          : body.internalLocations !== undefined
            ? sanitizeMaintenanceInternalLocations(body.internalLocations)
            : undefined,
      locationNodes: body.locationNodes !== undefined ? nextLocationNodes : undefined,
      name: name || undefined,
      code: body.code !== undefined ? code : undefined,
      tipus: body.tipus !== undefined ? normalizeTipus(body.tipus || code) : undefined,
    })
  } catch (error) {
    console.error('[maintenance/data/centers/[id]] PATCH error', error)
    return NextResponse.json({ error: 'Error desant centre' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMaintenanceDataAccess('edit')
  if (!auth.ok) return auth.res

  try {
    const { id } = await ctx.params
    const ref = db.collection('finques').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Centre no trobat' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const centerName = String(data.nom || data.name || '').trim()
    const locationNodes = sanitizeMaintenanceLocationNodes(
      data.maintenanceLocationNodes,
      data.maintenanceInternalLocations
    )
    const relatedKeys = new Set(
      [centerName, ...flattenMaintenanceLocationNodes(locationNodes)]
        .map((item) => normalizeMaintenanceLocationKey(item))
        .filter(Boolean)
    )

    const [machinesSnap, ticketsSnap] = await Promise.all([
      db.collection('machines').get(),
      db.collection('maintenanceTickets').get(),
    ])

    const hasMachines = machinesSnap.docs.some((doc) => {
      const machine = doc.data() as Record<string, unknown>
      const locationKey = normalizeMaintenanceLocationKey(String(machine.location || ''))
      return locationKey && relatedKeys.has(locationKey)
    })

    const hasTickets = ticketsSnap.docs.some((doc) => {
      const ticket = doc.data() as Record<string, unknown>
      const locationKey = normalizeMaintenanceLocationKey(
        String(ticket.location || ticket.workLocation || ticket.sourceEventLocation || '')
      )
      return locationKey && relatedKeys.has(locationKey)
    })

    if (hasMachines || hasTickets) {
      return NextResponse.json(
        { error: 'Aquest centre te maquinaria o tickets relacionats i no es pot eliminar' },
        { status: 409 }
      )
    }

    await ref.delete()
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('[maintenance/data/centers/[id]] DELETE error', error)
    return NextResponse.json({ error: 'Error eliminant centre' }, { status: 500 })
  }
}
