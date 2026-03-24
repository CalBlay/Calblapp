'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { toast } from '@/components/ui/use-toast'
import { normalizeRole } from '@/lib/roles'
import { DEPARTMENTS } from '@/data/departments'
import { deriveProjectPhase, getBlockDepartments, getPreLaunchDeadline, type ProjectData } from './project-shared'
import ProjectOverviewTab from './ProjectOverviewTab'
import ProjectWorkspaceShell from './ProjectWorkspaceShell'
import {
  deriveKickoffAttendees,
  ensureProjectRooms,
  sameStringSet,
  serializeRoomsState,
  syncBlockBudgets,
} from './project-workspace-state'
import { useProjectBlocksTasksActions } from './useProjectBlocksTasksActions'
import { useProjectKickoffActions } from './useProjectKickoffActions'
import { useProjectPersistence } from './useProjectPersistence'
import {
  createBlockDraft,
  createTaskDraft,
  normalizeDepartment,
  type ResponsibleOption,
  type WorkspaceTab,
  workspaceTabs,
} from './project-workspace-helpers'

type Props = {
  projectId: string
  initialProject: ProjectData
  initialTab?: WorkspaceTab
}

const tabLoadingFallback = () => (
  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
    Carregant pestanya...
  </div>
)

const ProjectBlocksTab = dynamic(() => import('./ProjectBlocksTab'), {
  loading: tabLoadingFallback,
})

const ProjectTasksTab = dynamic(() => import('./ProjectTasksTab'), {
  loading: tabLoadingFallback,
})

const ProjectPlanningTab = dynamic(() => import('./ProjectPlanningTab'), {
  loading: tabLoadingFallback,
})

const ProjectDocumentsTab = dynamic(() => import('./ProjectDocumentsTab'), {
  loading: tabLoadingFallback,
})

const ProjectTrackingTab = dynamic(() => import('./ProjectTrackingTab'), {
  loading: tabLoadingFallback,
})

