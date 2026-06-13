import { deriveBlockStatus, getBlockDepartments, type ProjectData } from './project-shared'

export type OverviewDirtySnapshot = {
  name: string
  sponsor: string
  owner: string
  context: string
  strategy: string
  startDate: string
  launchDate: string
  departments: string[]
  blocks: Array<{
    id: string
    name: string
    departments: string[]
  }>
  documentId: string
  documentUrl: string
  documentName: string
}

export type BlocksDirtySnapshot = {
  blocks: Array<{
    id: string
    name: string
    summary: string
    department: string
    departments: string[]
    owner: string
    deadline: string
    budget: string
    dependsOn: string
    status: string
    tasks: Array<{
      id: string
      title: string
      description: string
      department: string
      owner: string
      deadline: string
      dependsOn: string
      cost: string
      priority: string
      status: string
      sprintId: string
      storyPoints: string
      documents: Array<{
        id: string
        category: string
        label: string
        name: string
        path: string
        url: string
        size: number
        type: string
      }>
    }>
  }>
  sprints: Array<{
    id: string
    name: string
    goal: string
    startDate: string
    endDate: string
    status: string
  }>
  kickoffMinutes: string
  kickoffMinutesStatus: string
  kickoffMinutesAuthor: string
  kickoffMinutesClosedAt: string
  kickoffMinutesUpdatedAt: string
}

const sortedStrings = (values: string[]) => [...values].sort()

const documentsEqual = (
  left: BlocksDirtySnapshot['blocks'][number]['tasks'][number]['documents'],
  right: BlocksDirtySnapshot['blocks'][number]['tasks'][number]['documents']
) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (
      a.id !== b.id ||
      a.category !== b.category ||
      a.label !== b.label ||
      a.name !== b.name ||
      a.path !== b.path ||
      a.url !== b.url ||
      a.size !== b.size ||
      a.type !== b.type
    ) {
      return false
    }
  }
  return true
}

const tasksEqual = (
  left: BlocksDirtySnapshot['blocks'][number]['tasks'],
  right: BlocksDirtySnapshot['blocks'][number]['tasks']
) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (
      a.id !== b.id ||
      a.title !== b.title ||
      a.description !== b.description ||
      a.department !== b.department ||
      a.owner !== b.owner ||
      a.deadline !== b.deadline ||
      a.dependsOn !== b.dependsOn ||
      a.cost !== b.cost ||
      a.priority !== b.priority ||
      a.status !== b.status ||
      a.sprintId !== b.sprintId ||
      a.storyPoints !== b.storyPoints ||
      !documentsEqual(a.documents, b.documents)
    ) {
      return false
    }
  }
  return true
}

const blocksEqual = (
  left: BlocksDirtySnapshot['blocks'],
  right: BlocksDirtySnapshot['blocks']
) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.summary !== b.summary ||
      a.department !== b.department ||
      a.owner !== b.owner ||
      a.deadline !== b.deadline ||
      a.budget !== b.budget ||
      a.dependsOn !== b.dependsOn ||
      a.status !== b.status
    ) {
      return false
    }

    const leftDepartments = sortedStrings(a.departments)
    const rightDepartments = sortedStrings(b.departments)
    if (
      leftDepartments.length !== rightDepartments.length ||
      !leftDepartments.every((value, deptIndex) => value === rightDepartments[deptIndex]) ||
      !tasksEqual(a.tasks, b.tasks)
    ) {
      return false
    }
  }
  return true
}

export const captureOverviewDirtySnapshot = (source: ProjectData): OverviewDirtySnapshot => ({
  name: source.name,
  sponsor: source.sponsor,
  owner: source.owner,
  context: source.context,
  strategy: source.strategy,
  startDate: source.startDate,
  launchDate: source.launchDate,
  departments: sortedStrings(source.departments),
  blocks: source.blocks.map((block) => ({
    id: block.id,
    name: block.name,
    departments: sortedStrings(getBlockDepartments(block)),
  })),
  documentId: source.document?.id || '',
  documentUrl: source.document?.url || '',
  documentName: source.document?.name || '',
})

