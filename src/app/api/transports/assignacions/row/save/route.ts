// src/app/api/transports/assignacions/row/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getToken } from 'next-auth/jwt'
import crypto from 'crypto'
import {
  parseConductorSlotIndex,
  parsePendingAssignacionsRowId,
} from '@/lib/transportAssignacionsRowSlot'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type RowInput = {
  id?: string
  name?: string
  plate?: string
  vehicleType?: string
  startDate?: string
  endDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type SaveBody = {
  eventCode?: string
  department?: string
  rowId?: string
  rowIndex?: number
  /** Mateix `quadrantDocId` que retorna GET assignacions; substitueix per índex estable. */
  quadrantDocId?: string
  conductorIndex?: number
  /** `false` = edició d’una fila existent (no afegir conductor nou si no hi ha match). */
  isNew?: boolean
  /** Valors abans d’editar (per localitzar la mateixa entrada al array `conductors`). */
  priorConductor?: { name?: string; plate?: string }
  data?: RowInput
  originalPlate?: string
}

type QuadrantConductorRecord = RowInput & {
  id?: string
  department?: string
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
}

type TreballadorRecord = {
  name?: string
  plate?: string
  meetingPoint?: string
}

type QuadrantRecord = Record<string, unknown> & {
  code?: string
  conductors?: QuadrantConductorRecord[]
  treballadors?: TreballadorRecord[]
  /** Logística amb grups: `driverName` aquí té prioritat sobre `conductors[]` al llistat de quadrants. */
  groups?: unknown[]
  startDate?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
}

type TokenLike = {
  name?: string
  email?: string
}

function normName(s?: string | null) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function findPriorConductorIndex(
  list: QuadrantConductorRecord[],
  prior?: { name?: string; plate?: string },
  plateNorm: (s?: string | null) => string
): number | null {
  if (!prior) return null
  const pn = normName(prior.name)
  const pp = plateNorm(prior.plate)
  if (!pn && !pp) return null

  const hits: number[] = []
  list.forEach((c, i) => {
    const cn = normName(c.name)
    const cp = plateNorm(c.plate)
    if (pn && pp) {
      if (cn === pn && cp === pp) hits.push(i)
    } else if (pn) {
      if (cn === pn) hits.push(i)
    } else if (pp) {
      if (cp === pp) hits.push(i)
    }
  })
  if (hits.length === 0) return null
  return hits[0]
}

/** Mateixa persona “antiga” que `priorConductor` (per treure duplicats a conductors). */
function matchesPriorIdentity(
  row: { name?: string; plate?: string },
  prior: { name?: string; plate?: string } | undefined,
  plateNorm: (s?: string | null) => string
): boolean {
  if (!prior) return false
  const pn = normName(prior.name)
  const pp = plateNorm(prior.plate)
  if (!pn && !pp) return false
  const cn = normName(row.name)
  const cp = plateNorm(row.plate)
  if (pn && pp) return cn === pn && cp === pp
  if (pn) return cn === pn
  return cp === pp
}

function resolveConductorRowIdAfterSave(
  list: QuadrantConductorRecord[],
  data: RowInput,
  normPlate: (s?: string | null) => string
): string | undefined {
  const dn = normName(data.name)
  const dp = normPlate(data.plate)
  if (!dn) return undefined
  let hit = list.find(
    (c) => normName(c.name) === dn && (!dp || normPlate(c.plate) === dp)
  )
  if (!hit) hit = list.find((c) => normName(c.name) === dn)
  const id = hit?.id ? String(hit.id) : ''
  return id && !id.startsWith('pending:') ? id : undefined
}

/** Manté `groups[].driverName` alineat amb `conductors[]` després d’editar des d’Assignacions. */
function syncLogisticsGroupsDrivers(
  groups: unknown,
  opts: {
    priorNameNorm: string
    priorDriverId?: string
    newName: string
    newDriverId?: string
  }
): unknown[] | undefined {
  const { priorNameNorm, priorDriverId, newName, newDriverId } = opts
  if (!priorNameNorm || !Array.isArray(groups) || groups.length === 0) return undefined
  const newNameTrim = String(newName || '').trim()
  if (!newNameTrim) return undefined
  const pid = String(priorDriverId || '').trim()
  let changed = false
  const next = (groups as Record<string, unknown>[]).map((g) => {
    if (!g || typeof g !== 'object') return g
    const gNorm = normName(String(g.driverName ?? ''))
    const gid = String(g.driverId ?? '').trim()
    const nameMatch = Boolean(gNorm && gNorm === priorNameNorm)
    const idMatch = Boolean(pid && gid && gid === pid)
    if (!nameMatch && !idMatch) return g
    changed = true
    const patch: Record<string, unknown> = { ...g, driverName: newNameTrim }
    if (newDriverId) patch.driverId = newDriverId
    return patch
  })
  return changed ? next : undefined
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const authToken = token as TokenLike

    const body = (await req.json()) as SaveBody
    const {
      eventCode,
      department,
      rowId,
      rowIndex,
      quadrantDocId,
      conductorIndex,
      isNew: bodyIsNew,
      priorConductor,
      data,
      originalPlate,
    } = body || {}
    const isExplicitEdit = bodyIsNew === false

    if (!eventCode || !department || !data) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const colName = `quadrants${cap(department)}`
    const qidBody = typeof quadrantDocId === 'string' ? quadrantDocId.trim() : ''
    const fromPendingId = parsePendingAssignacionsRowId(
      typeof rowId === 'string' ? rowId : undefined
    )
    const effectiveQid = qidBody || fromPendingId?.quadrantDocId || ''

    let ref: FirebaseFirestore.DocumentReference
    let current: QuadrantRecord
    let resolvedByQuadrantDocId = false

    if (effectiveQid) {
      const docSnap = await db.collection(colName).doc(effectiveQid).get()
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Quadrant not found' }, { status: 404 })
      }
      const d = docSnap.data() as QuadrantRecord
      if (String(d.code ?? '') !== String(eventCode)) {
        return NextResponse.json({ error: 'Event code mismatch' }, { status: 400 })
      }
      ref = docSnap.ref
      current = d
      resolvedByQuadrantDocId = true
    } else {
      const snap = await db
        .collection(colName)
        .where('code', '==', String(eventCode))
        .limit(1)
        .get()

      if (snap.empty) {
        return NextResponse.json({ error: 'Quadrant not found' }, { status: 404 })
      }

      ref = snap.docs[0].ref
      current = snap.docs[0].data() as QuadrantRecord
    }

    const now = new Date().toISOString()
    const user = authToken.name || authToken.email || 'system'

    const conductors = Array.isArray(current.conductors) ? current.conductors : []

    let effectiveSlot = parseConductorSlotIndex(conductorIndex)
    if (effectiveSlot === null && fromPendingId) {
      effectiveSlot = fromPendingId.conductorIndex
    }

    if (
      resolvedByQuadrantDocId &&
      effectiveSlot !== null &&
      effectiveSlot >= conductors.length
    ) {
      return NextResponse.json(
        {
          error:
            'Índex de conductor desactualitzat (refresca la pàgina d’Assignacions i torna-ho a provar).',
        },
        { status: 409 }
      )
    }

    const idToUse = rowId || data?.id || crypto.randomUUID()

    const normPlate = (s?: string | null) => String(s || '').trim().toUpperCase()
    const targetPlate = normPlate(data?.plate)
    const origPlateNorm = normPlate(originalPlate)

    const persistConductorId = (
      existing: QuadrantConductorRecord | undefined,
      incomingFromClient?: string
    ) => {
      const inc = String(incomingFromClient ?? '').trim()
      if (
        inc &&
        !inc.startsWith('pending:') &&
        inc !== '__assignacions_current__'
      ) {
        return inc
      }
      const raw = existing?.id
      if (raw && !String(raw).startsWith('pending:')) return String(raw)
      return crypto.randomUUID()
    }

    const buildMerged = (c: QuadrantConductorRecord): QuadrantConductorRecord => ({
      ...c,
      id: persistConductorId(c, data?.id),
      department,
      name: data.name ?? c.name ?? '',
      plate: String(data.plate ?? c.plate ?? '').trim(),
      vehicleType: data.vehicleType ?? c.vehicleType ?? '',
      startDate: data.startDate ?? c.startDate ?? current.startDate ?? '',
      endDate:
        data.endDate ??
        data.startDate ??
        c.endDate ??
        c.startDate ??
        '',
      startTime: data.startTime ?? c.startTime ?? current.startTime ?? '',
      arrivalTime: data.arrivalTime ?? c.arrivalTime ?? current.arrivalTime ?? '',
      endTime: data.endTime ?? c.endTime ?? current.endTime ?? '',
      updatedAt: now,
      updatedBy: user,
    })

    let replaced = false
    let nextConductors = [...conductors]

    const canUseConductorSlot =
      resolvedByQuadrantDocId &&
      effectiveSlot !== null &&
      effectiveSlot < nextConductors.length

    if (canUseConductorSlot && effectiveSlot !== null) {
      nextConductors[effectiveSlot] = buildMerged(nextConductors[effectiveSlot] ?? {})
      replaced = true
    } else {
      nextConductors = conductors.map((c) => {
        const curPlateNorm = normPlate(c?.plate)
        if (
          String(c?.id ?? '') === String(idToUse) ||
          (origPlateNorm && curPlateNorm === origPlateNorm) ||
          (targetPlate && curPlateNorm === targetPlate)
        ) {
          replaced = true
          return buildMerged(c)
        }
        return c
      })
    }

    if (
      !replaced &&
      isExplicitEdit &&
      !resolvedByQuadrantDocId &&
      effectiveSlot !== null &&
      effectiveSlot < nextConductors.length
    ) {
      nextConductors[effectiveSlot] = buildMerged(nextConductors[effectiveSlot] ?? {})
      replaced = true
    }

    if (!replaced && priorConductor) {
      const pi = findPriorConductorIndex(nextConductors, priorConductor, normPlate)
      if (pi !== null) {
        nextConductors[pi] = buildMerged(nextConductors[pi] ?? {})
        replaced = true
      }
    }

    if (!replaced && isExplicitEdit) {
      return NextResponse.json(
        {
          error:
            'No s’ha pogut substituir el conductor (refresca Assignacions i torna-ho a provar).',
        },
        { status: 409 }
      )
    }

    let nextTreballadors: TreballadorRecord[] = Array.isArray(current.treballadors)
      ? [...current.treballadors]
      : []

    if (isExplicitEdit && replaced && priorConductor) {
      nextConductors = nextConductors.filter(
        (c) => !matchesPriorIdentity(c, priorConductor, normPlate)
      )
      const pn = normName(priorConductor.name)
      if (pn) {
        nextTreballadors = nextTreballadors.filter((t) => normName(t.name) !== pn)
      }
    }

    if (!replaced) {
      const explicitId = String(data?.id ?? '').trim()
      const newRowId =
        explicitId &&
        !explicitId.startsWith('pending:') &&
        explicitId !== '__assignacions_current__'
          ? explicitId
          : String(idToUse).startsWith('pending:')
            ? crypto.randomUUID()
            : idToUse
      const newRow: QuadrantConductorRecord = {
        id: newRowId,
        department,
        name: data.name ?? '',
        plate: String(data.plate ?? '').trim(),
        vehicleType: data.vehicleType ?? '',
        startDate: data.startDate ?? current.startDate ?? '',
        endDate: data.endDate ?? data.startDate ?? current.startDate ?? '',
        startTime: data.startTime ?? current.startTime ?? '',
        arrivalTime: data.arrivalTime ?? current.arrivalTime ?? '',
        endTime: data.endTime ?? current.endTime ?? '',
        createdAt: now,
        createdBy: user,
      }

      if (typeof rowIndex === 'number' && rowIndex >= 0 && rowIndex < nextConductors.length) {
        nextConductors[rowIndex] = newRow
      } else {
        nextConductors.push(newRow)
      }
    }

    const priorNameNormForGroups = priorConductor?.name?.trim()
      ? normName(priorConductor.name)
      : effectiveSlot !== null &&
          effectiveSlot >= 0 &&
          effectiveSlot < conductors.length
        ? normName(conductors[effectiveSlot]?.name)
        : ''

    const rawPriorDriverId =
      effectiveSlot !== null &&
      effectiveSlot >= 0 &&
      effectiveSlot < conductors.length
        ? String(conductors[effectiveSlot]?.id || '').trim()
        : ''
    const priorDriverIdForGroups =
      rawPriorDriverId && !rawPriorDriverId.startsWith('pending:')
        ? rawPriorDriverId
        : ''

    const updatePayload: Record<string, unknown> = {
      conductors: nextConductors,
      treballadors: nextTreballadors,
      updatedAt: now,
      updatedBy: user,
    }

    if (replaced && priorNameNormForGroups) {
      const newDriverIdResolved = resolveConductorRowIdAfterSave(
        nextConductors,
        data,
        normPlate
      )
      const nextGroups = syncLogisticsGroupsDrivers(current.groups, {
        priorNameNorm: priorNameNormForGroups,
        priorDriverId: priorDriverIdForGroups,
        newName: String(data.name || ''),
        newDriverId: newDriverIdResolved,
      })
      if (nextGroups) updatePayload.groups = nextGroups
    }

    await ref.update(updatePayload)

    revalidateQuadrantsListCache()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/transports/assignacions/row/save]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
