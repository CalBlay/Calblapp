import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_ADMIN_ROLES } from '@/lib/eventComanda/adminAccess'
import {
  normalizeEventComandaBatchStatus,
  PREPARER_HISTORY_BATCH_STATUSES,
  PREPARER_VISIBLE_BATCH_STATUSES,
} from '@/lib/eventComanda/batchStatus'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { warehouseDocId, getWarehouseById } from '@/lib/eventComanda/warehouses.server'
import type { Role } from '@/lib/roles'

const COL = EVENT_COMANDA_COLLECTIONS.warehouseMembers

export type WarehouseMember = {
  userId: string
  userName: string
}

export type WarehouseMembersRecord = {
  warehouseId: string
  members: WarehouseMember[]
  updatedAt: number
  updatedByUserId?: string | null
}

export function canViewAllEventComandaWarehouses(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase()
  return (EVENT_COMANDA_ADMIN_ROLES as readonly string[]).includes(normalized)
}

async function resolveMemberNames(memberIds: string[]): Promise<WarehouseMember[]> {
  const uniqueIds = [...new Set(memberIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (uniqueIds.length === 0) return []

  const snaps = await db.getAll(...uniqueIds.map((id) => db.collection('users').doc(id)))
  const nameById = new Map(
    snaps.map((snap) => {
      const data = snap.data() as { name?: string; email?: string } | undefined
      const label = String(data?.name || data?.email || snap.id).trim()
      return [snap.id, label]
    })
  )

  return uniqueIds
    .map((userId) => ({
      userId,
      userName: nameById.get(userId) || userId,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, 'ca', { sensitivity: 'base' }))
}

export async function getWarehouseMembers(warehouseId: string): Promise<WarehouseMembersRecord> {
  const docId = warehouseDocId(warehouseId)
  const snap = await db.collection(COL).doc(docId).get()
  if (!snap.exists) {
    return {
      warehouseId: docId,
      members: [],
      updatedAt: 0,
    }
  }

  const data = snap.data() as {
    members?: WarehouseMember[]
    memberIds?: string[]
    updatedAt?: number
    updatedByUserId?: string | null
  }

  if (Array.isArray(data.members) && data.members.length) {
    return {
      warehouseId: docId,
      members: data.members
        .map((member) => ({
          userId: String(member.userId || '').trim(),
          userName: String(member.userName || member.userId || '').trim(),
        }))
        .filter((member) => member.userId),
      updatedAt: Number(data.updatedAt) || 0,
      updatedByUserId: data.updatedByUserId ?? null,
    }
  }

  const legacyIds = Array.isArray(data.memberIds)
    ? data.memberIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  return {
    warehouseId: docId,
    members: await resolveMemberNames(legacyIds),
    updatedAt: Number(data.updatedAt) || 0,
    updatedByUserId: data.updatedByUserId ?? null,
  }
}

export async function setWarehouseMembers(params: {
  warehouseId: string
  memberIds: string[]
  userId?: string
}) {
  const docId = warehouseDocId(params.warehouseId)
  if (!docId) throw new Error('Magatzem no vàlid.')

  const warehouse = await getWarehouseById(docId)
  if (!warehouse) throw new Error('Magatzem no trobat.')

  const members = await resolveMemberNames(params.memberIds)
  const now = Date.now()
  const payload: WarehouseMembersRecord = {
    warehouseId: docId,
    members,
    updatedAt: now,
    updatedByUserId: params.userId || null,
  }

  await db.collection(COL).doc(docId).set(payload, { merge: false })
  return payload
}

export async function deleteWarehouseMembers(warehouseId: string) {
  const docId = warehouseDocId(warehouseId)
  if (!docId) return
  await db.collection(COL).doc(docId).delete()
}

export async function listAllWarehouseMembers(): Promise<Record<string, WarehouseMember[]>> {
  const snap = await db.collection(COL).get()
  const membersByWarehouse: Record<string, WarehouseMember[]> = {}

  for (const doc of snap.docs) {
    const data = doc.data() as {
      members?: WarehouseMember[]
      memberIds?: string[]
    }

    if (Array.isArray(data.members) && data.members.length) {
      membersByWarehouse[doc.id] = data.members
        .map((member) => ({
          userId: String(member.userId || '').trim(),
          userName: String(member.userName || member.userId || '').trim(),
        }))
        .filter((member) => member.userId)
      continue
    }

    const legacyIds = Array.isArray(data.memberIds)
      ? data.memberIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []

    membersByWarehouse[doc.id] = legacyIds.length ? await resolveMemberNames(legacyIds) : []
  }

  return membersByWarehouse
}

export async function listWarehouseIdsForUser(userId: string): Promise<string[]> {
  const id = String(userId || '').trim()
  if (!id) return []

  const snap = await db.collection(COL).get()
  const warehouseIds: string[] = []

  for (const doc of snap.docs) {
    const data = doc.data() as { members?: WarehouseMember[]; memberIds?: string[] }
    const memberIds = Array.isArray(data.members)
      ? data.members.map((member) => String(member.userId || '').trim()).filter(Boolean)
      : Array.isArray(data.memberIds)
        ? data.memberIds.map((memberId) => String(memberId || '').trim()).filter(Boolean)
        : []
    if (memberIds.includes(id)) {
      warehouseIds.push(warehouseDocId(doc.id))
    }
  }

  return warehouseIds.sort((a, b) => a.localeCompare(b))
}

export function filterOrderBatchesForUser(
  batches: EventComandaOrderBatch[] | undefined,
  params: {
    userId: string
    role?: Role | string | null
    assignedWarehouseIds: string[]
  }
): EventComandaOrderBatch[] | undefined {
  if (!batches?.length) return batches
  if (canViewAllEventComandaWarehouses(params.role)) return batches

  const assigned = params.assignedWarehouseIds
    .map((warehouseId) => warehouseDocId(warehouseId))
    .filter(Boolean)
  if (assigned.length === 0) return batches

  const allowed = new Set(assigned)
  const filtered = batches.filter((batch) => allowed.has(warehouseDocId(batch.warehouseId)))
  return filtered.length ? filtered : []
}

export function filterBatchesForPreparerView(
  batches: EventComandaOrderBatch[] | undefined,
  params: {
    userId: string
    role?: Role | string | null
    assignedWarehouseIds: string[]
  }
): EventComandaOrderBatch[] | undefined {
  const scoped = filterOrderBatchesForUser(batches, params)
  if (!scoped?.length) return scoped
  const visible = scoped.filter((batch) => {
    const status = normalizeEventComandaBatchStatus(batch.status)
    return PREPARER_VISIBLE_BATCH_STATUSES.has(status) && batch.lines.length > 0
  })
  return visible.length ? visible : []
}

export function filterBatchesForPreparerHistoryView(
  batches: EventComandaOrderBatch[] | undefined,
  params: {
    userId: string
    role?: Role | string | null
    assignedWarehouseIds: string[]
  }
): EventComandaOrderBatch[] | undefined {
  const scoped = filterOrderBatchesForUser(batches, params)
  if (!scoped?.length) return scoped
  const visible = scoped.filter((batch) => {
    const status = normalizeEventComandaBatchStatus(batch.status)
    return PREPARER_HISTORY_BATCH_STATUSES.has(status) && batch.lines.length > 0
  })
  return visible.length ? visible : []
}

export function batchIsVisibleToPreparer(batch: EventComandaOrderBatch) {
  const status = normalizeEventComandaBatchStatus(batch.status)
  return PREPARER_VISIBLE_BATCH_STATUSES.has(status) && batch.lines.length > 0
}

export async function listAssignmentUsers(limit = 500) {
  const snap = await db.collection('users').limit(limit).get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        name: String(data.name || data.email || doc.id).trim(),
        email: typeof data.email === 'string' ? data.email : undefined,
        role: typeof data.role === 'string' ? data.role : undefined,
        department: typeof data.department === 'string' ? data.department : undefined,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
}
