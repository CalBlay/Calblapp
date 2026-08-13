export const PROJECT_DEPARTMENTS = [
  'Empresa',
  'Compres',
  'Comptabilitat',
  'Administracio',
  'Direccio',
  'Restauracio',
  'Marqueting',
  'Manteniment',
  'Decoracio',
  'Recursos Humans',
  'Serveis',
  'Logistica',
  'Cuina',
  'Cuina del Felix',
  'Food Lover',
  'FDLC',
  'Qualitat',
  'Produccio',
  'Casaments',
  'Transports',
] as const

export const PROJECT_PHASE_OPTIONS = [
  { value: 'initial', label: 'Esborrany' },
  { value: 'definition', label: 'Creat' },
  { value: 'kickoff', label: "Reunió d'arrencada" },
  { value: 'planning', label: 'Planificació' },
  { value: 'execution', label: 'Execució' },
  { value: 'control', label: 'Control' },
  { value: 'evaluation', label: 'Avaluació' },
  { value: 'closed', label: 'Tancat' },
] as const

export const PROJECT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Esborrany' },
  { value: 'definition', label: 'Creat' },
  { value: 'kickoff', label: "Reunió d'arrencada" },
  { value: 'planning', label: 'En planificació' },
  { value: 'execution', label: 'En execució' },
  { value: 'control', label: 'En control' },
  { value: 'evaluation', label: 'En avaluació' },
  { value: 'closed', label: 'Tancat' },
] as const

export const BLOCK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendent' },
  { value: 'in_progress', label: 'En curs' },
  { value: 'blocked', label: 'Bloquejat' },
  { value: 'overdue', label: 'En retard' },
  { value: 'done', label: 'Fet' },
] as const

export const TASK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendent' },
  { value: 'in_progress', label: 'En curs' },
  { value: 'blocked', label: 'Bloquejada' },
  { value: 'done', label: 'Feta' },
] as const

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
] as const

export const SCRUM_STORY_POINT_OPTIONS = [
  { value: '1', label: '1 punt' },
  { value: '2', label: '2 punts' },
  { value: '3', label: '3 punts' },
  { value: '5', label: '5 punts' },
  { value: '8', label: '8 punts' },
  { value: '13', label: '13 punts' },
] as const

export type ProjectSprint = {
  id: string
  name: string
  goal: string
  startDate: string
  endDate: string
  status: 'planned' | 'active' | 'closed'
}

export type ProjectTask = {
  id: string
  createdAt?: number
  title: string
  description?: string
  department?: string
  owner: string
  deadline: string
  dependsOn: string
  cost?: string
  sprintId?: string
  storyPoints?: string
  priority: string
  status: string
  outlookEventId?: string
  outlookEventWebLink?: string
  outlookEventEmail?: string
  documents?: ProjectDocument[]
  meetings?: ProjectMeetingRecord[]
}

export type ProjectBlock = {
  id: string
  createdAt?: number
  name: string
  summary: string
  department: string
  departments: string[]
  owner: string
  deadline: string
  budget: string
  dependsOn: string
  status: string
  outlookEventId?: string
  outlookEventWebLink?: string
  outlookEventEmail?: string
  tasks: ProjectTask[]
  meetings?: ProjectMeetingRecord[]
}

export type ProjectDocument = {
  id?: string
  category?: string
  label?: string
  name?: string
  path?: string
  url?: string
  size?: number
  type?: string
} | null

export type ProjectRoom = {
  id: string
  name: string
  kind: 'block' | 'manual' | 'general'
  blockId?: string
  opsChannelId?: string
  opsChannelName?: string
  opsChannelSource?: 'projects'
  opsSyncedAt?: number
  departments: string[]
  participants: string[]
  participantDetails?: Array<{
    name: string
    department?: string
    role?: string
  }>
  notes?: string
  documents?: ProjectDocument[]
  messages?: Array<{
    id: string
    author: string
    text: string
    createdAt: number
  }>
}

export const PROJECT_DOCUMENT_CATEGORIES = [
  { value: 'initial', label: 'Document inicial' },
  { value: 'kickoff', label: "Reunió d'arrencada" },
  { value: 'general', label: 'Projecte general' },
  { value: 'block', label: 'Blocs' },
  { value: 'other', label: 'Altres' },
] as const

export type KickoffAttendee = {
  key: string
  department: string
  userId: string
  name: string
  email: string
  attended?: boolean
}

export type ProjectMeetingAttendee = {
  key: string
  department: string
  userId: string
  name: string
  email: string
}

