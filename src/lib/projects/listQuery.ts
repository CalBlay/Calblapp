import {
  userHasGlobalProjectListAccess,
  userParticipatesInProject,
  type ParticipationUser,
} from '@/lib/projectParticipation'

export type ProjectListRecord = {
  id: string
  name?: string
  owner?: string
  ownerUserId?: string
  sponsor?: string
  createdById?: string
  phase?: string
  status?: string
  createdAt?: string | number
  startDate?: string
  launchDate?: string
  departments?: string[]
  blocks?: Array<{
    id?: string
    owner?: string
    department?: string
    deadline?: string
    status?: string
    departments?: string[]
    tasks?: Array<{ owner?: string; department?: string; status?: string }>
  }>
}

export type ProjectListQuery = {
  page?: number
  limit?: number
  scope?: 'mine' | 'all'
  q?: string
  department?: string
  owner?: string
  startDate?: string
  endDate?: string
  lifecycle?: 'open' | 'closed' | 'all'
}

export type ProjectListFilterMeta = {
  departments: Array<{ value: string; label: string }>
  owners: string[]
}

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const formatDepartmentLabel = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')

const CLOSED_BLOCK_STATUSES = new Set([
  'done',
  'closed',
  'completed',
  'finished',
  'fet',
  'feta',
  'fets',
  'tancat',
  'tancada',
  'tancats',
  'acabat',
  'acabada',
  'acabats',
])

const normalizeBlockLifecycleStatus = (value?: string) => normalizeText(value || '')

const deriveListBlockStatus = (
  block: NonNullable<ProjectListRecord['blocks']>[number]
) => {
  const tasks = Array.isArray(block.tasks) ? block.tasks : []
  if (tasks.length === 0) return String(block.status || '').trim() || 'pending'

  const normalizedTaskStatuses = tasks.map((task) => normalizeBlockLifecycleStatus(task.status))
  if (normalizedTaskStatuses.some((status) => status === 'blocked')) return 'blocked'
  if (normalizedTaskStatuses.every((status) => CLOSED_BLOCK_STATUSES.has(status))) return 'done'
  if (normalizedTaskStatuses.some((status) => status === 'in_progress' || CLOSED_BLOCK_STATUSES.has(status))) {
    return 'in_progress'
  }

  return String(block.status || '').trim() || 'in_progress'
}

export const isProjectClosed = (project: ProjectListRecord) => {
  const blocks = Array.isArray(project.blocks) ? project.blocks : []
  if (blocks.length === 0) return false

  return blocks.every((block) => CLOSED_BLOCK_STATUSES.has(normalizeBlockLifecycleStatus(deriveListBlockStatus(block))))
}

export const toProjectListRecord = (
  id: string,
  data: Record<string, unknown>
): ProjectListRecord => ({
  id,
  name: String(data.name || '').trim() || undefined,
  owner: String(data.owner || '').trim() || undefined,
  ownerUserId: String(data.ownerUserId || '').trim() || undefined,
  sponsor: String(data.sponsor || '').trim() || undefined,
  createdById: String(data.createdById || '').trim() || undefined,
  phase: String(data.phase || '').trim() || undefined,
  status: String(data.status || '').trim() || undefined,
  createdAt: (data.createdAt as string | number | undefined) ?? undefined,
  startDate: String(data.startDate || '').trim() || undefined,
  launchDate: String(data.launchDate || '').trim() || undefined,
  departments: Array.isArray(data.departments)
    ? data.departments.map((item) => String(item || '').trim()).filter(Boolean)
    : [],
  blocks: Array.isArray(data.blocks)
    ? data.blocks.map((block) => {
        const source = block as Record<string, unknown>
        return {
          id: String(source.id || '').trim() || undefined,
          owner: String(source.owner || '').trim() || undefined,
          department: String(source.department || '').trim() || undefined,
          deadline: String(source.deadline || '').trim() || undefined,
          status: String(source.status || '').trim() || undefined,
          departments: Array.isArray(source.departments)
            ? source.departments.map((item) => String(item || '').trim()).filter(Boolean)
            : [],
          tasks: Array.isArray(source.tasks)
            ? source.tasks.map((task) => {
                const taskSource = task as Record<string, unknown>
                return {
                  owner: String(taskSource.owner || '').trim() || undefined,
                  department: String(taskSource.department || '').trim() || undefined,
                  status: String(taskSource.status || '').trim() || undefined,
                }
              })
            : [],
        }
      })
    : [],
})

