'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/components/ui/use-toast'
import { deriveProjectPhase, type ProjectData, type ProjectDocument } from './project-shared'

type SaveProjectOptions = {
  file?: File | null
  fileCategory?: string
  fileLabel?: string
  onUploaded?: (stored: ProjectDocument) => void
  sections?: Array<'overview' | 'departments' | 'blocks' | 'rooms' | 'documents' | 'kickoff'>
}

type Params = {
  projectId: string
  pendingFile: File | null
  setPendingFile: (file: File | null) => void
  setProject: Dispatch<SetStateAction<ProjectData>>
}

export function useProjectPersistence({
  projectId,
  pendingFile,
  setPendingFile,
  setProject,
}: Params) {
  const buildProjectForm = useCallback(
    (
      sourceProject: ProjectData,
      sections: Array<'overview' | 'departments' | 'blocks' | 'rooms' | 'documents' | 'kickoff'> = [
        'overview',
        'departments',
        'blocks',
        'rooms',
        'documents',
        'kickoff',
      ]
    ) => {
      const include = (section: typeof sections[number]) => sections.includes(section)
      const form = new FormData()
      if (include('overview')) {
        form.set('name', sourceProject.name)
        form.set('sponsor', sourceProject.sponsor)
        form.set('owner', sourceProject.owner)
        form.set('context', sourceProject.context)
        form.set('strategy', sourceProject.strategy)
        form.set('risks', sourceProject.risks)
        form.set('startDate', sourceProject.startDate)
        form.set('launchDate', sourceProject.launchDate)
        form.set('budget', sourceProject.budget)
      }
      form.set('phase', deriveProjectPhase(sourceProject))
      form.set('status', '')
      if (include('departments')) {
        form.set('departments', JSON.stringify(sourceProject.departments))
      }
      if (include('blocks')) {
        form.set('blocks', JSON.stringify(sourceProject.blocks))
        form.set('sprints', JSON.stringify(sourceProject.sprints || []))
      }
      if (include('rooms')) {
        form.set('rooms', JSON.stringify(sourceProject.rooms))
      }
      if (include('documents')) {
        form.set('documents', JSON.stringify(sourceProject.documents || []))
      }
      if (include('kickoff')) {
        form.set('kickoff', JSON.stringify(sourceProject.kickoff))
      }
      if (pendingFile && include('documents')) {
        form.set('file', pendingFile)
        form.set('fileCategory', 'initial')
        form.set('fileLabel', 'Document inicial')
      }
      return form
    },
    [pendingFile]
  )

  const saveProject = useCallback(
    async (
      title: string,
      sourceProject: ProjectData,
      options?: SaveProjectOptions
    ) => {
      const sections = options?.sections || [
        'overview',
        'departments',
        'blocks',
        'rooms',
        'documents',
        'kickoff',
      ]
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: (() => {
          const form = buildProjectForm(sourceProject, sections)
          if (options?.file) {
            form.set('file', options.file)
            form.set('fileCategory', options.fileCategory || 'general')
            form.set('fileLabel', options.fileLabel || options.file.name)
          }
          return form
        })(),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        document?: ProjectDocument
      }
      if (!res.ok) throw new Error(payload.error || 'No s ha pogut guardar el projecte')

      if (pendingFile) {
        setProject((current) => ({
          ...current,
          document: payload.document || {
            ...(current.document || {}),
            name: pendingFile.name,
            category: 'initial',
            label: 'Document inicial',
          },
          documents: payload.document
            ? [...current.documents, payload.document]
            : current.documents,
        }))
        setPendingFile(null)
      }

      if (options?.file && payload.document) {
        options.onUploaded?.(payload.document)
      }

      toast({ title })
      return payload.document || null
    },
    [buildProjectForm, pendingFile, projectId, setPendingFile, setProject]
  )

  const syncRoomsWithOps = useCallback(
    async (sourceProject: ProjectData, roomIds?: string[]) => {
      const ids = (roomIds && roomIds.length > 0
        ? roomIds
        : (sourceProject.rooms || []).map((room) => room.id)
      ).filter(Boolean)

      if (ids.length === 0) return

      const res = await fetch(`/api/projects/${projectId}/rooms/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomIds: ids }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        syncedRooms?: Array<ProjectData['rooms'][number]>
      }
      if (!res.ok) {
        throw new Error(payload.error || 'No s han pogut sincronitzar les sales amb Ops')
      }
      const results = Array.isArray(payload.syncedRooms) ? payload.syncedRooms : []

      setProject((current) => ({
        ...current,
        rooms: current.rooms.map((room) => {
          const synced = results.find((item) => item?.id === room.id)
          return synced || room
        }),
      }))
    },
    [projectId, setProject]
  )

  return {
    saveProject,
    syncRoomsWithOps,
  }
}
