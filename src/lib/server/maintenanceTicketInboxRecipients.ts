import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { AccessUser } from '@/lib/accessControl'
import {
  MAINTENANCE_TICKETS_INBOX_PERM,
  baseCanReceiveMaintenanceTicketInboxNotifications,
} from '@/lib/maintenanceTicketsPermissions'
import { isUiPermissionGranted } from '@/lib/server/permissions'

function userDocToAccessUser(id: string, data: Record<string, unknown>): AccessUser & { id: string } {
  return {
    id,
    role: String(data.role || ''),
    department: String(data.department || data.departmentLower || ''),
    canRespondSurveys: Boolean(data.canRespondSurveys),
    isDepartmentRobaLead: Boolean(data.isDepartmentRobaLead),
    robaLinkedPersonnelId: (data.robaLinkedPersonnelId as string | null) ?? null,
    isTransportLead: Boolean(data.isTransportLead),
  }
}

async function explicitAllowUserIds(permission: string): Promise<string[]> {
  const snap = await db.collection('user_access_assignments').get()
  const ids: string[] = []
  for (const doc of snap.docs) {
    const overrides = doc.data()?.overrides
    if (!Array.isArray(overrides)) continue
    const allowed = overrides.some(
      (o) =>
        String(o?.permission || '').trim() === permission &&
        String(o?.scope || 'client') === 'client' &&
        !String(o?.scopeId || '').trim() &&
        o?.effect === 'allow'
    )
    if (allowed) ids.push(doc.id)
  }
  return ids
}

async function logisticsCandidateUserIds(): Promise<string[]> {
  const snap = await db.collection('users').where('departmentLower', '==', 'logistica').get()
  return snap.docs.map((doc) => doc.id)
}

/** Usuaris que reben avisos de tickets nous / endarrerits a la safata (campaneta). */
export async function listMaintenanceTicketInboxRecipientIds(): Promise<string[]> {
  const [explicitIds, logisticsIds] = await Promise.all([
    explicitAllowUserIds(MAINTENANCE_TICKETS_INBOX_PERM),
    logisticsCandidateUserIds(),
  ])

  const candidateSet = new Set([...explicitIds, ...logisticsIds])
  const recipients: string[] = []

  await Promise.all(
    Array.from(candidateSet).map(async (userId) => {
      const userSnap = await db.collection('users').doc(userId).get()
      if (!userSnap.exists) return
      const accessUser = userDocToAccessUser(userId, userSnap.data() as Record<string, unknown>)
      const granted = await isUiPermissionGranted({
        user: accessUser,
        permission: MAINTENANCE_TICKETS_INBOX_PERM,
      })
      if (granted) recipients.push(userId)
    })
  )

  return Array.from(new Set(recipients))
}

export { baseCanReceiveMaintenanceTicketInboxNotifications }
