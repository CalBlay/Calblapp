import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { canAccessProjects, sessionToAccessUser } from '@/lib/projectAccess'
import {
  userHasGlobalProjectListAccess,
  userParticipatesInProject,
} from '@/lib/projectParticipation'
import { normalizeRole } from '@/lib/roles'
import {
  normalizeProjectResponse,
  type ProjectApiResponse,
} from '@/app/menu/projects/components/normalizeProjectResponse'
import type { ProjectData } from '@/app/menu/projects/components/project-shared'
import type { ResponsibleOption } from '@/app/menu/projects/components/project-workspace-helpers'

type SessionUser = {
  id?: string
  name?: string | null
  role?: string | null
  department?: string | null
  opsProjectsConfigurable?: boolean
}

export async function loadProjectDetail(
  projectId: string,
  sessionUser: SessionUser
): Promise<ProjectData | null> {
  const userId = String(sessionUser.id || '').trim()
  if (!userId) return null
  if (!canAccessProjects(sessionToAccessUser(sessionUser))) return null

  const snap = await db.collection('projects').doc(projectId).get()
  if (!snap.exists) return null

  const data = snap.data() as Record<string, unknown>
  const accessUser = {
    id: userId,
    name: String(sessionUser.name || '').trim(),
    role: String(sessionUser.role || '').trim(),
    department: sessionUser.department,
  }

  if (
    !userHasGlobalProjectListAccess(accessUser) &&
    !userParticipatesInProject(accessUser, data)
  ) {
    return null
  }

  return normalizeProjectResponse({ id: snap.id, ...data } as ProjectApiResponse)
}

export async function loadProjectUserOptions(): Promise<ResponsibleOption[]> {
  const snap = await db.collection('users').get()

  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>
      return {
        id: doc.id,
        name: String(data.name || '').trim(),
        role: normalizeRole(String(data.role || '')),
        email: String(data.email || '').trim(),
        department: String(data.department || '').trim(),
      }
    })
    .filter((user) => user.name)
    .sort((left, right) => left.name.localeCompare(right.name))
}
