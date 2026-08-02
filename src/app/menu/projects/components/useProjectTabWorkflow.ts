'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { ProjectData } from './project-shared'
import type {
  createBlockDraft,
  createTaskDraft,
  WorkspaceTab,
} from './project-workspace-helpers'

type BlockDraft = ReturnType<typeof createBlockDraft>
type TaskDraft = ReturnType<typeof createTaskDraft>

export type UnsavedTabPrompt = {
  fromTab: WorkspaceTab
  toTab: WorkspaceTab
}

type Params = {
  activeTab: WorkspaceTab
  addTaskToBlock: (blockId: string) => void
  applyTabChange: (tab: WorkspaceTab) => void
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
  setProject: Dispatch<SetStateAction<ProjectData>>
  showBlockComposer: boolean
  showTaskComposer: boolean
  taskDraft: TaskDraft
  canCreateSprints?: boolean
}

export function useProjectTabWorkflow({
  activeTab,
  addTaskToBlock,
  applyTabChange,
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
  setProject,
  showBlockComposer,
  showTaskComposer,
  taskDraft,
  canCreateSprints = false,
}: Params) {
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedTabPrompt | null>(null)
  const [resolvingUnsaved, setResolvingUnsaved] = useState(false)

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
      String(taskDraft.blockId || '').trim() &&
        String(taskDraft.blockId || '').trim() !== 'none' &&
        (String(taskDraft.title || '').trim() ||
          String(taskDraft.description || '').trim() ||
          String(taskDraft.department || '').trim() ||
          String(taskDraft.owner || '').trim() ||
          String(taskDraft.deadline || '').trim() ||
          String(taskDraft.sprintId || '').trim())
    )

  const hasPendingDocumentDraft =
    Boolean(pendingDocumentFile) || Boolean(String(documentDraft.label || '').trim())

  const createSprint = (name: string) => {
    if (!canCreateSprints) return
    const nextName = String(name || '').trim()
    if (!nextName) return
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

  const saveActiveTab = useCallback(
    async (tab: WorkspaceTab) => {
      if (tab === 'overview') {
        return saveOverview()
      }
      if (tab === 'blocks') {
        if (hasPendingBlockDraft) createBlock()
        if (hasPendingTaskDraft && quickTaskBlockId) addTaskToBlock(quickTaskBlockId)
        return saveBlocks()
      }
      if (tab === 'tasks') {
        if (hasPendingTaskDraft && taskDraft.blockId && taskDraft.blockId !== 'none') {
          addTaskToBlock(taskDraft.blockId)
        }
        return saveBlocks()
      }
      if (tab === 'documents') {
        return saveDocuments()
      }
      return true
    },
    [
      addTaskToBlock,
      createBlock,
      hasPendingBlockDraft,
      hasPendingTaskDraft,
      quickTaskBlockId,
      saveBlocks,
      saveDocuments,
      saveOverview,
      taskDraft.blockId,
    ]
  )

  const handleTabChange = (nextTab: WorkspaceTab) => {
    if (nextTab === activeTab) return
    if (!shouldWarnBeforeLeavingTab(activeTab)) {
      applyTabChange(nextTab)
      return
    }
    setUnsavedPrompt({ fromTab: activeTab, toTab: nextTab })
  }

  const cancelUnsavedPrompt = () => {
    if (resolvingUnsaved) return
    setUnsavedPrompt(null)
  }

  const discardUnsavedPrompt = () => {
    if (!unsavedPrompt || resolvingUnsaved) return
    applyTabChange(unsavedPrompt.toTab)
    setUnsavedPrompt(null)
  }

  const saveUnsavedPrompt = async () => {
    if (!unsavedPrompt || resolvingUnsaved) return
    setResolvingUnsaved(true)
    try {
      const saved = await saveActiveTab(unsavedPrompt.fromTab)
      if (saved) {
        applyTabChange(unsavedPrompt.toTab)
        setUnsavedPrompt(null)
      }
    } finally {
      setResolvingUnsaved(false)
    }
  }

  return {
    createSprint,
    handleTabChange,
    hasPendingBlockDraft,
    hasPendingDocumentDraft,
    hasPendingTaskDraft,
    unsavedPrompt,
    resolvingUnsaved,
    cancelUnsavedPrompt,
    discardUnsavedPrompt,
    saveUnsavedPrompt,
  }
}
