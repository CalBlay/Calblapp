import type { ProjectBlock, ProjectTask } from '@/app/menu/projects/components/project-shared'

type MeetingActor = {
  id?: string
  name?: string
  role?: string
}

type MeetingProject = {
  owner?: string
  ownerUserId?: string
  sponsor?: string
  createdById?: string
  blocks?: ProjectBlock[]
}

export function canConvokeBlockMeeting(
  user: MeetingActor,
  project: MeetingProject,
  block: ProjectBlock
) {
  const userName = String(user.name || '').trim()
  const userId = String(user.id || '').trim()
  const role = String(user.role || '').trim()

  if (role === 'admin') return true
  if (userId && userId === String(project.ownerUserId || '').trim()) return true
  if (userName && userName === String(project.owner || '').trim()) return true
  if (userId && userId === String(project.createdById || '').trim()) return true
  if (userName && userName === String(project.sponsor || '').trim()) return true
  return Boolean(userName && userName === String(block.owner || '').trim())
}

export function canConvokeTaskMeeting(
  user: MeetingActor,
  project: MeetingProject,
  block: ProjectBlock,
  task: ProjectTask
) {
  if (canConvokeBlockMeeting(user, project, block)) return true
  const userName = String(user.name || '').trim()
  return Boolean(userName && userName === String(task.owner || '').trim())
}

export function canConvokeProjectMeeting(
  user: MeetingActor,
  project: MeetingProject,
  scope: 'block' | 'task',
  blockId: string,
  taskId?: string
) {
  const blocks = Array.isArray(project.blocks) ? project.blocks : []
  const block = blocks.find((item) => String(item.id || '').trim() === blockId)
  if (!block) return false
  if (scope === 'block') return canConvokeBlockMeeting(user, project, block)
  const task = (block.tasks || []).find((item) => String(item.id || '').trim() === String(taskId || '').trim())
  if (!task) return false
  return canConvokeTaskMeeting(user, project, block, task)
}
