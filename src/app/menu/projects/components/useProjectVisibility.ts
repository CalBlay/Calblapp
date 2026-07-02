'use client'

import { useMemo } from 'react'
import { resolveUserProjectParticipation } from '@/lib/projectParticipation'
import { canAccessBlockRoom, canAccessGeneralRoom } from '@/lib/projectRoomAccess'
import {
  getBlockDepartments,
  type ProjectBlock,
  type ProjectData,
  type ProjectTask,
} from './project-shared'
import {
  normalizeDepartment,
  type WorkspaceTab,
  workspaceTabs,
} from './project-workspace-helpers'

type Params = {
  project: ProjectData
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated'
  sessionRole: string
  sessionUserId: string
  sessionUserName: string
  sessionDepartment: string
}

export function useProjectVisibility({
  project,
  sessionStatus,
  sessionRole,
  sessionUserId,
  sessionUserName,
  sessionDepartment,
}: Params) {
  const isProjectOwner =
    (sessionUserId && sessionUserId === String(project.ownerUserId || '').trim()) ||
    (sessionUserName && sessionUserName === String(project.owner || '').trim())
  const isProjectSponsor =
    (sessionUserId && sessionUserId === String(project.createdById || '').trim()) ||
    (sessionUserName && sessionUserName === String(project.sponsor || '').trim())
  const canManageProject =
    sessionRole === 'admin' || isProjectOwner || isProjectSponsor
  const canDeleteProject = sessionRole === 'admin' || isProjectSponsor
  const hasFullProjectVisibility =
    sessionRole === 'admin' || sessionRole === 'direccio' || isProjectSponsor || isProjectOwner
  const canCreateOrRemoveBlocks = canManageProject
  const isBlockResponsible = useMemo(
    () =>
      Boolean(
        sessionUserName &&
          project.blocks.some((block) => String(block.owner || '').trim() === sessionUserName)
      ),
    [project.blocks, sessionUserName]
  )
  const isTaskResponsible = useMemo(
    () =>
      Boolean(
        sessionUserName &&
          project.blocks.some((block) =>
            block.tasks.some((task) => String(task.owner || '').trim() === sessionUserName)
          )
      ),
    [project.blocks, sessionUserName]
  )
  const isBlockResponsibleOnly = isBlockResponsible && !hasFullProjectVisibility
  const sharedWorkspaceTabs = useMemo<WorkspaceTab[]>(
    () => ['tracking', 'blocks', 'tasks', 'planning'],
    []
  )
  const participation = useMemo(
    () =>
      resolveUserProjectParticipation(
        {
          id: sessionUserId,
          name: sessionUserName,
          role: sessionRole,
          department: sessionDepartment,
        },
        project,
        { includeGlobalAccessLabel: true }
      ),
    [project, sessionDepartment, sessionRole, sessionUserId, sessionUserName]
  )
  const preferredWorkspaceTab = useMemo<WorkspaceTab>(() => {
    if (isProjectOwner || isProjectSponsor) return 'tracking'
    if (isBlockResponsibleOnly) return 'tracking'
    if (isTaskResponsible) return 'tracking'
    if (hasFullProjectVisibility) return 'tracking'
    return 'tracking'
  }, [
    hasFullProjectVisibility,
    isBlockResponsibleOnly,
    isProjectOwner,
    isProjectSponsor,
    isTaskResponsible,
  ])

  const visibleTabs = useMemo<WorkspaceTab[]>(
    () => {
      if (sessionStatus === 'loading') {
        return workspaceTabs.map((tab) => tab.id)
      }

      return sharedWorkspaceTabs
    },
    [
      sessionStatus,
      sharedWorkspaceTabs,
    ]
  )

  const visibleProjectForBlocks = useMemo<ProjectData>(() => {
    if (hasFullProjectVisibility) return project

    if (isBlockResponsible) {
      return {
        ...project,
        blocks: project.blocks.filter(
          (block) => sessionUserName && String(block.owner || '').trim() === sessionUserName
        ),
      }
    }

    return {
      ...project,
      blocks: [],
    }
  }, [hasFullProjectVisibility, isBlockResponsible, project, sessionUserName])

  const visibleProjectForTasks = useMemo<ProjectData>(() => {
    if (hasFullProjectVisibility) return project

    if (isBlockResponsible) {
      const filteredBlocks = project.blocks.filter((block) => {
        const blockDepartments = getBlockDepartments(block).map((department) =>
          normalizeDepartment(department)
        )
        const isCurrentBlockResponsible =
          sessionUserName && String(block.owner || '').trim() === sessionUserName
        const isCurrentTaskResponsible = block.tasks.some(
          (task) => String(task.owner || '').trim() === sessionUserName
        )
        const isDepartmentCap =
          sessionRole === 'cap' &&
          Boolean(sessionDepartment) &&
          blockDepartments.includes(sessionDepartment)

        return isCurrentBlockResponsible || isCurrentTaskResponsible || isDepartmentCap
      })

      return {
        ...project,
        blocks: filteredBlocks,
      }
    }

    if (isTaskResponsible) {
      return {
        ...project,
        blocks: project.blocks
          .map((block) => ({
            ...block,
            tasks: block.tasks.filter(
              (task) => String(task.owner || '').trim() === sessionUserName
            ),
          }))
          .filter((block) => block.tasks.length > 0),
      }
    }

    return {
      ...project,
      blocks: [],
    }
  }, [
    hasFullProjectVisibility,
    isBlockResponsible,
    isTaskResponsible,
    project,
    sessionDepartment,
    sessionRole,
    sessionUserName,
  ])

  const canEditSpecificBlock = (block: ProjectData['blocks'][number]) =>
    canManageProject ||
    ((sessionUserName && String(block.owner || '').trim() === sessionUserName) || false)

  const canAccessSpecificBlockRoom = (block: ProjectData['blocks'][number]) => {
    const room = project.rooms.find((item) => item.kind === 'block' && item.blockId === block.id)
    return canAccessBlockRoom(
      { id: sessionUserId, name: sessionUserName, role: sessionRole },
      project,
      block,
      room
    )
  }

  const canAccessProjectGeneralRoom = useMemo(() => {
    const generalRoom = project.rooms.find((item) => item.kind === 'general')
    return canAccessGeneralRoom(
      { id: sessionUserId, name: sessionUserName, role: sessionRole },
      project,
      project.blocks,
      generalRoom
    )
  }, [project, sessionRole, sessionUserId, sessionUserName])

  const canManageSpecificTask = (
    block: ProjectData['blocks'][number],
    _task: ProjectData['blocks'][number]['tasks'][number]
  ) =>
    canManageProject ||
    ((sessionUserName && String(block.owner || '').trim() === sessionUserName) || false)

  const canAccessSpecificTaskOps = (
    block: ProjectData['blocks'][number],
    task: ProjectData['blocks'][number]['tasks'][number]
  ) => canManageSpecificTask(block, task) || Boolean(sessionUserName && String(task.owner || '').trim() === sessionUserName)

  const canMoveSpecificTask = (
    _block: ProjectData['blocks'][number],
    task: ProjectData['blocks'][number]['tasks'][number]
  ) => Boolean(sessionUserName && String(task.owner || '').trim() === sessionUserName)

  const canSaveTasks =
    canCreateOrRemoveBlocks ||
    isBlockResponsible ||
    visibleProjectForTasks.blocks.some((block) =>
      block.tasks.some(
        (task) =>
          canManageSpecificTask(block, task) ||
          canAccessSpecificTaskOps(block, task) ||
          canMoveSpecificTask(block, task)
      )
    )

  const canConvokeProjectMeeting = canManageProject

  const canConvokeBlockMeeting = (block: ProjectBlock) =>
    canManageProject ||
    Boolean(sessionUserName && String(block.owner || '').trim() === sessionUserName)

  const canConvokeTaskMeeting = (block: ProjectBlock, task: ProjectTask) =>
    canConvokeBlockMeeting(block) ||
    Boolean(sessionUserName && String(task.owner || '').trim() === sessionUserName)

  const canConvokeMeetings =
    canManageProject ||
    isBlockResponsible ||
    isTaskResponsible

  const canConvokeAnyBlockMeeting = visibleProjectForBlocks.blocks.some((block) =>
    canConvokeBlockMeeting(block)
  )

  const canConvokeAnyTaskMeeting = visibleProjectForTasks.blocks.some((block) =>
    block.tasks.some((task) => canConvokeTaskMeeting(block, task))
  )

  return {
    canAccessProjectGeneralRoom,
    canAccessSpecificBlockRoom,
    canAccessSpecificTaskOps,
    canConvokeAnyBlockMeeting,
    canConvokeAnyTaskMeeting,
    canConvokeBlockMeeting,
    canConvokeMeetings,
    canConvokeProjectMeeting,
    canConvokeTaskMeeting,
    canCreateOrRemoveBlocks,
    canDeleteProject,
    canEditProjectData: isProjectOwner,
    canEditSpecificBlock,
    canManageProject,
    canManageSpecificTask,
    canMoveSpecificTask,
    canSaveTasks,
    canViewOverview: true,
    hasExpandedWorkspaceTabs: true,
    hasFullProjectVisibility,
    isBlockResponsibleOnly,
    isBlockResponsible,
    isTaskResponsible,
    isProjectOwner,
    isProjectSponsor,
    participation,
    preferredWorkspaceTab,
    visibleProjectForBlocks,
    visibleProjectForTasks,
    visibleTabs,
  }
}