export const filterVisibleProjects = (
  projects: ProjectListRecord[],
  accessUser: ParticipationUser,
  scope: 'mine' | 'all'
) => {
  const canViewAll = userHasGlobalProjectListAccess(accessUser)
  if (scope === 'all' && canViewAll) return projects
  return projects.filter((project) => userParticipatesInProject(accessUser, project))
}

export const filterProjectsByQuery = (
  projects: ProjectListRecord[],
  query: ProjectListQuery
) => {
  const queryTokens = normalizeText(query.q || '')
    .split(/\s+/)
    .filter(Boolean)
  const departmentFilter = normalizeText(query.department || '')
  const ownerFilter = normalizeText(query.owner || '')
  const startDate = String(query.startDate || '').trim()
  const endDate = String(query.endDate || '').trim()
  const lifecycle = query.lifecycle === 'closed' || query.lifecycle === 'all' ? query.lifecycle : 'open'

  return projects.filter((project) => {
    const launchDate = String(project.launchDate || '').trim()
    const startProjectDate = String(project.startDate || '').trim()
    const referenceDate = launchDate || startProjectDate
    const projectDepartments = (project.departments || []).map((department) => normalizeText(department))
    const projectOwner = normalizeText(String(project.owner || ''))

    const haystack = normalizeText(
      [project.name, project.owner, ...(project.departments || [])].filter(Boolean).join(' ')
    )

    const matchesQuery =
      queryTokens.length === 0 || queryTokens.every((token) => haystack.includes(token))
    const matchesDepartment =
      !departmentFilter || projectDepartments.some((department) => department === departmentFilter)
    const matchesOwner = !ownerFilter || projectOwner === ownerFilter
    const matchesDateRange =
      (!startDate && !endDate) ||
      (Boolean(referenceDate) &&
        (!startDate || referenceDate >= startDate) &&
        (!endDate || referenceDate <= endDate))
    const projectClosed = isProjectClosed(project)
    const matchesLifecycle =
      lifecycle === 'all' ||
      (lifecycle === 'closed' ? projectClosed : !projectClosed)

    return matchesQuery && matchesDepartment && matchesOwner && matchesDateRange && matchesLifecycle
  })
}

export const buildProjectListFilterMeta = (
  projects: ProjectListRecord[]
): ProjectListFilterMeta => {
  const uniqueDepartments = new Map<string, string>()

  projects.forEach((project) => {
    ;(project.departments || []).forEach((department) => {
      const normalizedDepartment = normalizeText(department)
      if (!normalizedDepartment || uniqueDepartments.has(normalizedDepartment)) return
      uniqueDepartments.set(normalizedDepartment, String(department || '').trim())
    })
  })

  return {
    departments: Array.from(uniqueDepartments.entries())
      .map(([value, original]) => ({
        value,
        label: formatDepartmentLabel(original || value),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ca')),
    owners: [...new Set(projects.map((project) => String(project.owner || '').trim()).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, 'ca')
    ),
  }
}

export const paginateProjects = (
  projects: ProjectListRecord[],
  page: number,
  limit: number
) => {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  const safePage = Math.max(0, page)
  const start = safePage * safeLimit
  return {
    page: safePage,
    limit: safeLimit,
    total: projects.length,
    projects: projects.slice(start, start + safeLimit),
  }
}

export const parseProjectListQuery = (searchParams: URLSearchParams): ProjectListQuery => {
  const page = Number.parseInt(searchParams.get('page') || '0', 10)
  const limit = Number.parseInt(searchParams.get('limit') || '12', 10)
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'mine'

  return {
    page: Number.isFinite(page) ? page : 0,
    limit: Number.isFinite(limit) ? limit : 12,
    scope,
    q: searchParams.get('q') || '',
    department: searchParams.get('department') || '',
    owner: searchParams.get('owner') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    lifecycle:
      searchParams.get('lifecycle') === 'closed'
        ? 'closed'
        : searchParams.get('lifecycle') === 'all'
          ? 'all'
          : 'open',
  }
}
