import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { resolveRobaAccess, type RobaAccess } from '@/lib/roba-personal/guard'
import {
  departmentsInSameRobaScope,
  normDeptLabelsInRobaEquivalenceClass,
} from '@/lib/roba-personal/deptScope'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireRobaAnyTabView, requireRobaWorkflowView } from '@/lib/server/robaApiAuth'
import {
  ROBA_SUBMODULE_PATHS,
  ROBA_WORKFLOW_UI_PATHS,
} from '@/lib/robaPersonalPermissions'

const COL = DOTACIO_COLLECTIONS.requests
const DEL = DOTACIO_COLLECTIONS.deliveries

async function countRequestsByStatus(status: string): Promise<number> {
  const snap = await db.collection(COL).where('status', '==', status).count().get()
  return snap.data().count
}

async function countWorkerRequests(pid: string, uid: string, status: string): Promise<number> {
  const [byWorker, byCreator] = await Promise.all([
    db.collection(COL).where('requestedByWorkerId', '==', pid).where('status', '==', status).count().get(),
    db.collection(COL).where('createdByUserId', '==', uid).where('status', '==', status).count().get(),
  ])
  return byWorker.data().count + byCreator.data().count
}

async function countWorkerDeliveriesAckPending(pid: string): Promise<number> {
  const snap = await db
    .collection(DEL)
    .where('requestedByWorkerId', '==', pid)
    .where('workerReceiptAckExpected', '==', true)
    .limit(200)
    .get()
  return snap.docs.filter((doc) => {
    const data = doc.data() as { workerReceiptAckAt?: unknown }
    return data.workerReceiptAckAt == null
  }).length
}

async function countDeptLeadRequests(leadDeptNorm: string): Promise<number> {
  const labels = normDeptLabelsInRobaEquivalenceClass(leadDeptNorm)
  const statuses = ['submitted', 'prepared'] as const
  let total = 0

  if (labels.length > 0 && labels.length <= 10) {
    for (const status of statuses) {
      const snap = await db
        .collection(COL)
        .where('requestingDepartmentNorm', 'in', labels)
        .where('status', '==', status)
        .count()
        .get()
      total += snap.data().count
    }
    return total
  }

  const recentSnap = await db.collection(COL).orderBy('createdAt', 'desc').limit(200).get()
  return recentSnap.docs.filter((doc) => {
    const data = doc.data() as { status?: string; requestingDepartment?: string }
    const status = String(data.status || '').trim()
    if (status !== 'submitted' && status !== 'prepared') return false
    return departmentsInSameRobaScope(String(data.requestingDepartment || ''), leadDeptNorm)
  }).length
}

async function countDeptLeadDeliveryDisputes(leadDeptNorm: string): Promise<number> {
  const snap = await db
    .collection(DEL)
    .where('workerReceiptCorrectionOpen', '==', true)
    .limit(200)
    .get()
  return snap.docs.filter((doc) => {
    const data = doc.data() as { requestingDepartment?: string }
    return departmentsInSameRobaScope(String(data.requestingDepartment || ''), leadDeptNorm)
  }).length
}

async function countForAccess(access: RobaAccess): Promise<number> {
  if (access.scope === 'full') {
    return countRequestsByStatus('sent_to_rrhh')
  }

  if (access.scope === 'workerSelf') {
    const { linkedPersonnelId: pid, userId: uid } = access
    const [ready, picked, deliveries] = await Promise.all([
      countWorkerRequests(pid, uid, 'ready_for_worker_delivery'),
      countWorkerRequests(pid, uid, 'picked_up'),
      countWorkerDeliveriesAckPending(pid),
    ])
    return ready + picked + deliveries
  }

  const [requests, disputes] = await Promise.all([
    countDeptLeadRequests(access.leadDeptNorm),
    countDeptLeadDeliveryDisputes(access.leadDeptNorm),
  ])
  return requests + disputes
}

export async function computeRobaBadgeCount(): Promise<number> {
  const auth = await requireAuth()
  if (!auth.ok) return 0

  const canWorkflow = await requireRobaWorkflowView(auth)
  const canEntregues = await requireRobaAnyTabView(auth, [ROBA_SUBMODULE_PATHS.entregues])
  if (!canWorkflow && !canEntregues) return 0

  const roba = await resolveRobaAccess()
  if (!roba.ok) return 0

  if (roba.access.scope === 'full') {
    return canWorkflow ? countForAccess(roba.access) : 0
  }

  if (roba.access.scope === 'workerSelf') {
    if (!canWorkflow && !canEntregues) return 0
    return countForAccess(roba.access)
  }

  const canSeeWorkflow = await requireRobaAnyTabView(auth, ROBA_WORKFLOW_UI_PATHS)
  const canSeeEntregues = canEntregues
  if (!canSeeWorkflow && !canSeeEntregues) return 0

  let total = 0
  if (canSeeWorkflow) {
    total += await countDeptLeadRequests(roba.access.leadDeptNorm)
  }
  if (canSeeEntregues) {
    total += await countDeptLeadDeliveryDisputes(roba.access.leadDeptNorm)
  }
  return total
}
