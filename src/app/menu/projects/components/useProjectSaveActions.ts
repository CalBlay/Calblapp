'use client'

import { type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/components/ui/use-toast'
import type { ProjectData } from './project-shared'
import { ensureProjectRooms } from './project-workspace-state'
import type { ResponsibleOption } from './project-workspace-helpers'

type SaveProject = (
  title: string,
  sourceProject: ProjectData,
  options?: {
    file?: File | null
    fileCategory?: string
    fileLabel?: string
    onUploaded?: (stored: ProjectData['document']) => void
    sections?: Array<'overview' | 'departments' | 'blocks' | 'rooms' | 'documents' | 'kickoff'>
  }
) => Promise<ProjectData['document'] | null>

type RemoveDocumentSource = {
  type: 'project' | 'room' | 'task'
  roomId?: string
  blockId?: string
  taskId?: string
}

type Params = {
  documentDraft: { category: string; label: string }
  pendingDocumentFile: File | null
  pendingFile: File | null
  project: ProjectData
  projectId: string
  saveProject: SaveProject
  sessionUserName: string
  setDeletingProject: Dispatch<SetStateAction<boolean>>
  setDirtyBlocksState: Dispatch<SetStateAction<boolean>>
  setDirtyOverviewState: Dispatch<SetStateAction<boolean>>
  setDocumentDraft: Dispatch<SetStateAction<{ category: string; label: string }>>
  setPendingDocumentFile: Dispatch<SetStateAction<File | null>>
  setProject: Dispatch<SetStateAction<ProjectData>>
  setSavingBlocks: Dispatch<SetStateAction<boolean>>
  setSavingOverview: Dispatch<SetStateAction<boolean>>
  syncRoomsWithOps: (sourceProject: ProjectData, roomIds?: string[]) => Promise<void>
  userByName: Map<string, ResponsibleOption>
}

export function useProjectSaveActions({
  documentDraft,
  pendingDocumentFile,
  pendingFile,
  project,
  projectId,
  saveProject,
  sessionUserName,
  setDeletingProject,
  setDirtyBlocksState,
  setDirtyOverviewState,
  setDocumentDraft,
  setPendingDocumentFile,
  setProject,
  setSavingBlocks,
  setSavingOverview,
  syncRoomsWithOps,
  userByName,
}: Params) {
  const saveOverview = async () => {
    try {
      setSavingOverview(true)
      const nextProject = ensureProjectRooms(project, userByName)
      setProject(nextProject)
      const storedDocument = await saveProject('Projecte guardat', nextProject, {
        sections: ['overview', 'departments', 'rooms', 'documents'],
      })
      const finalProject =
        storedDocument && pendingFile
          ? {
              ...nextProject,
              document: storedDocument,
              documents: [...nextProject.documents, storedDocument],
            }
          : nextProject
      await syncRoomsWithOps(finalProject)
      setDirtyOverviewState(false)
      return true
    } catch (err: unknown) {
      toast({
        title: 'Error guardant el projecte',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
      return false
    } finally {
      setSavingOverview(false)
    }
  }

  const saveBlocks = async () => {
    try {
      setSavingBlocks(true)
      const timestamp = new Date().toISOString()
      const nextProject = ensureProjectRooms({
        ...project,
        kickoff: {
          ...project.kickoff,
          minutesAuthor: String(project.kickoff.minutes || '').trim()
            ? sessionUserName
            : project.kickoff.minutesAuthor,
          minutesUpdatedAt: String(project.kickoff.minutes || '').trim()
            ? timestamp
            : project.kickoff.minutesUpdatedAt,
        },
      }, userByName)
      setProject(nextProject)
      await saveProject('Blocs guardats', nextProject, {
        sections: ['departments', 'blocks', 'rooms', 'kickoff'],
      })
      await syncRoomsWithOps(nextProject)
      setDirtyBlocksState(false)
      return true
    } catch (err: unknown) {
      toast({
        title: 'Error guardant els blocs',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
      return false
    } finally {
      setSavingBlocks(false)
    }
  }

  const saveDocuments = async () => {
    const hasFile = Boolean(pendingDocumentFile)
    if (!hasFile) return true
    const pendingFileName = pendingDocumentFile?.name || ''

    try {
      setSavingOverview(true)
      await saveProject('Document guardat', project, {
        file: pendingDocumentFile,
        fileCategory: documentDraft.category,
        fileLabel: documentDraft.label.trim() || pendingFileName,
        sections: ['documents'],
        onUploaded: (stored) => {
          if (!stored) return
          setProject((current) => ({
            ...current,
            documents: [...current.documents, stored],
          }))
        },
      })

      setPendingDocumentFile(null)
      setDocumentDraft({ category: 'general', label: '' })
      return true
    } catch (err: unknown) {
      toast({
        title: 'Error guardant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
      return false
    } finally {
      setSavingOverview(false)
    }
  }

  const removeDocument = async (documentId: string, source?: RemoveDocumentSource) => {
    let nextProject = project

    if (!source || source.type === 'project') {
      const remainingDocuments = project.documents.filter((item) => item?.id !== documentId)
      const nextPrimaryDocument =
        project.document?.id === documentId
          ? remainingDocuments.find((item) => item?.category === 'initial') || null
          : project.document

      nextProject = {
        ...project,
        documents: remainingDocuments,
        document: nextPrimaryDocument,
      }
    } else if (source.type === 'room' && source.roomId) {
      nextProject = {
        ...project,
        rooms: project.rooms.map((room) =>
          room.id === source.roomId
            ? {
                ...room,
                documents: (room.documents || []).filter((item) => item?.id !== documentId),
              }
            : room
        ),
      }
    } else if (source.type === 'task' && source.blockId && source.taskId) {
      nextProject = {
        ...project,
        blocks: project.blocks.map((block) =>
          block.id === source.blockId
            ? {
                ...block,
                tasks: block.tasks.map((task) =>
                  task.id === source.taskId
                    ? {
                        ...task,
                        documents: (task.documents || []).filter((item) => item?.id !== documentId),
                      }
                    : task
                ),
              }
            : block
        ),
      }
    }

    setProject(nextProject)

    try {
      setSavingOverview(true)
      await saveProject('Document eliminat', nextProject, {
        sections:
          !source || source.type === 'project'
            ? ['documents']
            : source.type === 'room'
              ? ['rooms']
              : ['blocks'],
      })
    } catch (err: unknown) {
      toast({
        title: 'Error eliminant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingOverview(false)
    }
  }

  const removeKickoffMinutes = async () => {
    const nextProject = {
      ...project,
      kickoff: {
        ...project.kickoff,
        minutes: '',
      },
    }

    setProject(nextProject)

    try {
      setSavingOverview(true)
      await saveProject('Acta eliminada', nextProject, {
        sections: ['kickoff'],
      })
    } catch (err: unknown) {
      toast({
        title: 'Error eliminant l acta',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingOverview(false)
    }
  }

  const handleDeleteProject = async () => {
    const confirmed = window.confirm('Vols eliminar aquest projecte? Aquesta accio no es pot desfer.')
    if (!confirmed) return

    try {
      setDeletingProject(true)
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'No s ha pogut eliminar el projecte')
      }

      toast({ title: 'Projecte eliminat' })
      window.location.href = '/menu/projects'
    } catch (err: unknown) {
      toast({
        title: 'Error eliminant el projecte',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setDeletingProject(false)
    }
  }

  return {
    handleDeleteProject,
    removeDocument,
    removeKickoffMinutes,
    saveBlocks,
    saveDocuments,
    saveOverview,
  }
}