export type ProjectMeetingRecord = {
  id: string
  scope: 'block' | 'task'
  title: string
  date: string
  startTime: string
  durationMinutes: number
  notes: string
  attendees: ProjectMeetingAttendee[]
  organizerEmail?: string
  organizerUserId?: string
  attachments?: Array<Exclude<ProjectDocument, null>>
  invitedAt?: number
  graphEventId?: string
  graphWebLink?: string
  graphJoinUrl?: string
  status?: string
  emailNotificationStatus?: 'sent' | 'failed'
  emailNotificationError?: string
}

export type KickoffData = {
  date: string
  startTime: string
  durationMinutes: number
  notes: string
  minutes: string
  minutesStatus?: 'open' | 'closed'
  minutesAuthor?: string
  minutesClosedAt?: string
  minutesUpdatedAt?: string
  excludedKeys: string[]
  attendees: KickoffAttendee[]
  status?: string
  graphWebLink?: string
  organizerEmail?: string
  organizerUserId?: string
  invitedAt?: number
  graphEventId?: string
  graphJoinUrl?: string
  emailNotificationStatus?: 'sent' | 'failed'
  emailNotificationError?: string
}

export type ProjectData = {
  id: string
  createdAt?: string | number | null
  name: string
  sponsor: string
  owner: string
  ownerUserId?: string
  createdById?: string
  context: string
  strategy: string
  risks: string
  startDate: string
  launchDate: string
  budget: string
  departments: string[]
  phase: string
  status: string
  blocks: ProjectBlock[]
  sprints: ProjectSprint[]
  rooms: ProjectRoom[]
  document: ProjectDocument
  documents: ProjectDocument[]
  kickoff: KickoffData
}

export type ProjectTaskDependencyMeta = {
  dependencyTask: ProjectTask
  dependencyBlock: ProjectBlock
  isResolved: boolean
}

export const EMPTY_KICKOFF: KickoffData = {
  date: '',
  startTime: '',
  durationMinutes: 60,
  notes: '',
  minutes: '',
  minutesStatus: 'open',
  minutesAuthor: '',
  minutesClosedAt: '',
  minutesUpdatedAt: '',
  excludedKeys: [],
  attendees: [],
  status: '',
  graphWebLink: '',
}

export const EMPTY_SPRINT: ProjectSprint = {
  id: '',
  name: '',
  goal: '',
  startDate: '',
  endDate: '',
  status: 'planned',
}

export const statusLabel = (status?: string) =>
  PROJECT_STATUS_OPTIONS.find((item) => item.value === status)?.label || status || 'Sense estat'

export const normalizeTaskWorkflowStatus = (status?: string | null) =>
  String(status || 'pending').trim().toLowerCase() || 'pending'

export const getTaskDependencyMeta = (
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>,
  taskOrDependencyId: Pick<ProjectTask, 'dependsOn'> | string
): ProjectTaskDependencyMeta | null => {
  const dependencyId =
    typeof taskOrDependencyId === 'string'
      ? String(taskOrDependencyId || '').trim()
      : String(taskOrDependencyId.dependsOn || '').trim()

  if (!dependencyId) return null

  for (const block of blocks) {
    const dependencyTask = (block.tasks || []).find((task) => String(task.id || '').trim() === dependencyId)
    if (!dependencyTask) continue

    return {
      dependencyTask,
      dependencyBlock: block as ProjectBlock,
      isResolved: normalizeTaskWorkflowStatus(dependencyTask.status) === 'done',
    }
  }

  return null
}

export const canTaskAdvanceFromPending = (
  task: Pick<ProjectTask, 'dependsOn'>,
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
) => {
  const dependency = getTaskDependencyMeta(blocks, task)
  return !dependency || dependency.isResolved
}

export const hasUnresolvedTaskDependency = (
  task: Pick<ProjectTask, 'dependsOn'>,
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
) => !canTaskAdvanceFromPending(task, blocks)

export const canChangeTaskStatus = (
  task: Pick<ProjectTask, 'dependsOn' | 'status'>,
  nextStatus: string,
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
) => {
  const next = normalizeTaskWorkflowStatus(nextStatus)
  if (hasUnresolvedTaskDependency(task, blocks)) {
    return next === 'blocked'
  }
  return true
}

export const resolveTaskStatusWithDependencies = (
  task: ProjectTask,
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
): ProjectTask => {
  const status = normalizeTaskWorkflowStatus(task.status)
  if (status === 'done') return task

  if (hasUnresolvedTaskDependency(task, blocks)) {
    return status === 'blocked' ? task : { ...task, status: 'blocked' }
  }

  if (status === 'blocked') {
    return { ...task, status: 'pending' }
  }

  return task
}

