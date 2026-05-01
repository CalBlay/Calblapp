'use client'

import { type Dispatch, type SetStateAction } from 'react'
import type { ProjectData } from './project-shared'
import type {
  createBlockDraft,
  createTaskDraft,
  WorkspaceTab,
} from './project-workspace-helpers'

type BlockDraft = ReturnType<typeof createBlockDraft>
type TaskDraft = ReturnType<typeof createTaskDraft>

type Params = {
  activeTab: WorkspaceTab
  addTaskToBlock: (blockId: string) => void
  blockDraft: BlockDraft
  createBlock: () => void
  dirtyBlocks: boolean
  dirtyOverview: boolean
  documentDraft: { category: string; label: string }
  pendingDocumentFile: File | null
  pendingFile: File | null
  quickTaskBlockId: string | null
  saveBlocks: () => Promise<boolean>
  saveDocuments: () => Promise<boolean>
  saveOverview: () => Promise<boolean>
  setActiveTab: Dispatch<SetStateAction<WorkspaceTab>>
  setDirtyBlocksState: Dispatch<SetStateAction<boolean>>
  setProject: Dispatch<SetStateAction<ProjectData>>
  showBlockComposer: boolean
  showTaskComposer: boolean
  taskDraft: TaskDraft
}

export function useProjectTabWorkflow({
  activeTab,
  addTaskToBlock,
  blockDraft,
  createBlock,
  dirtyBlocks,
  dirtyOverview,
  documentDraft,
  pendingDocumentFile,
  pendingFile,
  quickTaskBlockId,
  saveBlocks,
  saveDocuments,
  saveOverview,
  setActiveTab,
  setDirtyBlocksState,
  setProject,
  showBlockComposer,
  showTaskComposer,
  taskDraft,
}: Params) {
  const hasPendingBlockDraft =
    showBlockComposer &&
    Boolean(
      String(blockDraft.name || '').trim() ||
      String(blockDraft.summary || '').trim() ||
      String(blockDraft.department || '').trim() ||
      String(blockDraft.owner || '').trim() ||
      String(blockDraft.deadline || '').trim() ||
      String(blockDraft.budget || '').trim() ||
      String(blockDraft.dependsOn || '').trim()
    )

  const hasPendingTaskDraft =
    showTaskComposer &&
    Boolean(
      String(taskDraft.blockId || '').trim() && String(taskDraft.blockId || '').trim() !== 'none' &&
      (
        String(taskDraft.title || '').trim() ||
        String(taskDraft.description || '').trim() ||
        String(taskDraft.department || '').trim() ||
        String(taskDraft.owner || '').trim() ||
        String(taskDraft.deadline || '').trim() ||
        String(taskDraft.sprintId || '').trim()
      )
    )

  const hasPendingDocumentDraft =
    Boolean(pendingDocumentFile) || Boolean(String(documentDraft.label || '').trim())

  const createSprint = (name: string) => {
    const nextName = String(name || '').trim()
    if (!nextName) return
    setDirtyBlocksState(true)
    setProject((current) => {
      if (current.sprints.some((sprint) => sprint.name.toLowerCase() === nextName.toLowerCase())) {
        return current
      }
      const nextSprint = {
        id: `sprint-${Date.now()}`,
        name: nextName,
        goal: '',
        startDate: '',
        endDate: '',
        status: 'planned' as const,
      }
      return {
        ...current,
        sprints: [...(current.sprints || []), nextSprint],
      }
    })
  }

  const shouldWarnBeforeLeavingTab = (tab: WorkspaceTab) => {
    if (tab === 'overview') return dirtyOverview || Boolean(pendingFile)
    if (tab === 'blocks') return dirtyBlocks || hasPendingBlockDraft
    if (tab === 'tasks') return dirtyBlocks || hasPendingTaskDraft
    if (tab === 'documents') return hasPendingDocumentDraft
    return false
  }

  const handleTabChange = async (nextTab: WorkspaceTab) => {
    if (nextTab === activeTab) return
    if (!shouldWarnBeforeLeavingTab(activeTab)) {
      setActiveTab(nextTab)
      return
    }

    const confirmed = window.confirm('Tens canvis pendents. Vols guardar abans de sortir?')
    if (!confirmed) return

    let saved = true

    if (activeTab === 'overview') {
      saved = await saveOverview()
    } else if (activeTab === 'blocks') {
      if (hasPendingBlockDraft) {
        createBlock()
      }
      if (hasPendingTaskDraft && quickTaskBlockId) {
        addTaskToBlock(quickTaskBlockId)
      }
      saved = await saveBlocks()
    } else if (activeTab === 'tasks') {
      if (hasPendingTaskDraft && taskDraft.blockId && taskDraft.blockId !== 'none') {
        addTaskToBlock(taskDraft.blockId)
      }
      saved = await saveBlocks()
    } else if (activeTab === 'documents') {
      saved = await saveDocuments()
    }

    if (saved) {
      setActiveTab(nextTab)
    }
  }

  return {
    createSprint,
    handleTabChange,
    hasPendingBlockDraft,
    hasPendingDocumentDraft,
    hasPendingTaskDraft,
  }
}
