export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import type { SessionUserForApi } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import type { AccessUser } from '@/lib/accessControl'
import type { ImportConflictItem, ManualImportRequest, ParsedImportRow } from '@/app/menu/allergens/bbdd/types'
import { DEFAULT_ALLERGENS } from '@/data/allergens'

const ALLERGENS_BBDD_PATH = '/menu/allergens/bbdd'

const COLLECTIONS_TO_CLEAR = [
  'plats',
  'categories',
  'family',
  'menus',
  'allergens',
  'allergens_import_conflicts',
] as const

function buildAccessUser(authUser: SessionUserForApi): AccessUser & { id: string } {
  return {
    id: authUser.id,
    role: authUser.role ?? undefined,
    department: authUser.department ?? undefined,
    canRespondSurveys: Boolean((authUser as { canRespondSurveys?: boolean }).canRespondSurveys),
    isDepartmentRobaLead: Boolean((authUser as { isDepartmentRobaLead?: boolean }).isDepartmentRobaLead),
    robaLinkedPersonnelId: (authUser as { robaLinkedPersonnelId?: string | null }).robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof (authUser as { opsProjectsConfigurable?: boolean }).opsProjectsConfigurable === 'boolean'
        ? (authUser as { opsProjectsConfigurable?: boolean }).opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean((authUser as { isTransportLead?: boolean }).isTransportLead),
  }
}

async function clearCollection(name: (typeof COLLECTIONS_TO_CLEAR)[number] | 'allergens_import_conflicts') {
  while (true) {
    const snap = await firestoreAdmin.collection(name).limit(450).get()
    if (snap.empty) break

    const batch = firestoreAdmin.batch()
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref))
    await batch.commit()

    if (snap.size < 450) break
  }
}

async function seedDefaultAllergens() {
  let batch = firestoreAdmin.batch()
  let batchCount = 0

  for (const allergen of DEFAULT_ALLERGENS) {
    batch.set(
      firestoreAdmin.collection('allergens').doc(allergen.key),
      {
        label: allergen.label,
        updatedAt: Timestamp.now(),
        source: 'manual-import',
      },
      { merge: true }
    )
    batchCount++

    if (batchCount >= 450) {
      await batch.commit()
      batch = firestoreAdmin.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

async function writeConflictDocs(conflicts: ImportConflictItem[], source: string) {
  if (!conflicts.length) return

  let batch = firestoreAdmin.batch()
  let batchCount = 0

  for (const conflict of conflicts) {
    const id = String(conflict.id || '').trim()
    if (!id) continue

    batch.set(firestoreAdmin.collection('allergens_import_conflicts').doc(id), {
      code: conflict.code || id,
      reason: conflict.reason || 'import-conflict',
      status: conflict.status || 'pending',
      existingNameCa: conflict.existingNameCa || null,
      entries: Array.isArray(conflict.entries) ? conflict.entries : [],
      createdAt: Timestamp.now(),
      source,
    })
    batchCount++

    if (batchCount >= 450) {
      await batch.commit()
      batch = firestoreAdmin.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

async function writeLabelCollection(
  collectionName: 'categories' | 'family' | 'menus',
  entries: Array<[string, string]>
) {
  if (!entries.length) return

  let batch = firestoreAdmin.batch()
  let batchCount = 0

  for (const [id, label] of entries) {
    if (!id) continue

    batch.set(
      firestoreAdmin.collection(collectionName).doc(id),
      {
        label,
        updatedAt: Timestamp.now(),
        source: 'manual-import',
      },
      { merge: true }
    )
    batchCount++

    if (batchCount >= 450) {
      await batch.commit()
      batch = firestoreAdmin.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

async function writePlats(rows: ParsedImportRow[], replaceMode: boolean) {
  let batch = firestoreAdmin.batch()
  let batchCount = 0

  for (const row of rows) {
    batch.set(
      firestoreAdmin.collection('plats').doc(row.code),
      {
        ...row.data,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: !replaceMode }
    )
    batchCount++

    if (batchCount >= 450) {
      await batch.commit()
      batch = firestoreAdmin.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const accessUser = buildAccessUser(auth.user)
    const canView = await canViewUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
    if (!canView) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const canEdit = await canEditUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
    const importOverride = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action(ALLERGENS_BBDD_PATH, 'import'),
    })
    const replaceOverride = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action(ALLERGENS_BBDD_PATH, 'replace'),
    })

    const body = (await req.json()) as ManualImportRequest
    const mode = body?.mode === 'replace' ? 'replace' : 'incremental'
    const canRunMode =
      mode === 'replace'
        ? replaceOverride === true || canEdit
        : importOverride === true || canEdit

    if (!canRunMode) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const rowsToImport = Array.isArray(body?.rowsToImport) ? body.rowsToImport : []
    const categoryEntries = Array.isArray(body?.categoryEntries) ? body.categoryEntries : []
    const familyEntries = Array.isArray(body?.familyEntries) ? body.familyEntries : []
    const menuEntries = Array.isArray(body?.menuEntries) ? body.menuEntries : []
    const duplicateConflicts = Array.isArray(body?.duplicateConflicts) ? body.duplicateConflicts : []
    const existingConflicts = Array.isArray(body?.existingConflicts) ? body.existingConflicts : []
    const source = String(body?.source || '').trim() || 'manual-import.xlsx'

    if (mode === 'replace') {
      for (const collectionName of COLLECTIONS_TO_CLEAR) {
        await clearCollection(collectionName)
      }
    } else {
      await clearCollection('allergens_import_conflicts')
    }

    await seedDefaultAllergens()
    await writeLabelCollection('family', familyEntries)
    await writeLabelCollection('categories', categoryEntries)
    await writeLabelCollection('menus', menuEntries)
    await writeConflictDocs(duplicateConflicts, source)
    await writeConflictDocs(existingConflicts, source)
    await writePlats(rowsToImport, mode === 'replace')

    return NextResponse.json({
      ok: true,
      imported: rowsToImport.length,
      duplicateConflicts: duplicateConflicts.length,
      existingConflicts: existingConflicts.length,
    })
  } catch (error) {
    console.error('[allergens/bbdd/import POST]', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
