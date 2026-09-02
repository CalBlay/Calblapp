import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { applyOutlookRefPatches, type OutlookRefPatch } from '@/lib/projects/outlookRefPatches'

export async function persistProjectOutlookRefPatches(
  projectId: string,
  patches: OutlookRefPatch[]
) {
  if (patches.length === 0) return

  const projectRef = db.collection('projects').doc(projectId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(projectRef)
    if (!snap.exists) return
    const latestBlocks = Array.isArray(snap.data()?.blocks) ? snap.data()?.blocks : []
    tx.set(
      projectRef,
      { blocks: applyOutlookRefPatches(latestBlocks, patches) },
      { merge: true }
    )
  })
}