export const applyDependencyLocksToBlocks = <T extends Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>(
  blocks: T[]
): T[] =>
  blocks.map((block) => ({
    ...block,
    tasks: (Array.isArray(block.tasks) ? block.tasks : []).map((task) =>
      resolveTaskStatusWithDependencies(task as ProjectTask, blocks)
    ),
  }))

export type ProjectTaskDependencyOption = {
  id: string
  label: string
}

const taskStatusLabel = (status?: string | null) =>
  TASK_STATUS_OPTIONS.find((item) => item.value === normalizeTaskWorkflowStatus(status))?.label ||
  status ||
  'Pendent'

export const findTaskBlockId = (
  blocks: Array<Pick<ProjectBlock, 'id' | 'tasks'>>,
  taskId: string
): string => {
  const normalizedTaskId = String(taskId || '').trim()
  if (!normalizedTaskId) return ''

  for (const block of blocks) {
    const hasTask = (Array.isArray(block.tasks) ? block.tasks : []).some(
      (task) => String(task.id || '').trim() === normalizedTaskId
    )
    if (hasTask) return String(block.id || '').trim()
  }

  return ''
}

export const getBlockTaskDependencyOptions = (
  block: Pick<ProjectBlock, 'id' | 'name' | 'tasks'> | null | undefined,
  options?: { excludeTaskId?: string; includeTaskId?: string }
): ProjectTaskDependencyOption[] => {
  if (!block) return []

  const excludeTaskId = String(options?.excludeTaskId || '').trim()
  const includeTaskId = String(options?.includeTaskId || '').trim()

  return (Array.isArray(block.tasks) ? block.tasks : [])
    .filter((task) => {
      const taskId = String(task.id || '').trim()
      if (!taskId) return false
      if (excludeTaskId && taskId === excludeTaskId) return false
      if (includeTaskId && taskId === includeTaskId) return true
      return normalizeTaskWorkflowStatus(task.status) !== 'done'
    })
    .map((task) => {
      const title = String(task.title || '').trim() || 'Tasca'

      return {
        id: task.id,
        label: `${title} (${taskStatusLabel(task.status)})`,
      }
    })
}

export const getProjectBlocksWithDependencyCandidates = (
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>,
  options?: { excludeTaskId?: string; includeTaskId?: string }
) =>
  blocks.filter((block) => getBlockTaskDependencyOptions(block, options).length > 0)

export const getProjectTaskDependencyOptions = (
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>,
  options?: { excludeTaskId?: string; includeTaskId?: string }
): ProjectTaskDependencyOption[] => {
  return blocks.flatMap((block) => {
    const blockName = String(block.name || '').trim()

    return getBlockTaskDependencyOptions(block, options).map((option) => ({
      id: option.id,
      label: blockName ? `${option.label} · ${blockName}` : option.label,
    }))
  })
}

export const summarizeBlockTasks = (block: Pick<ProjectBlock, 'tasks' | 'meetings'>) => {
  const tasks = Array.isArray(block.tasks) ? block.tasks : []

  return {
    taskPending: tasks.filter((task) => normalizeTaskWorkflowStatus(task.status) === 'pending').length,
    taskInProgress: tasks.filter((task) => normalizeTaskWorkflowStatus(task.status) === 'in_progress').length,
    taskBlocked: tasks.filter((task) => normalizeTaskWorkflowStatus(task.status) === 'blocked').length,
    taskDone: tasks.filter((task) => normalizeTaskWorkflowStatus(task.status) === 'done').length,
    taskTotal: tasks.length,
    meetingCount: Array.isArray(block.meetings) ? block.meetings.length : 0,
  }
}

