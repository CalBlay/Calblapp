'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/components/ui/use-toast'
import {
  clampProjectDeadline,
  deriveBlockStatus,
  formatProjectCost,
  sumTaskCosts,
  type ProjectBlock,
  type ProjectData,
  type ProjectDocument,
  type ProjectTask,
} from './project-shared'
import { createBlockDraft, createTaskDraft } from './project-workspace-helpers'

type Params = {
  project: ProjectData
  blockDraft: ReturnType<typeof createBlockDraft>
  taskDraft: ReturnType<typeof createTaskDraft>
  setProject: Dispatch<SetStateAction<ProjectData>>
  setBlockDraft: Dispatch<SetStateAction<ReturnType<typeof createBlockDraft>>>
  setTaskDraft: Dispatch<SetStateAction<ReturnType<typeof createTaskDraft>>>
  setShowBlockComposer: Dispatch<SetStateAction<boolean>>
  setShowTaskComposer: Dispatch<SetStateAction<boolean>>
  setQuickTaskBlockId: Dispatch<SetStateAction<string | null>>
  setEditingBlockId: Dispatch<SetStateAction<string | null>>
  setSavingBlocks: Dispatch<SetStateAction<boolean>>
  saveProject: (
    title: string,
    sourceProject: ProjectData,
    options?: {
      file?: File | null
      fileCategory?: string
      fileLabel?: string
      onUploaded?: (stored: ProjectDocument) => void
      sections?: Array<'overview' | 'departments' | 'blocks' | 'rooms' | 'documents' | 'kickoff'>
    }
  ) => Promise<ProjectDocument | null>
  ensureProjectRooms: (currentProject: ProjectData) => ProjectData
  onBlocksStateSaved: (project: ProjectData) => void
  onBlocksDirty: () => void
}

