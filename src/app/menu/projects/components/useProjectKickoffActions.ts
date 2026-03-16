'use client'

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { toast } from '@/components/ui/use-toast'
import { deriveProjectPhase, type ProjectData } from './project-shared'

async function readKickoffResponse(res: Response) {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return (await res.json().catch(() => null)) as {
      error?: string
      kickoff?: ProjectData['kickoff']
      warning?: string
    } | null
  }

  const text = await res.text().catch(() => '')
  return {
    error: text.trim() || `HTTP ${res.status}`,
  }
}

type Params = {
  projectId: string
  project: ProjectData
  setProject: Dispatch<SetStateAction<ProjectData>>
  manualKickoffEmail: string
  setManualKickoffEmail: Dispatch<SetStateAction<string>>
  setSendingKickoff: Dispatch<SetStateAction<boolean>>
  setSavingBlocks: Dispatch<SetStateAction<boolean>>
  saveProject: (
    title: string,
    sourceProject: ProjectData,
    options?: {
      sections?: Array<'overview' | 'departments' | 'blocks' | 'rooms' | 'documents' | 'kickoff'>
    }
  ) => Promise<unknown>
  ensureProjectRooms: (currentProject: ProjectData) => ProjectData
  sessionUserName?: string
  onKickoffMinutesSaved?: (project: ProjectData) => void
  onBlocksDirty?: () => void
}

