import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { type AccessUser } from '@/lib/accessControl'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { normalizeRole } from '@/lib/roles'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

export const runtime = 'nodejs'

const PREPARATION_UI_PATH = '/menu/logistica/preparacio'

type PreparationUserSummary = {
  id: string
  name: string
  role: string
}

function userDocToAccessUser(data: Record<string, unknown>): AccessUser {
  return {
    role: String(data.role || ''),
    department: String(data.department || ''),
    canRespondSurveys:
      typeof data.canRespondSurveys === 'boolean' ? data.canRespondSurveys : undefined,
    isDepartmentRobaLead:
      typeof data.isDepartmentRobaLead === 'boolean' ? data.isDepartmentRobaLead : undefined,
    robaLinkedPersonnelId:
      typeof data.robaLinkedPersonnelId === 'string' ? data.robaLinkedPersonnelId : null,
    opsProjectsConfigurable:
      typeof data.opsProjectsConfigurable === 'boolean' ? data.opsProjectsConfigurable : undefined,
    isTransportLead:
      typeof data.isTransportLead === 'boolean' ? data.isTransportLead : undefined,
  }
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const denied = requireRoles(auth, ['admin', 'direccio', 'cap'])
  if (denied) return denied.res

  try {
    const [usersSnap, assignmentsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('user_access_assignments').get(),
    ])

    const assignmentMap = new Map<string, UserAccessAssignmentDoc>()
    assignmentsSnap.forEach((doc) => {
      assignmentMap.set(doc.id, doc.data() as UserAccessAssignmentDoc)
    })

    const users: PreparationUserSummary[] = []

    usersSnap.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>
      const role = normalizeRole(String(data.role || ''))
      if (role !== 'treballador') return

      const accessUser = userDocToAccessUser(data)
      const uiMap = buildUiViewMap(accessUser, assignmentMap.get(doc.id) ?? null)
      if (uiMap[PREPARATION_UI_PATH] !== true) return

      users.push({
        id: doc.id,
        name: String(data.name || '').trim() || 'Sense nom',
        role,
      })
    })

    users.sort((a, b) => a.name.localeCompare(b.name, 'ca'))

    return NextResponse.json({ ok: true, users })
  } catch (error) {
    console.error('Error carregant usuaris de preparació logística:', error)
    return NextResponse.json(
      { ok: false, error: 'No s’han pogut carregar els usuaris de preparació.' },
      { status: 500 }
    )
  }
}