export function useProjectBlocksTasksActions({
  project,
  blockDraft,
  taskDraft,
  setProject,
  setBlockDraft,
  setTaskDraft,
  setShowBlockComposer,
  setShowTaskComposer,
  setQuickTaskBlockId,
  setEditingBlockId,
  setSavingBlocks,
  saveProject,
  ensureProjectRooms,
  onBlocksStateSaved,
  onBlocksDirty,
}: Params) {
  const createBlock = useCallback(() => {
    if (!blockDraft.name.trim()) return

    const primaryDepartment = blockDraft.departments[0] || ''
    const nextBlock: ProjectBlock = {
      id: `block-${Date.now()}`,
      createdAt: Date.now(),
      name: blockDraft.name.trim(),
      summary: blockDraft.summary.trim(),
      department: primaryDepartment,
      departments: [...blockDraft.departments],
      owner: '',
      deadline: clampProjectDeadline(blockDraft.deadline, project.launchDate),
      budget: blockDraft.budget.trim(),
      dependsOn: blockDraft.dependsOn === 'none' ? '' : blockDraft.dependsOn,
      status: 'pending',
      tasks: [],
    }

    setProject((current) => ({
      ...current,
      blocks: [...current.blocks, nextBlock],
    }))
    onBlocksDirty()
    setBlockDraft(createBlockDraft())
    setShowBlockComposer(false)
  }, [blockDraft, onBlocksDirty, project.launchDate, setBlockDraft, setProject, setShowBlockComposer])

  const setBlockField = useCallback(
    <K extends keyof ProjectBlock>(blockId: string, field: K, value: ProjectBlock[K]) => {
      setProject((current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                department:
                  field === 'departments'
                    ? (Array.isArray(value) && value.length > 0 ? String(value[0]) : '')
                    : field === 'department'
                      ? String(value || '')
                      : block.department,
                departments:
                  field === 'departments'
                    ? (Array.isArray(value) ? value.filter(Boolean).map(String) : [])
                    : field === 'department'
                      ? (value ? [String(value)] : [])
                      : block.departments,
              [field]:
                field === 'deadline'
                  ? clampProjectDeadline(String(value || ''), current.launchDate)
                  : value,
              }
            : block
        ),
      }))
      onBlocksDirty()
    },
    [onBlocksDirty, setProject]
  )

  const removeBlock = useCallback((blockId: string) => {
    setProject((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId),
    }))
    onBlocksDirty()
    setEditingBlockId((current) => (current === blockId ? null : current))
  }, [onBlocksDirty, setEditingBlockId, setProject])

  const setTaskDraftField = useCallback(
    <K extends keyof ReturnType<typeof createTaskDraft>>(field: K, value: ReturnType<typeof createTaskDraft>[K]) => {
      setTaskDraft((current) => ({
        ...current,
        [field]: value,
      }))
    },
    [setTaskDraft]
  )

  const addTaskToBlock = useCallback((blockId: string) => {
    const draft = taskDraft
    const title = String(draft.title || '').trim()
    const description = String(draft.description || '').trim()
    if (!title && !description) return
    const taskTitle = (title || description).slice(0, 20).trim()
    const block = project.blocks.find((item) => item.id === blockId)
    const maxTaskDeadline = block?.deadline || project.launchDate
    const blockDepartments =
      block?.departments && block.departments.length > 0
        ? block.departments
        : block?.department
          ? [block.department]
          : []
    const fallbackDepartment =
      String(draft.department || '').trim() || (blockDepartments.length === 1 ? blockDepartments[0] : '')

    const nextTask: ProjectTask = {
      id: `task-${Date.now()}`,
      createdAt: Date.now(),
      title: taskTitle || 'Tasca',
      description,
      department: fallbackDepartment,
      owner: draft.owner,
      deadline: clampProjectDeadline(draft.deadline, maxTaskDeadline),
      dependsOn: '',
      cost: draft.cost || '',
      priority: draft.priority || 'normal',
      status: 'pending',
      documents: [],
    }

    setProject((current) => ({
      ...current,
      blocks: current.blocks.map((blockItem) =>
        blockItem.id === blockId
          ? (() => {
              const nextTasks = [...blockItem.tasks, nextTask]
              return {
                ...blockItem,
                budget: formatProjectCost(sumTaskCosts(nextTasks)),
                tasks: nextTasks,
                status: deriveBlockStatus({ ...blockItem, tasks: nextTasks }),
              }
            })()
          : blockItem
      ),
    }))
    onBlocksDirty()
    setTaskDraft(createTaskDraft())
    setShowTaskComposer(false)
    setQuickTaskBlockId(null)
  }, [onBlocksDirty, project.blocks, project.launchDate, setProject, setQuickTaskBlockId, setShowTaskComposer, setTaskDraft, taskDraft])

  const setTaskField = useCallback(
    <K extends keyof ProjectTask>(blockId: string, taskId: string, field: K, value: ProjectTask[K]) => {
      setProject((current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? (() => {
                const nextTasks = block.tasks.map((task) =>
                  task.id === taskId
                    ? {
                        ...task,
                        [field]:
                          field === 'deadline'
                            ? clampProjectDeadline(String(value || ''), block.deadline || current.launchDate)
                            : value,
                      }
                    : task
                )
                return {
                  ...block,
                  budget: formatProjectCost(sumTaskCosts(nextTasks)),
                  tasks: nextTasks,
                  status: deriveBlockStatus({ ...block, tasks: nextTasks }),
                }
              })()
            : block
        ),
      }))
      onBlocksDirty()
    },
    [onBlocksDirty, setProject]
  )

  const removeTask = useCallback((blockId: string, taskId: string) => {
    setProject((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId
          ? (() => {
              const nextTasks = block.tasks.filter((task) => task.id !== taskId)
              return {
                ...block,
                budget: formatProjectCost(sumTaskCosts(nextTasks)),
                tasks: nextTasks,
                status: deriveBlockStatus({ ...block, tasks: nextTasks }),
              }
            })()
          : block
      ),
    }))
    onBlocksDirty()
  }, [onBlocksDirty, setProject])

  const attachTaskDocument = useCallback(async (blockId: string, taskId: string, file: File) => {
    try {
      setSavingBlocks(true)
      let storedDocument: ProjectDocument | null = null

      await saveProject('Arxiu pujat', project, {
        file,
        fileCategory: 'other',
        fileLabel: file.name,
        sections: ['documents'],
        onUploaded: (stored) => {
          storedDocument = stored
        },
      })

      if (!storedDocument) throw new Error('No s ha pogut guardar el document')

      const nextProject = ensureProjectRooms({
        ...project,
        blocks: project.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                tasks: block.tasks.map((task) =>
                  task.id === taskId
                    ? {
                        ...task,
                        documents: [...(task.documents || []), storedDocument as Exclude<ProjectDocument, null>],
                      }
                    : task
                ),
              }
            : block
        ),
      })

      setProject(nextProject)
      await saveProject('Document adjuntat a la tasca', nextProject, {
        sections: ['blocks'],
      })
      onBlocksStateSaved(nextProject)
    } catch (err: unknown) {
      toast({
        title: 'Error adjuntant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingBlocks(false)
    }
  }, [ensureProjectRooms, onBlocksStateSaved, project, saveProject, setProject, setSavingBlocks])

  const removeTaskDocument = useCallback(async (blockId: string, taskId: string, documentId: string) => {
    try {
      setSavingBlocks(true)
      const nextProject = ensureProjectRooms({
        ...project,
        blocks: project.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                tasks: block.tasks.map((task) =>
                  task.id === taskId
                    ? {
                        ...task,
                        documents: (task.documents || []).filter((item) => item?.id !== documentId),
                      }
                    : task
                ),
              }
            : block
        ),
      })

      setProject(nextProject)
      await saveProject('Document eliminat de la tasca', nextProject, {
        sections: ['blocks'],
      })
      onBlocksStateSaved(nextProject)
    } catch (err: unknown) {
      toast({
        title: 'Error eliminant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingBlocks(false)
    }
  }, [ensureProjectRooms, onBlocksStateSaved, project, saveProject, setProject, setSavingBlocks])

  const resetTaskDraft = useCallback(() => {
    setTaskDraft(createTaskDraft())
    setShowTaskComposer(false)
    setQuickTaskBlockId(null)
  }, [setQuickTaskBlockId, setShowTaskComposer, setTaskDraft])

  const openQuickTaskComposer = useCallback((blockId: string) => {
    const block = project.blocks.find((item) => item.id === blockId)
    const blockDepartments = block?.departments && block.departments.length > 0
      ? block.departments
      : block?.department
        ? [block.department]
        : []
    setTaskDraft((current) => ({
      ...createTaskDraft(),
      blockId,
      department:
        blockDepartments.length === 1
          ? blockDepartments[0]
          : current.blockId === blockId
            ? current.department
            : '',
      owner: current.blockId === blockId ? current.owner : '',
    }))
    setQuickTaskBlockId(blockId)
  }, [project.blocks, setQuickTaskBlockId, setTaskDraft])

  const resetBlockDraft = useCallback(() => {
    setBlockDraft(createBlockDraft())
    setShowBlockComposer(false)
  }, [setBlockDraft, setShowBlockComposer])

  const addDepartmentToBlock = useCallback((blockId: string, department: string) => {
    setProject((current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId) return block
        const departments = block.departments && block.departments.length > 0
          ? block.departments
          : block.department
            ? [block.department]
            : []
        if (departments.includes(department)) return block
        const nextDepartments = [...departments, department]
        return {
          ...block,
          department: nextDepartments[0] || '',
          departments: nextDepartments,
        }
      }),
    }))
    onBlocksDirty()
  }, [onBlocksDirty, setProject])

  const removeDepartmentFromBlock = useCallback((blockId: string, department: string) => {
    setProject((current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId) return block
        const baseDepartments = block.departments && block.departments.length > 0
          ? block.departments
          : block.department
            ? [block.department]
            : []
        const nextDepartments = baseDepartments.filter((item) => item !== department)
        return {
          ...block,
          department: nextDepartments[0] || '',
          departments: nextDepartments,
        }
      }),
    }))
    onBlocksDirty()
  }, [onBlocksDirty, setProject])

  return {
    createBlock,
    setBlockField,
    removeBlock,
    setTaskDraftField,
    addTaskToBlock,
    setTaskField,
    removeTask,
    attachTaskDocument,
    removeTaskDocument,
    resetTaskDraft,
    openQuickTaskComposer,
    resetBlockDraft,
    addDepartmentToBlock,
    removeDepartmentFromBlock,
  }
}