export function useProjectKickoffActions({
  projectId,
  project,
  setProject,
  manualKickoffEmail,
  setManualKickoffEmail,
  setSendingKickoff,
  setSavingBlocks,
  saveProject,
  ensureProjectRooms,
  sessionUserName,
  onKickoffMinutesSaved,
  onBlocksDirty,
}: Params) {
  const setKickoffField = useCallback(
    <K extends keyof ProjectData['kickoff']>(field: K, value: ProjectData['kickoff'][K]) => {
      setProject((current) => ({
        ...current,
        kickoff: {
          ...current.kickoff,
          [field]: value,
        },
      }))
    },
    [setProject]
  )

  const removeKickoffAttendee = useCallback((key: string) => {
    setProject((current) => {
      const isManualAttendee = key.startsWith('manual:')
      return {
        ...current,
        kickoff: {
          ...current.kickoff,
          excludedKeys: isManualAttendee
            ? current.kickoff.excludedKeys.filter((item) => item !== key)
            : Array.from(new Set([...current.kickoff.excludedKeys, key])),
          attendees: current.kickoff.attendees.filter((item) => item.key !== key),
        },
      }
    })
    onBlocksDirty?.()
  }, [onBlocksDirty, setProject])

  const setKickoffAttendeeAttendance = useCallback((key: string, attended: boolean) => {
    setProject((current) => ({
      ...current,
      kickoff: {
        ...current.kickoff,
        attendees: current.kickoff.attendees.map((item) =>
          item.key === key ? { ...item, attended } : item
        ),
      },
    }))
    onBlocksDirty?.()
  }, [onBlocksDirty, setProject])

  const addManualKickoffEmail = useCallback(() => {
    const email = manualKickoffEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) return
    const key = `manual:${email}`

    setProject((current) => {
      if (current.kickoff.attendees.some((item) => item.key === key)) return current
      return {
        ...current,
        kickoff: {
          ...current.kickoff,
          attendees: [
            ...current.kickoff.attendees,
            {
              key,
              department: 'Manual',
              userId: '',
              name: email,
              email,
            },
          ],
        },
      }
    })
    setManualKickoffEmail('')
  }, [manualKickoffEmail, setManualKickoffEmail, setProject])

  const kickoffReady = useMemo(
    () =>
      Boolean(project.kickoff.date) &&
      Boolean(project.kickoff.startTime) &&
      Number(project.kickoff.durationMinutes) > 0 &&
      project.kickoff.attendees.some((item) => item.email.includes('@')),
    [project.kickoff.attendees, project.kickoff.date, project.kickoff.durationMinutes, project.kickoff.startTime]
  )

  const sendKickoff = useCallback(async () => {
    try {
      setSendingKickoff(true)
      const res = await fetch(`/api/projects/${projectId}/kickoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: project.kickoff.date,
          startTime: project.kickoff.startTime,
          durationMinutes: project.kickoff.durationMinutes,
          notes: project.kickoff.notes,
          excludedKeys: project.kickoff.excludedKeys,
          attendees: project.kickoff.attendees,
        }),
      })

      const payload = await readKickoffResponse(res)
      if (!res.ok || !payload.kickoff) {
        throw new Error(payload?.error || `No s'ha pogut crear la convocatòria (${res.status})`)
      }

      setProject((current) => ({
        ...current,
        phase: deriveProjectPhase({
          ...current,
          kickoff: {
            ...current.kickoff,
            ...payload.kickoff,
          },
        }),
        status: '',
        kickoff: {
          ...current.kickoff,
          ...payload.kickoff,
        },
      }))

      toast({
        title: payload.warning ? 'Convocatòria creada amb avis' : 'Convocatòria enviada',
        description: payload.warning || undefined,
        variant: payload.warning ? 'destructive' : 'default',
      })
    } catch (err: unknown) {
      toast({
        title: 'Error enviant la convocatòria',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSendingKickoff(false)
    }
  }, [project.kickoff.attendees, project.kickoff.date, project.kickoff.durationMinutes, project.kickoff.excludedKeys, project.kickoff.notes, project.kickoff.startTime, projectId, setProject, setSendingKickoff])

  const reopenKickoff = useCallback(async () => {
    try {
      setSavingBlocks(true)
      const nextProject = ensureProjectRooms({
        ...project,
        phase: deriveProjectPhase({
          ...project,
          kickoff: {
            ...project.kickoff,
            status: '',
            graphWebLink: '',
            emailNotificationStatus: undefined,
            emailNotificationError: '',
          },
        }),
        kickoff: {
          ...project.kickoff,
          status: '',
          graphWebLink: '',
          emailNotificationStatus: undefined,
          emailNotificationError: '',
        },
      })
      setProject(nextProject)
      await saveProject('Convocatoria reoberta', nextProject, {
        sections: ['kickoff'],
      })
    } catch (err: unknown) {
      toast({
        title: 'Error reobrint la convocatòria',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingBlocks(false)
    }
  }, [ensureProjectRooms, project, saveProject, setProject, setSavingBlocks])

  const finalizeKickoffMinutes = useCallback(async () => {
    try {
      setSavingBlocks(true)
      const timestamp = new Date().toISOString()
      const nextProject = ensureProjectRooms({
        ...project,
        kickoff: {
          ...project.kickoff,
          minutesStatus: 'closed',
          minutesAuthor: String(sessionUserName || '').trim(),
          minutesClosedAt: project.kickoff.minutesClosedAt || timestamp,
          minutesUpdatedAt: timestamp,
        },
      })
      setProject(nextProject)
      await saveProject('Acta finalitzada', nextProject, {
        sections: ['kickoff'],
      })
      onKickoffMinutesSaved?.(nextProject)
    } catch (err: unknown) {
      toast({
        title: 'Error finalitzant l acta',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingBlocks(false)
    }
  }, [ensureProjectRooms, onKickoffMinutesSaved, project, saveProject, sessionUserName, setProject, setSavingBlocks])

  const reopenKickoffMinutes = useCallback(async () => {
    try {
      setSavingBlocks(true)
      const timestamp = new Date().toISOString()
      const nextProject = ensureProjectRooms({
        ...project,
        kickoff: {
          ...project.kickoff,
          minutesStatus: 'open',
          minutesUpdatedAt: timestamp,
        },
      })
      setProject(nextProject)
      await saveProject('Acta reoberta', nextProject, {
        sections: ['kickoff'],
      })
      onKickoffMinutesSaved?.(nextProject)
    } catch (err: unknown) {
      toast({
        title: 'Error reobrint l acta',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingBlocks(false)
    }
  }, [ensureProjectRooms, onKickoffMinutesSaved, project, saveProject, setProject, setSavingBlocks])

  return {
    setKickoffField,
    removeKickoffAttendee,
    setKickoffAttendeeAttendance,
    addManualKickoffEmail,
    kickoffReady,
    sendKickoff,
    reopenKickoff,
    finalizeKickoffMinutes,
    reopenKickoffMinutes,
  }
}
