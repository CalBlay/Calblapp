'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/components/ui/use-toast'
import {
  getBlockDepartments,
  type ProjectData,
  type ProjectMeetingAttendee,
} from './project-shared'
import type { ResponsibleOption } from './project-workspace-helpers'

export type ProjectMeetingTarget = {
  scope: 'block' | 'task'
  blockId: string
  taskId?: string
  title: string
  subtitle?: string
  options: ResponsibleOption[]
  defaultSelectedKeys: string[]
}

type Params = {
  projectId: string
  project: ProjectData
  setProject: Dispatch<SetStateAction<ProjectData>>
  userByName: Map<string, ResponsibleOption>
  departmentResponsibleOptions: (department?: string | string[]) => ResponsibleOption[]
  taskResponsibleOptions: (department?: string, blockId?: string) => ResponsibleOption[]
  onMeetingCreated?: (payload: {
    scope: 'block' | 'task'
    blockId: string
    taskId?: string
  }) => void
}

const mergeResponsibleOptions = (items: ResponsibleOption[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const email = String(item.email || '').trim().toLowerCase()
    const name = String(item.name || '').trim().toLowerCase()
    const key = item.id ? `id:${item.id}` : email ? `email:${email}` : `name:${name}`
    if (!email || !name || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function useProjectMeetings({
  projectId,
  project,
  setProject,
  userByName,
  departmentResponsibleOptions,
  taskResponsibleOptions,
  onMeetingCreated,
}: Params) {
  const [sendingMeeting, setSendingMeeting] = useState(false)
  const [meetingTarget, setMeetingTarget] = useState<ProjectMeetingTarget | null>(null)

  const getBlockMeetingTarget = (blockId: string) => {
    const block = project.blocks.find((item) => item.id === blockId)
    if (!block) return null

    const room = project.rooms.find((item) => item.kind === 'block' && item.blockId === block.id)
    const departmentCaps = departmentResponsibleOptions(getBlockDepartments(block))
    const participantUsers = (room?.participants || [])
      .map((name) => userByName.get(name))
      .filter((item): item is ResponsibleOption => Boolean(item?.email))
    const options = mergeResponsibleOptions([...departmentCaps, ...participantUsers])
    const defaultNames = new Set<string>(
      [project.owner, block.owner, ...block.tasks.map((task) => task.owner)]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )

    return {
      scope: 'block' as const,
      blockId: block.id,
      title: block.name || 'Bloc',
      subtitle: project.name || 'Projecte',
      options,
      defaultSelectedKeys: options
        .filter((option) => defaultNames.has(option.name))
        .map((option) => `user:${option.id}`),
    }
  }

  const getTaskMeetingTarget = (blockId: string, taskId: string) => {
    const block = project.blocks.find((item) => item.id === blockId)
    const task = block?.tasks.find((item) => item.id === taskId)
    if (!block || !task) return null

    const room = project.rooms.find((item) => item.kind === 'block' && item.blockId === block.id)
    const participantUsers = (room?.participants || [])
      .map((name) => userByName.get(name))
      .filter((item): item is ResponsibleOption => Boolean(item?.email))
    const taskCandidates = taskResponsibleOptions(task.department, block.id)
    const options = mergeResponsibleOptions([...taskCandidates, ...participantUsers])
    const defaultNames = new Set<string>(
      [project.owner, block.owner, task.owner]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )

    return {
      scope: 'task' as const,
      blockId: block.id,
      taskId: task.id,
      title: task.title || 'Tasca',
      subtitle: block.name || project.name || 'Projecte',
      options,
      defaultSelectedKeys: options
        .filter((option) => defaultNames.has(option.name))
        .map((option) => `user:${option.id}`),
    }
  }

  const openBlockMeeting = (blockId: string) => {
    const nextTarget = getBlockMeetingTarget(blockId)
    if (nextTarget) setMeetingTarget(nextTarget)
  }

  const openTaskMeeting = (blockId: string, taskId: string) => {
    const nextTarget = getTaskMeetingTarget(blockId, taskId)
    if (nextTarget) setMeetingTarget(nextTarget)
  }

  const sendProjectMeeting = async (payload: {
    scope: 'block' | 'task'
    blockId: string
    taskId?: string
    date: string
    startTime: string
    durationMinutes: number
    notes: string
    attendees: ProjectMeetingAttendee[]
    attachments?: File[]
  }): Promise<boolean> => {
    try {
      setSendingMeeting(true)
      const form = new FormData()
      form.set('scope', payload.scope)
      form.set('blockId', payload.blockId)
      if (payload.taskId) form.set('taskId', payload.taskId)
      form.set('date', payload.date)
      form.set('startTime', payload.startTime)
      form.set('durationMinutes', String(payload.durationMinutes))
      form.set('notes', payload.notes)
      form.set('attendees', JSON.stringify(payload.attendees))
      ;(payload.attachments || []).forEach((file) => {
        form.append('attachments', file)
      })

      const res = await fetch(`/api/projects/${projectId}/meetings`, {
        method: 'POST',
        body: form,
      })
      const response = (await res.json().catch(() => ({}))) as {
        error?: string
        warning?: string
        blocks?: ProjectData['blocks']
        meeting?: { scope?: 'block' | 'task' }
      }
      if (!res.ok) {
        throw new Error(response.error || 'No s ha pogut enviar la convocatoria')
      }

      if (Array.isArray(response.blocks)) {
        setProject((current) => ({
          ...current,
          blocks: response.blocks || current.blocks,
        }))
      }

      setMeetingTarget(null)
      onMeetingCreated?.({
        scope: payload.scope,
        blockId: payload.blockId,
        taskId: payload.taskId,
      })
      toast({
        title: response.warning ? 'Convocatòria creada amb avis' : 'Convocatòria enviada',
        description: response.warning || undefined,
        variant: response.warning ? 'destructive' : 'default',
      })
      return true
    } catch (err: unknown) {
      toast({
        title: 'Error enviant la convocatòria',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
      return false
    } finally {
      setSendingMeeting(false)
    }
  }

  return {
    meetingTarget,
    openBlockMeeting,
    openTaskMeeting,
    sendingMeeting,
    sendProjectMeeting,
    setMeetingTarget,
  }
}