export const captureBlocksDirtySnapshot = (source: ProjectData): BlocksDirtySnapshot => ({
  blocks: source.blocks.map((block) => ({
    id: block.id,
    name: block.name,
    summary: block.summary,
    department: block.department,
    departments: sortedStrings(getBlockDepartments(block)),
    owner: block.owner,
    deadline: block.deadline,
    budget: block.budget || '',
    dependsOn: block.dependsOn || '',
    status: block.status || deriveBlockStatus(block),
    tasks: (block.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || '',
      department: task.department || '',
      owner: task.owner,
      deadline: task.deadline,
      dependsOn: task.dependsOn || '',
      cost: task.cost || '',
      priority: task.priority || 'normal',
      status: task.status || 'pending',
      sprintId: task.sprintId || '',
      storyPoints: task.storyPoints || '',
      documents: (task.documents || []).map((item) => ({
        id: item?.id || '',
        category: item?.category || 'other',
        label: item?.label || item?.name || '',
        name: item?.name || '',
        path: item?.path || '',
        url: item?.url || '',
        size: item?.size || 0,
        type: item?.type || '',
      })),
    })),
  })),
  sprints: (source.sprints || []).map((sprint) => ({
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    status: sprint.status || 'planned',
  })),
  kickoffMinutes: source.kickoff.minutes || '',
  kickoffMinutesStatus: source.kickoff.minutesStatus || 'open',
  kickoffMinutesAuthor: source.kickoff.minutesAuthor || '',
  kickoffMinutesClosedAt: source.kickoff.minutesClosedAt || '',
  kickoffMinutesUpdatedAt: source.kickoff.minutesUpdatedAt || '',
})

export const overviewSnapshotsDiffer = (
  left: OverviewDirtySnapshot,
  right: OverviewDirtySnapshot
) => {
  if (
    left.name !== right.name ||
    left.sponsor !== right.sponsor ||
    left.owner !== right.owner ||
    left.context !== right.context ||
    left.strategy !== right.strategy ||
    left.startDate !== right.startDate ||
    left.launchDate !== right.launchDate ||
    left.documentId !== right.documentId ||
    left.documentUrl !== right.documentUrl ||
    left.documentName !== right.documentName ||
    left.departments.length !== right.departments.length ||
    left.blocks.length !== right.blocks.length
  ) {
    return true
  }

  for (let index = 0; index < left.departments.length; index += 1) {
    if (left.departments[index] !== right.departments[index]) return true
  }

  for (let index = 0; index < left.blocks.length; index += 1) {
    const a = left.blocks[index]
    const b = right.blocks[index]
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.departments.length !== b.departments.length ||
      !a.departments.every((value, deptIndex) => value === b.departments[deptIndex])
    ) {
      return true
    }
  }

  return false
}

export const blocksSnapshotsDiffer = (
  left: BlocksDirtySnapshot,
  right: BlocksDirtySnapshot
) => {
  if (
    left.kickoffMinutes !== right.kickoffMinutes ||
    left.kickoffMinutesStatus !== right.kickoffMinutesStatus ||
    left.kickoffMinutesAuthor !== right.kickoffMinutesAuthor ||
    left.kickoffMinutesClosedAt !== right.kickoffMinutesClosedAt ||
    left.kickoffMinutesUpdatedAt !== right.kickoffMinutesUpdatedAt ||
    left.sprints.length !== right.sprints.length ||
    !blocksEqual(left.blocks, right.blocks)
  ) {
    return true
  }

  for (let index = 0; index < left.sprints.length; index += 1) {
    const a = left.sprints[index]
    const b = right.sprints[index]
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.goal !== b.goal ||
      a.startDate !== b.startDate ||
      a.endDate !== b.endDate ||
      a.status !== b.status
    ) {
      return true
    }
  }

  return false
}