export default function ProjectWorkspace({ projectId, initialProject, initialTab = 'overview' }: Props) {
  const { data: session, status: sessionStatus } = useSession()
  const sessionUserId = String(session?.user?.id || '').trim()
  const sessionUserName = String(session?.user?.name || '').trim()
  const sessionRole = normalizeRole(String(session?.user?.role || '').trim())
  const sessionDepartment = normalizeDepartment(String(session?.user?.department || '').trim())
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab)
  const [project, setProject] = useState<ProjectData>(initialProject)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingDocumentFile, setPendingDocumentFile] = useState<File | null>(null)
  const [documentDraft, setDocumentDraft] = useState({ category: 'general', label: '' })
  const [usersCatalog, setUsersCatalog] = useState<ResponsibleOption[]>([])
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([])
  const [savingOverview, setSavingOverview] = useState(false)
  const [savingBlocks, setSavingBlocks] = useState(false)
  const [sendingKickoff, setSendingKickoff] = useState(false)
  const [manualKickoffEmail, setManualKickoffEmail] = useState('')
  const [blockDraft, setBlockDraft] = useState(createBlockDraft())
  const [taskDraft, setTaskDraft] = useState(createTaskDraft())
  const [showBlockComposer, setShowBlockComposer] = useState(false)
  const [showTaskComposer, setShowTaskComposer] = useState(false)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null)
  const [quickTaskBlockId, setQuickTaskBlockId] = useState<string | null>(null)
  const [dirtyOverviewState, setDirtyOverviewState] = useState(false)
  const [dirtyBlocksState, setDirtyBlocksState] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
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

  useEffect(() => {
    setProject(initialProject)
    setDirtyOverviewState(false)
    setDirtyBlocksState(false)
  }, [initialProject])

  useEffect(() => {
    if (sessionStatus === 'loading') return

    if (activeTab === 'overview' && !canViewOverview) {
      setActiveTab('blocks')
      return
    }

    if (activeTab === 'rooms') {
      setActiveTab('blocks')
    }
  }, [activeTab, canViewOverview, sessionStatus])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/users?view=project-options', { cache: 'no-store' })
        if (!res.ok) throw new Error('No s han pogut carregar els usuaris')
        const users = (await res.json()) as Array<{
          id: string
          name?: string
          role?: string
          email?: string
          department?: string
        }>

        const catalog = users
          .map((user) => ({
            id: user.id,
            name: String(user.name || '').trim(),
            role: normalizeRole(user.role || ''),
            email: String(user.email || '').trim(),
            department: String(user.department || '').trim(),
          }))
          .filter((user) => user.name)
          .sort((a, b) => a.name.localeCompare(b.name))

        const next = catalog.filter((user) => {
          return user.role === 'admin' || user.role === 'direccio' || user.role === 'cap'
        })

        if (!cancelled) {
          setUsersCatalog(catalog)
          setResponsibles(next)
        }
      } catch {
        if (!cancelled) {
          setUsersCatalog([])
          setResponsibles([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const ownerOptions = useMemo(() => {
    if (project.owner && !responsibles.some((item) => item.name === project.owner)) {
      return [
        { id: 'current', name: project.owner, role: 'current', email: '', department: '' },
        ...responsibles,
      ]
    }
    return responsibles
  }, [project.owner, responsibles])
  const maxDeadline = useMemo(() => getPreLaunchDeadline(project.launchDate), [project.launchDate])
  const userByName = useMemo(
    () => new Map(usersCatalog.map((user) => [user.name, user])),
    [usersCatalog]
  )
  const availableDepartments = useMemo(
    () =>
      DEPARTMENTS.filter((department) => {
        const normalized = normalizeDepartment(department)
        return normalized !== 'delsys' && normalized !== 'total'
      }),
    []
  )
  const withProjectOwnerOption = (options: ResponsibleOption[]) => {
    const ownerName = String(project.owner || '').trim()
    if (!ownerName) return options
    if (options.some((item) => item.name === ownerName)) return options

    const ownerUser = userByName.get(ownerName)
    return [
      {
        id: ownerUser?.id || 'project-owner',
        name: ownerName,
        role: ownerUser?.role || 'current',
        email: ownerUser?.email || '',
        department: ownerUser?.department || '',
      },
      ...options,
    ]
  }
  const kickoffAttendeeOptions = useMemo(
    () =>
      usersCatalog.filter(
        (user) =>
          Boolean(user.email) &&
          !project.kickoff.attendees.some((item) => item.key === `user:${user.id}`)
      ),
    [usersCatalog, project.kickoff.attendees]
  )
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
  const dirtyOverview = dirtyOverviewState || Boolean(pendingFile)
  const dirtyBlocks = dirtyBlocksState
  const { saveProject, syncRoomsWithOps } = useProjectPersistence({
    projectId,
    pendingFile,
    setPendingFile,
    setProject,
  })
  const {
    setKickoffField,
    removeKickoffAttendee,
    setKickoffAttendeeAttendance,
    addManualKickoffEmail,
    kickoffReady,
    sendKickoff,
    reopenKickoff,
    finalizeKickoffMinutes,
    reopenKickoffMinutes,
  } = useProjectKickoffActions({
    projectId,
    project,
    setProject,
    manualKickoffEmail,
    setManualKickoffEmail,
    setSendingKickoff,
    setSavingBlocks,
    saveProject,
    ensureProjectRooms: (currentProject) => ensureProjectRooms(currentProject, userByName),
    sessionUserName: String(session?.user?.name || ''),
    onKickoffMinutesSaved: (nextProject) => {
      setProject(nextProject)
      setDirtyBlocksState(false)
    },
    onBlocksDirty: () => setDirtyBlocksState(true),
  })
  const {
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
  } = useProjectBlocksTasksActions({
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
    ensureProjectRooms: (currentProject) => ensureProjectRooms(currentProject, userByName),
    onBlocksStateSaved: (nextProject) => {
      setProject(nextProject)
      setDirtyBlocksState(false)
    },
    onBlocksDirty: () => setDirtyBlocksState(true),
  })

  const departmentResponsibleOptions = (department?: string | string[]) => {
    const departments = Array.isArray(department) ? department : [department || '']
    const normalizedDepartments = departments
      .map((item) => normalizeDepartment(item || ''))
      .filter(Boolean)

    if (normalizedDepartments.length === 0) return withProjectOwnerOption(ownerOptions)

    const filtered = responsibles.filter(
      (user) =>
        user.role === 'cap' &&
        normalizedDepartments.includes(normalizeDepartment(user.department || ''))
    )

    return withProjectOwnerOption(filtered.length > 0 ? filtered : ownerOptions)
  }

  const taskResponsibleOptions = (department?: string, blockId?: string) => {
    const normalized = normalizeDepartment(department || '')
    const blockOwnerName = String(
      project.blocks.find((block) => block.id === blockId)?.owner || ''
    ).trim()

    const filtered = normalized
      ? usersCatalog.filter(
          (user) =>
            normalizeDepartment(user.department || '') === normalized &&
            (
              user.role === 'usuari' ||
              user.role === 'treballador' ||
              user.role === 'cap' ||
              user.role === 'comercial'
            )
        )
      : []

    const withBlockOwner = (() => {
      if (!blockOwnerName) return filtered
      if (filtered.some((item) => item.name === blockOwnerName)) return filtered
      const blockOwnerUser = userByName.get(blockOwnerName)
      return [
        {
          id: blockOwnerUser?.id || `block-owner:${blockId || 'current'}`,
          name: blockOwnerName,
          role: blockOwnerUser?.role || 'current',
          email: blockOwnerUser?.email || '',
          department: blockOwnerUser?.department || '',
        },
        ...filtered,
      ]
    })()

    return withProjectOwnerOption(withBlockOwner)
  }

  useEffect(() => {
    setProject((current) => {
      const nextDepartments = [
        ...new Set(current.blocks.flatMap((block) => getBlockDepartments(block)).filter(Boolean)),
      ]

      let nextProject =
        sameStringSet(current.departments, nextDepartments)
          ? current
          : {
              ...current,
              departments: nextDepartments,
            }

      const roomsCandidate = ensureProjectRooms(nextProject, userByName)
      if (serializeRoomsState(roomsCandidate.rooms) !== serializeRoomsState(nextProject.rooms)) {
        nextProject = roomsCandidate
      }

      const kickoffAttendees = deriveKickoffAttendees(nextProject, usersCatalog, userByName)
      const sameKickoffAttendees =
        kickoffAttendees.length === nextProject.kickoff.attendees.length &&
        kickoffAttendees.every((item, index) => {
          const currentItem = nextProject.kickoff.attendees[index]
          return (
            currentItem?.key === item.key &&
            currentItem?.userId === item.userId &&
            currentItem?.email === item.email &&
            currentItem?.name === item.name &&
            currentItem?.attended === item.attended &&
            currentItem?.department === item.department
          )
        })

      if (!sameKickoffAttendees) {
        nextProject = {
          ...nextProject,
          kickoff: {
            ...nextProject.kickoff,
            attendees: kickoffAttendees,
          },
        }
      }

      const budgetCandidate = syncBlockBudgets(nextProject)
      const sameBudgets =
        budgetCandidate.blocks.length === nextProject.blocks.length &&
        budgetCandidate.blocks.every((block, index) => block.budget === nextProject.blocks[index]?.budget)

      if (!sameBudgets) {
        nextProject = budgetCandidate
      }

      const nextPhase = deriveProjectPhase(nextProject)
      if (nextProject.phase !== nextPhase || (nextProject.status && nextProject.status !== 'draft')) {
        nextProject = {
          ...nextProject,
          phase: nextPhase,
          status: nextProject.status === 'draft' ? 'draft' : '',
        }
      }

      return nextProject === current ? current : nextProject
    })
  }, [
    project.blocks,
    project.owner,
    project.sponsor,
    project.kickoff.date,
    project.kickoff.startTime,
    project.kickoff.status,
    project.kickoff.attendees.length,
    usersCatalog,
    userByName,
  ])

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
            ? String(session?.user?.name || '').trim()
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

  const removeDocument = async (
    documentId: string,
    source?: { type: 'project' | 'room' | 'task'; roomId?: string; blockId?: string; taskId?: string }
  ) => {
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
        String(taskDraft.deadline || '').trim()
      )
    )

  const hasPendingDocumentDraft =
    Boolean(pendingDocumentFile) || Boolean(String(documentDraft.label || '').trim())

  const shouldWarnBeforeLeavingTab = (tab: WorkspaceTab) => {
    if (tab === 'overview') return dirtyOverview
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

  return (
    <div className="space-y-6">
      <ProjectWorkspaceShell
        project={project}
        activeTab={activeTab}
        visibleTabs={visibleTabs}
        onTabChange={handleTabChange}
        canDelete={Boolean(canDeleteProject)}
        deleting={deletingProject}
        onDelete={handleDeleteProject}
      />

      <section className="rounded-[28px] border border-violet-200 bg-white shadow-sm">
        <div className="p-6">
          {activeTab === 'overview' && canViewOverview ? (
            <ProjectOverviewTab
              project={project}
              availableDepartments={availableDepartments}
              ownerOptions={ownerOptions}
              pendingFile={pendingFile}
              blockDraft={blockDraft}
              dirtyOverview={dirtyOverview}
              savingOverview={savingOverview}
              showBlockComposer={showBlockComposer}
              onSave={saveOverview}
              onProjectChange={(updater) => {
                setDirtyOverviewState(true)
                setProject(updater)
              }}
              onPendingFileChange={setPendingFile}
              onSetBlockDraftName={(value) =>
                setBlockDraft((current) => ({ ...current, name: value }))
              }
              onToggleBlockComposer={() =>
                setShowBlockComposer((current) => {
                  if (current) setBlockDraft(createBlockDraft())
                  return !current
                })
              }
              onCreateBlock={createBlock}
              onSetBlockName={(blockId, value) => setBlockField(blockId, 'name', value)}
              onAddDepartmentToBlock={addDepartmentToBlock}
              onRemoveDepartmentFromBlock={removeDepartmentFromBlock}
              onRemoveBlock={removeBlock}
              onRemoveDocument={removeDocument}
              manualKickoffEmail={manualKickoffEmail}
              kickoffReady={kickoffReady}
              sendingKickoff={sendingKickoff}
              onKickoffFieldChange={setKickoffField}
              onManualKickoffEmailChange={setManualKickoffEmail}
              onAddManualKickoffEmail={addManualKickoffEmail}
              onSendKickoff={sendKickoff}
              onReopenKickoff={reopenKickoff}
              onRemoveKickoffAttendee={removeKickoffAttendee}
            />
          ) : null}

          {activeTab === 'blocks' ? (
            <ProjectBlocksTab
              projectId={projectId}
              project={visibleProjectForBlocks}
              availableDepartments={availableDepartments}
              blockDraft={blockDraft}
              taskDraft={taskDraft}
              showBlockComposer={showBlockComposer}
              editingBlockId={editingBlockId}
              quickTaskBlockId={quickTaskBlockId}
              savingBlocks={savingBlocks}
              dirtyBlocks={dirtyBlocks}
              onSave={saveBlocks}
              onResetBlockDraft={resetBlockDraft}
              onSetBlockDraft={setBlockDraft}
              onCreateBlock={createBlock}
              onSetBlockField={setBlockField}
              onRemoveBlock={removeBlock}
              onSetEditingBlockId={setEditingBlockId}
              onOpenQuickTaskComposer={openQuickTaskComposer}
              onResetTaskDraft={resetTaskDraft}
              onSetTaskDraftField={setTaskDraftField}
              onAddTaskToBlock={addTaskToBlock}
              onSetTaskField={setTaskField}
              onRemoveTask={removeTask}
              onKickoffMinutesChange={(value) => {
                setDirtyBlocksState(true)
                setProject((current) => ({
                  ...current,
                  kickoff: {
                    ...current.kickoff,
                    minutes: value,
                  },
                }))
              }}
              onFinalizeKickoffMinutes={finalizeKickoffMinutes}
              onReopenKickoffMinutes={reopenKickoffMinutes}
              onKickoffAttendeeAttendanceChange={setKickoffAttendeeAttendance}
              onAddKickoffAttendee={(userId) => {
                const user = usersCatalog.find((item) => item.id === userId && item.email)
                if (!user) return
                setDirtyBlocksState(true)
                setProject((current) => {
                  if (current.kickoff.attendees.some((item) => item.key === `user:${user.id}`)) {
                    return current
                  }
                  return {
                    ...current,
                    kickoff: {
                      ...current.kickoff,
                      excludedKeys: current.kickoff.excludedKeys.filter(
                        (item) => item !== `user:${user.id}`
                      ),
                      attendees: [
                        ...current.kickoff.attendees,
                        {
                          key: `user:${user.id}`,
                          userId: user.id,
                          name: user.name,
                          email: user.email,
                          department: user.department || 'Manual',
                          attended: true,
                        },
                      ],
                    },
                  }
                })
              }}
              onRemoveKickoffAttendee={removeKickoffAttendee}
              kickoffAttendeeOptions={kickoffAttendeeOptions}
              departmentResponsibleOptions={departmentResponsibleOptions}
              maxDeadline={maxDeadline}
              canViewKickoffSection={Boolean(hasFullProjectVisibility)}
              canCreateBlocks={Boolean(canCreateOrRemoveBlocks)}
              canEditBlock={canEditSpecificBlock}
              canAccessBlockRoom={canAccessSpecificBlockRoom}
              canEditBlockOwner={Boolean(isProjectOwner)}
            />
          ) : null}

          {activeTab === 'tasks' ? (
            <ProjectTasksTab
              projectId={projectId}
              projectBlocks={visibleProjectForTasks.blocks}
              projectRooms={visibleProjectForTasks.rooms}
              allTasks={visibleProjectForTasks.blocks.flatMap((block) =>
                block.tasks.map((task) => ({
                  block,
                  task,
                  taskKey: `${block.id}:${task.id}`,
                }))
              )}
              taskDraft={taskDraft}
              showTaskComposer={showTaskComposer}
              editingTaskKey={editingTaskKey}
              savingBlocks={savingBlocks}
              dirtyBlocks={dirtyBlocks}
              onSave={saveBlocks}
              onResetTaskDraft={resetTaskDraft}
              onSetTaskDraftField={setTaskDraftField}
              onAddTaskToBlock={addTaskToBlock}
              onSetEditingTaskKey={setEditingTaskKey}
              onRemoveTask={removeTask}
              onSetTaskField={setTaskField}
              onAttachTaskDocument={attachTaskDocument}
              onRemoveTaskDocument={removeTaskDocument}
              taskResponsibleOptions={taskResponsibleOptions}
              maxDeadline={maxDeadline}
              canCreateTasks={Boolean(canCreateOrRemoveBlocks)}
              canSaveTasks={canSaveTasks}
              canManageTask={canManageSpecificTask}
              canAccessTaskOps={canAccessSpecificTaskOps}
              canMoveTask={canMoveSpecificTask}
            />
          ) : null}

          {activeTab === 'planning' ? (
            <ProjectPlanningTab projectId={projectId} project={project} />
          ) : null}

          {activeTab === 'documents' ? (
            <ProjectDocumentsTab
              project={project}
              savingOverview={savingOverview}
              pendingDocumentFile={pendingDocumentFile}
              documentDraft={documentDraft}
              onSave={saveDocuments}
              onPendingFileChange={setPendingDocumentFile}
              onDocumentDraftChange={setDocumentDraft}
              onRemoveDocument={removeDocument}
              onRemoveKickoffMinutes={removeKickoffMinutes}
            />
          ) : null}

          {activeTab === 'tracking' ? <ProjectTrackingTab project={project} /> : null}
        </div>
      </section>

      {activeTab === 'blocks' && canCreateOrRemoveBlocks && !showBlockComposer ? (
        <FloatingAddButton onClick={() => setShowBlockComposer(true)} />
      ) : null}

      {activeTab === 'tasks' ? (
        <FloatingAddButton
          onClick={() => {
            if (showTaskComposer) {
              setTaskDraft(createTaskDraft())
              setShowTaskComposer(false)
            } else {
              setTaskDraft(createTaskDraft())
              setShowTaskComposer(true)
            }
          }}
        />
      ) : null}
    </div>
  )
}
