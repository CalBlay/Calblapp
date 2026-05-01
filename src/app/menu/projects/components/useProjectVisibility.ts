'use client'

import { useMemo } from 'react'
import {
  getBlockDepartments,
  type ProjectData,
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
  const canDeleteProject = sessionRole === 'admin' || isProjectSponsor
  const hasFullProjectVisibility =
    sessionRole === 'admin' || sessionRole === 'direccio' || isProjectSponsor || isProjectOwner
  const canViewOverview = sessionRole === 'admin' || isProjectSponsor || isProjectOwner
  const canCreateOrRemoveBlocks = sessionRole === 'admin' || isProjectOwner

  const visibleTabs = useMemo<WorkspaceTab[]>(
    () =>
      sessionStatus === 'loading'
        ? workspaceTabs.map((tab) => tab.id)
        : workspaceTabs
            .map((tab) => tab.id)
            .filter((tabId) => {
              if (tabId === 'rooms') return false
              if (tabId === 'overview') return canViewOverview
              return true
            }),
    [canViewOverview, sessionStatus]
  )

  const visibleProjectForBlocks = useMemo<ProjectData>(() => {
    if (hasFullProjectVisibility) return project

    const filteredBlocks = project.blocks.filter((block) => {
      const blockDepartments = getBlockDepartments(block).map((department) =>
        normalizeDepartment(department)
      )
      const isResponsible =
        (sessionUserName && String(block.owner || '').trim() === sessionUserName) ||
        block.tasks.some((task) => String(task.owner || '').trim() === sessionUserName)
      const isDepartmentCap =
        sessionRole === 'cap' &&
        Boolean(sessionDepartment) &&
        blockDepartments.includes(sessionDepartment)

      return isResponsible || isDepartmentCap
    })

    return {
      ...project,
      blocks: filteredBlocks,
    }
  }, [hasFullProjectVisibility, project, sessionDepartment, sessionRole, sessionUserName])

  const visibleProjectForTasks = useMemo<ProjectData>(() => {
    if (hasFullProjectVisibility) return project

    const filteredBlocks = project.blocks.filter((block) => {
      const blockDepartments = getBlockDepartments(block).map((department) =>
        normalizeDepartment(department)
      )
      const isBlockResponsible = sessionUserName && String(block.owner || '').trim() === sessionUserName
      const isTaskResponsible = block.tasks.some(
        (task) => String(task.owner || '').trim() === sessionUserName
      )
      const isDepartmentParticipant =
        Boolean(sessionDepartment) && blockDepartments.includes(sessionDepartment)

      return isBlockResponsible || isTaskResponsible || isDepartmentParticipant
    })

    return {
      ...project,
      blocks: filteredBlocks,
    }
  }, [hasFullProjectVisibility, project, sessionDepartment, sessionUserName])

  const canEditSpecificBlock = (block: ProjectData['blocks'][number]) =>
    sessionRole === 'admin' ||
    isProjectOwner ||
    ((sessionUserName && String(block.owner || '').trim() === sessionUserName) || false)

  const canAccessSpecificBlockRoom = (block: ProjectData['blocks'][number]) =>
    canEditSpecificBlock(block) ||
    block.tasks.some((task) => Boolean(sessionUserName && String(task.owner || '').trim() === sessionUserName))

  const canManageSpecificTask = (
    block: ProjectData['blocks'][number],
    _task: ProjectData['blocks'][number]['tasks'][number]
  ) =>
    sessionRole === 'admin' ||
    isProjectOwner ||
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
    visibleProjectForTasks.blocks.some((block) =>
      block.tasks.some(
        (task) =>
          canManageSpecificTask(block, task) ||
          canAccessSpecificTaskOps(block, task) ||
          canMoveSpecificTask(block, task)
      )
    )

  return {
    canAccessSpecificBlockRoom,
    canAccessSpecificTaskOps,
    canCreateOrRemoveBlocks,
    canDeleteProject,
    canEditSpecificBlock,
    canManageSpecificTask,
    canMoveSpecificTask,
    canSaveTasks,
    canViewOverview,
    hasFullProjectVisibility,
    isProjectOwner,
    visibleProjectForBlocks,
    visibleProjectForTasks,
    visibleTabs,
  }
}