export const getBlockStatusExplanation = (
  block: Pick<ProjectBlock, 'tasks' | 'status'>,
  allBlocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
): string | null => {
  const tasks = Array.isArray(block.tasks) ? block.tasks : []
  const blockedTasks = tasks.filter((task) => normalizeTaskWorkflowStatus(task.status) === 'blocked')

  if (blockedTasks.length > 0) {
    const titles = blockedTasks
      .map((task) => `"${String(task.title || '').trim() || 'Tasca'}"`)
      .join(', ')

    return blockedTasks.length === 1
      ? `El bloc està bloquejat perquè la tasca ${titles} està bloquejada.`
      : `El bloc està bloquejat perquè les tasques ${titles} estan bloquejades.`
  }

  const waitingOnDependency = tasks.filter((task) => {
    if (normalizeTaskWorkflowStatus(task.status) === 'done') return false
    const dependency = getTaskDependencyMeta(allBlocks, task)
    return Boolean(dependency && !dependency.isResolved)
  })

  if (waitingOnDependency.length > 0 && normalizeTaskWorkflowStatus(block.status) === 'blocked') {
    const titles = waitingOnDependency
      .map((task) => `"${String(task.title || '').trim() || 'Tasca'}"`)
      .join(', ')
    return `El bloc està bloquejat mentre ${titles} espera dependències.`
  }

  return null
}

export const getTaskDependencyHint = (
  allBlocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>,
  task: Pick<ProjectTask, 'dependsOn' | 'status' | 'title'>
): string | null => {
  const dependency = getTaskDependencyMeta(allBlocks, task)
  if (!dependency || dependency.isResolved) return null

  const dependencyTitle = String(dependency.dependencyTask.title || '').trim() || 'la tasca prèvia'
  return `Esperant que "${dependencyTitle}" estigui feta.`
}

export const phaseLabel = (phase?: string) =>
  PROJECT_PHASE_OPTIONS.find((item) => item.value === phase)?.label || phase || 'Inicial'

export const deriveBlockStatus = (
  block: Pick<ProjectBlock, 'tasks'> & Partial<Pick<ProjectBlock, 'status'>>
) => {
  const tasks = Array.isArray(block.tasks) ? block.tasks : []
  if (tasks.length === 0) return block.status || 'pending'
  if (tasks.some((task) => task.status === 'blocked')) return 'blocked'
  if (tasks.every((task) => task.status === 'done')) return 'done'
  const deadline = String((block as Partial<ProjectBlock>).deadline || '').trim()
  if (deadline) {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (deadline <= todayKey) return 'overdue'
  }
  if (tasks.some((task) => task.status === 'in_progress' || task.status === 'done')) return 'in_progress'
  return 'in_progress'
}

export const deriveProjectPhase = (project: Pick<ProjectData, 'kickoff' | 'blocks' | 'launchDate'>) => {
  const blocks = Array.isArray(project.blocks) ? project.blocks : []
  const allTasks = blocks.flatMap((block) => block.tasks || [])
  const hasKickoffLaunched = Boolean(
    String(project.kickoff?.status || '').trim() ||
      String(project.kickoff?.graphWebLink || '').trim()
  )
  const hasBlocks = blocks.length > 0
  const hasTasks = allTasks.length > 0
  const hasAssignedTasks = allTasks.some((task) => String(task.owner || '').trim())
  const hasAssignedBlocks = blocks.some((block) => String(block.owner || '').trim())

  if (hasAssignedTasks || hasAssignedBlocks) return 'execution'
  if (hasBlocks || hasTasks) return 'planning'
  if (hasKickoffLaunched) return 'kickoff'
  return 'definition'
}

export const parseProjectCost = (value?: string | number | null) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatProjectCost = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',')
}

export const sumTaskCosts = (tasks?: ProjectTask[]) =>
  (tasks || []).reduce((sum, task) => sum + parseProjectCost(task.cost), 0)

export const formatProjectDate = (value?: string | number | null) => {
  if (typeof value === 'number') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Sense data'
    return date.toLocaleDateString('ca-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const raw = String(value || '').trim()
  if (!raw) return 'Sense data'

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw

  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(date.getTime())) return raw

  return date.toLocaleDateString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const getBlockDepartments = (block: Pick<ProjectBlock, 'department' | 'departments'>) => {
  const next = Array.isArray(block.departments) ? block.departments.filter(Boolean) : []
  if (next.length > 0) return [...new Set(next)]
  return block.department ? [block.department] : []
}

export const getPrimaryBlockDepartment = (block: Pick<ProjectBlock, 'department' | 'departments'>) =>
  getBlockDepartments(block)[0] || ''

export const getPreLaunchDeadline = (launchDate?: string | null) => {
  const raw = String(launchDate || '').trim()
  if (!raw) return ''
  const base = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(base.getTime())) return ''
  const previousDay = new Date(base)
  previousDay.setDate(previousDay.getDate() - 1)
  return previousDay.toISOString().slice(0, 10)
}

export const clampProjectDeadline = (value: string, launchDate?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const max = getPreLaunchDeadline(launchDate)
  if (!max) return raw
  return raw > max ? max : raw
}
