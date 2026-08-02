import { getBlockDepartments } from '@/app/menu/projects/components/project-shared'
import { normalizeRole } from '@/lib/roles'

export type ParticipationUser = {
  id?: string
  name?: string
  role?: string
  department?: string | null
}

export type ParticipationBlock = {
  owner?: string
  department?: string
  departments?: string[]
  tasks?: Array<{ owner?: string; department?: string }>
}

export type ParticipationProject = {
  owner?: string
  ownerUserId?: string
  sponsor?: string
  createdById?: string
  departments?: string[]
  blocks?: ParticipationBlock[]
}

export const normalizeProjectDepartment = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  const aliasMap: Record<string, string> = {
    marketing: 'marqueting',
    direccion: 'direccio',
    administracion: 'administracio',
    produccion: 'produccio',
    'cuina central': 'cuina central',
    fdlc: 'fdlc',
  }

  return aliasMap[normalized] || normalized
}

export type ProjectParticipationKind =
  | 'owner'
  | 'sponsor'
  | 'block_responsible'
  | 'task_responsible'
  | 'department'
  | 'none'

export type ProjectParticipationSummary = {
  kinds: ProjectParticipationKind[]
  primary: ProjectParticipationKind
  label: string
  participates: boolean
}

const PARTICIPATION_PRIORITY: ProjectParticipationKind[] = [
  'owner',
  'sponsor',
  'block_responsible',
  'task_responsible',
  'department',
  'none',
]

const PARTICIPATION_LABELS: Record<ProjectParticipationKind, string> = {
  owner: 'Propietari',
  sponsor: 'Responsable de projecte',
  block_responsible: 'Responsable de blocs',
  task_responsible: 'Responsable de tasques',
  department: 'Participant per departament',
  none: 'Sense participació',
}

export function getProjectParticipationLabel(kind: ProjectParticipationKind) {
  return PARTICIPATION_LABELS[kind]
}

export function getProjectParticipationBadgeClass(kind: ProjectParticipationKind) {
  if (kind === 'owner') return 'bg-violet-100 text-violet-800'
  if (kind === 'sponsor') return 'bg-fuchsia-100 text-fuchsia-800'
  if (kind === 'block_responsible') return 'bg-blue-100 text-blue-800'
  if (kind === 'task_responsible') return 'bg-cyan-100 text-cyan-800'
  if (kind === 'department') return 'bg-slate-100 text-slate-700'
  return 'bg-gray-100 text-gray-600'
}

function pickPrimaryParticipationKind(kinds: ProjectParticipationKind[]) {
  for (const kind of PARTICIPATION_PRIORITY) {
    if (kinds.includes(kind)) return kind
  }
  return 'none'
}

export function userHasGlobalProjectListAccess(user?: ParticipationUser | null) {
  const role = normalizeRole(String(user?.role || ''))
  return role === 'admin' || role === 'direccio'
}

export function resolveUserProjectParticipation(
  user: ParticipationUser | null | undefined,
  project: ParticipationProject,
  options?: { includeGlobalAccessLabel?: boolean }
): ProjectParticipationSummary {
  const sessionUserId = String(user?.id || '').trim()
  const sessionUserName = String(user?.name || '').trim()
  const sessionRole = normalizeRole(String(user?.role || ''))
  const sessionDepartment = normalizeProjectDepartment(String(user?.department || ''))
  const kinds: ProjectParticipationKind[] = []

  const isProjectOwner =
    (sessionUserId && sessionUserId === String(project.ownerUserId || '').trim()) ||
    (sessionUserName && sessionUserName === String(project.owner || '').trim())
  const isProjectSponsor =
    (sessionUserId && sessionUserId === String(project.createdById || '').trim()) ||
    (sessionUserName && sessionUserName === String(project.sponsor || '').trim())

  if (isProjectOwner) kinds.push('owner')
  if (isProjectSponsor) kinds.push('sponsor')

  const projectDepartments = (project.departments || []).map((department) =>
    normalizeProjectDepartment(String(department || ''))
  )
  let hasDepartmentParticipation =
    Boolean(sessionDepartment) && projectDepartments.includes(sessionDepartment)

  const blocks = Array.isArray(project.blocks) ? project.blocks : []
  for (const block of blocks) {
    const blockDepartments = getBlockDepartments({
      department: String(block.department || ''),
      departments: Array.isArray(block.departments) ? block.departments.map(String) : [],
    }).map((department) => normalizeProjectDepartment(department))

    if (sessionUserName && String(block.owner || '').trim() === sessionUserName) {
      kinds.push('block_responsible')
    }

    const tasks = Array.isArray(block.tasks) ? block.tasks : []
    if (tasks.some((task) => String(task.owner || '').trim() === sessionUserName)) {
      kinds.push('task_responsible')
    }

    if (sessionDepartment && blockDepartments.includes(sessionDepartment)) {
      hasDepartmentParticipation = true
    }

    if (
      sessionRole === 'cap' &&
      sessionDepartment &&
      blockDepartments.includes(sessionDepartment)
    ) {
      hasDepartmentParticipation = true
    }
  }

  if (hasDepartmentParticipation) kinds.push('department')

  const uniqueKinds = [...new Set(kinds)]
  const primary = pickPrimaryParticipationKind(uniqueKinds.length ? uniqueKinds : ['none'])
  let label = PARTICIPATION_LABELS[primary]

  if (
    options?.includeGlobalAccessLabel &&
    primary === 'none' &&
    userHasGlobalProjectListAccess(user)
  ) {
    label = 'Visibilitat global'
  }

  const participates = primary !== 'none'

  return {
    kinds: uniqueKinds.length ? uniqueKinds : ['none'],
    primary,
    label,
    participates,
  }
}

export function userParticipatesInProject(
  user: ParticipationUser | null | undefined,
  project: ParticipationProject
) {
  return resolveUserProjectParticipation(user, project).participates
}
