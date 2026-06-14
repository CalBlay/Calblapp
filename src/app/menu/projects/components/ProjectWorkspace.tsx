'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { normalizeRole } from '@/lib/roles'
import { cn } from '@/lib/utils'
import {
  getPreLaunchDeadline,
  type ProjectData,
} from './project-shared'
import UnsavedChangesDialog from './UnsavedChangesDialog'
import ProjectConfirmDialog from './ProjectConfirmDialog'
import {
  canOpenMeetingActaInBlocks,
  canOpenMeetingActaInTasks,
} from './project-meeting-acta'
import ProjectWorkspaceShell from './ProjectWorkspaceShell'
import { ensureProjectRooms } from './project-workspace-state'
import { useProjectBlocksTasksActions } from './useProjectBlocksTasksActions'
import { useProjectKickoffActions } from './useProjectKickoffActions'
import { useProjectPersistence } from './useProjectPersistence'
import { useProjectAutoSync } from './useProjectAutoSync'
import { useProjectMeetings } from './useProjectMeetings'
import { useProjectResponsibleOptions } from './useProjectResponsibleOptions'
import { useProjectSaveActions } from './useProjectSaveActions'
import { useProjectTabWorkflow } from './useProjectTabWorkflow'
import { useProjectUsersCatalog } from './useProjectUsersCatalog'
import { useProjectVisibility } from './useProjectVisibility'
import { useProjectDirtyState } from './useProjectDirtyState'
import { useProjectWorkspaceAutosave } from './useProjectWorkspaceAutosave'
import { useProjectActivity } from './useProjectActivity'
import {
  createBlockDraft,
  createTaskDraft,
  normalizeDepartment,
  type ResponsibleOption,
  type WorkspaceTab,
} from './project-workspace-helpers'

type Props = {
  projectId: string
  initialProject: ProjectData
  initialUsersCatalog?: ResponsibleOption[]
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

const ProjectOverviewTab = dynamic(() => import('./ProjectOverviewTab'), {
  loading: tabLoadingFallback,
})

const ProjectCoordinationPanel = dynamic(() => import('./ProjectCoordinationPanel'), {
  loading: () => null,
  ssr: false,
})

const ProjectMeetingDialog = dynamic(() => import('./ProjectMeetingDialog'), {
  ssr: false,
})

const ProjectMeetingMinutesDialog = dynamic(() => import('./ProjectMeetingMinutesDialog'), {
  ssr: false,
})

const ProjectKickoffMeetingDialog = dynamic(() => import('./ProjectKickoffMeetingDialog'), {
  ssr: false,
})

export default function ProjectWorkspace({
  projectId,
  initialProject,
  initialUsersCatalog,
  initialTab,
}: Props) {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const sessionUserId = String(session?.user?.id || '').trim()
  const sessionUserName = String(session?.user?.name || '').trim()
  const sessionUserEmail = String(session?.user?.email || '').trim()
  const sessionRole = normalizeRole(String(session?.user?.role || '').trim())
  const sessionDepartment = normalizeDepartment(String(session?.user?.department || '').trim())
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab ?? 'overview')
  const [project, setProject] = useState<ProjectData>(initialProject)
  const meetingActaUser = useMemo(
    () => ({
      id: sessionUserId,
      name: sessionUserName,
      email: sessionUserEmail,
    }),
    [sessionUserEmail, sessionUserId, sessionUserName]
  )
  const canOpenActaInBlocks = useMemo(
    () => canOpenMeetingActaInBlocks(meetingActaUser, project),
    [meetingActaUser, project]
  )
  const canOpenActaInTasks = useMemo(
    () => canOpenMeetingActaInTasks(meetingActaUser, project),
    [meetingActaUser, project]
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingDocumentFile, setPendingDocumentFile] = useState<File | null>(null)
  const [documentDraft, setDocumentDraft] = useState({ category: 'general', label: '' })
  const { usersCatalog, responsibles } = useProjectUsersCatalog(initialUsersCatalog)
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [meetingMinutesOpen, setMeetingMinutesOpen] = useState(false)
  const [kickoffMeetingOpen, setKickoffMeetingOpen] = useState(false)
  const [coordinationOpen, setCoordinationOpen] = useState(false)
  const {
    canAccessProjectGeneralRoom,
    canAccessSpecificBlockRoom,
    canAccessSpecificTaskOps,
    canCreateOrRemoveBlocks,
    canDeleteProject,
    canEditSpecificBlock,
    canManageSpecificTask,
    canMoveSpecificTask,
    canManageProject,
    canSaveTasks,
    canViewOverview,
    canConvokeBlockMeeting,
    canConvokeMeetings,
    canConvokeProjectMeeting,
    canConvokeTaskMeeting,
    isBlockResponsible,
    participation,
    preferredWorkspaceTab,
    visibleProjectForBlocks,
    visibleProjectForTasks,
    visibleTabs,
  } = useProjectVisibility({
    project,
    sessionStatus,
    sessionRole,
    sessionUserId,
    sessionUserName,
    sessionDepartment,
  })

  const { dirtyOverview, dirtyBlocks, markOverviewSaved, markBlocksSaved, resetSnapshots } =
    useProjectDirtyState({
      project,
      pendingFile,
    })

  useEffect(() => {
    setProject(initialProject)
    resetSnapshots(initialProject)
  }, [initialProject, resetSnapshots])

  const applyTabChange = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab)
      router.replace(`/menu/projects/${projectId}?tab=${tab}`, { scroll: false })
    },
    [projectId, router]
  )

  const scrollToProjectTarget = useCallback((elementId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  const handleNavigateToBlock = useCallback(
    (blockId: string) => {
      applyTabChange('blocks')
      setEditingBlockId(blockId)
      setEditingTaskKey(null)
      scrollToProjectTarget(`project-block-${blockId}`)
    },
    [applyTabChange, scrollToProjectTarget]
  )

  const handleNavigateToTask = useCallback(
    (blockId: string, taskId: string) => {
      applyTabChange('tasks')
      setEditingTaskKey(`${blockId}:${taskId}`)
      setEditingBlockId(null)
      scrollToProjectTarget(`project-task-${blockId}:${taskId}`)
    },
    [applyTabChange, scrollToProjectTarget]
  )

  const allTasks = useMemo(
    () =>
      visibleProjectForTasks.blocks.flatMap((block) =>
        block.tasks.map((task) => ({
          block,
          task,
          taskKey: `${block.id}:${task.id}`,
        }))
      ),
    [visibleProjectForTasks.blocks]
  )

  const appliedInitialNavigation = useRef(false)

  useEffect(() => {
    appliedInitialNavigation.current = false
  }, [projectId])

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!visibleTabs.includes(activeTab)) {
      const nextTab = visibleTabs.includes(preferredWorkspaceTab)
        ? preferredWorkspaceTab
        : visibleTabs[0] || 'tasks'
      applyTabChange(nextTab)
    }
  }, [activeTab, applyTabChange, preferredWorkspaceTab, sessionStatus, visibleTabs])

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (appliedInitialNavigation.current) return
    appliedInitialNavigation.current = true

    if (initialTab !== undefined && visibleTabs.includes(initialTab)) {
      applyTabChange(initialTab)
      return
    }

    if (visibleTabs.includes(preferredWorkspaceTab)) {
      applyTabChange(preferredWorkspaceTab)
    } else if (visibleTabs[0]) {
      applyTabChange(visibleTabs[0])
    }
  }, [applyTabChange, initialTab, preferredWorkspaceTab, projectId, sessionStatus, visibleTabs])

  const maxDeadline = useMemo(() => getPreLaunchDeadline(project.launchDate), [project.launchDate])
  const {
    availableDepartments,
    departmentResponsibleOptions,
    kickoffAttendeeOptions,
    ownerOptions,
    taskResponsibleOptions,
    userByName,
  } = useProjectResponsibleOptions({
    project,
    usersCatalog,
    responsibles,
  })
  const { saveProject } = useProjectPersistence({
    projectId,
    pendingFile,
    setPendingFile,
    setProject,
  })
  const {
    setKickoffField,
    removeKickoffAttendee,
    addManualKickoffEmail,
    addKickoffAttendeeFromUser,
    kickoffReady,
    sendKickoff,
    reopenKickoff,
    saveKickoffMinutes,
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
      markBlocksSaved(nextProject)
    },
    onBlocksDirty: () => undefined,
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
      markBlocksSaved(nextProject)
    },
    onBlocksDirty: () => undefined,
  })

  const {
    meetingTarget,
    openBlockMeeting,
    openTaskMeeting,
    sendingMeeting,
    sendProjectMeeting,
    setMeetingTarget,
  } = useProjectMeetings({
    projectId,
    project,
    setProject,
    userByName,
    departmentResponsibleOptions,
    taskResponsibleOptions,
    onMeetingCreated: ({ scope, blockId, taskId }) => {
      if (scope === 'task' && taskId) {
        applyTabChange('tasks')
        setEditingTaskKey(`${blockId}:${taskId}`)
        setEditingBlockId(null)
        return
      }
      applyTabChange('blocks')
      setEditingBlockId(blockId)
      setEditingTaskKey(null)
    },
  })

  useProjectAutoSync({
    project,
    setProject,
    usersCatalog,
    userByName,
  })

  const projectSnapshotRef = useRef(project)
  projectSnapshotRef.current = project
  const wasSavingBlocksRef = useRef(false)

  useEffect(() => {
    if (wasSavingBlocksRef.current && !savingBlocks) {
      const timeoutId = window.setTimeout(() => {
        markBlocksSaved(projectSnapshotRef.current)
      }, 0)
      wasSavingBlocksRef.current = savingBlocks
      return () => window.clearTimeout(timeoutId)
    }
    wasSavingBlocksRef.current = savingBlocks
  }, [markBlocksSaved, savingBlocks])

  const {
    handleDeleteProject,
    removeDocument,
    removeKickoffMinutes,
    saveBlocks,
    saveDocuments,
    saveOverview,
  } = useProjectSaveActions({
    documentDraft,
    pendingDocumentFile,
    pendingFile,
    project,
    projectId,
    saveProject,
    sessionUserName: String(session?.user?.name || '').trim(),
    setDeletingProject,
    setDocumentDraft,
    setPendingDocumentFile,
    setProject,
    setSavingBlocks,
    setSavingOverview,
    userByName,
    markOverviewSaved,
    markBlocksSaved,
  })

  const { autosaveStatus } = useProjectWorkspaceAutosave({
    dirtyOverview,
    dirtyBlocks,
    savingOverview,
    savingBlocks,
    saveOverview,
    saveBlocks,
  })

  const trackProjectUnread =
    canAccessProjectGeneralRoom ||
    visibleProjectForBlocks.blocks.some((block) => canAccessSpecificBlockRoom(block))

  const {
    unreadByBlockId,
    generalDirectUnread: coordinationDirectUnread,
    generalHasChannelMessagesToRead: coordinationHasChannelMessagesToRead,
    loading: coordinationActivityLoading,
    refresh: refreshProjectActivity,
  } = useProjectActivity(projectId, trackProjectUnread, coordinationOpen)

  useEffect(() => {
    if (!coordinationOpen) return
    void refreshProjectActivity()
    const timer = window.setInterval(() => {
      void refreshProjectActivity()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [coordinationOpen, refreshProjectActivity])

  const canCreateTasks = Boolean(canCreateOrRemoveBlocks || isBlockResponsible)

  const {
    createSprint,
    handleTabChange,
    unsavedPrompt,
    resolvingUnsaved,
    cancelUnsavedPrompt,
    discardUnsavedPrompt,
    saveUnsavedPrompt,
  } = useProjectTabWorkflow({
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
    canCreateSprints: canCreateTasks,
  })

  return (
    <div className="cmd-app flex w-full max-w-none flex-col">
      <ProjectWorkspaceShell
        project={project}
        activeTab={activeTab}
        visibleTabs={visibleTabs}
        participationLabel={participation.label}
        participationBadgeClass={participation.primary}
        onTabChange={handleTabChange}
        canDelete={Boolean(canDeleteProject)}
        deleting={deletingProject}
        onDelete={() => setDeleteConfirmOpen(true)}
        canConvokeProjectMeeting={Boolean(canConvokeProjectMeeting)}
        onCreateMeeting={() => setKickoffMeetingOpen(true)}
        canAccessGeneralRoom={canAccessProjectGeneralRoom}
        coordinationUnreadCount={coordinationOpen ? 0 : coordinationDirectUnread}
        coordinationHasMessagesToRead={coordinationOpen ? false : coordinationHasChannelMessagesToRead}
        coordinationActivityLoading={coordinationActivityLoading}
        onOpenCoordination={() => setCoordinationOpen(true)}
        autosaveStatus={autosaveStatus}
      />

      {coordinationOpen ? (
        <ProjectCoordinationPanel
          projectId={projectId}
          project={project}
          open={coordinationOpen}
          onOpenChange={setCoordinationOpen}
          sessionUserId={sessionUserId}
          userByName={userByName}
          canAccessBlockRoom={canAccessSpecificBlockRoom}
          onNavigateToBlock={handleNavigateToBlock}
          onNavigateToTask={handleNavigateToTask}
          visibleBlocks={visibleProjectForBlocks.blocks}
          visibleTasks={allTasks}
          focusedBlockId={editingBlockId}
          focusedTaskKey={editingTaskKey}
          unreadByBlockId={unreadByBlockId}
          onRoomSynced={(syncedRoom) => {
            setProject((current) => ({
              ...current,
              rooms: current.rooms.map((room) =>
                room.id === syncedRoom.id ? { ...room, ...syncedRoom } : room
              ),
            }))
          }}
        />
      ) : null}

      <div
        className={cn(
          'flex w-full min-w-0 flex-col px-3 pb-4 sm:px-4 lg:px-5',
          activeTab === 'tasks' ? 'gap-2 pt-2' : 'gap-3 pt-4'
        )}
      >
        {activeTab === 'tasks' ? (
          <ProjectTasksTab
            projectId={projectId}
            projectBlocks={visibleProjectForTasks.blocks}
            projectSprints={project.sprints || []}
            projectRooms={visibleProjectForTasks.rooms}
            allTasks={allTasks}
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
            canCreateTasks={canCreateTasks}
            canSaveTasks={canSaveTasks}
            canManageTask={canManageSpecificTask}
            canAccessTaskOps={canAccessSpecificTaskOps}
            canMoveTask={canMoveSpecificTask}
            onCreateSprint={createSprint}
            canConvokeTaskMeeting={canConvokeTaskMeeting}
            canOpenMeetingMinutes={canOpenActaInTasks}
            onOpenMeetingMinutes={() => setMeetingMinutesOpen(true)}
            kickoffMinutesStatus={project.kickoff.minutesStatus}
            kickoffMinutesDraft={project.kickoff.minutes || ''}
            onOpenTaskMeeting={openTaskMeeting}
          />
        ) : activeTab === 'overview' && canViewOverview ? (
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
            onProjectChange={setProject}
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
            showKickoffSection
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
        ) : (
          <section className="rounded-2xl border border-violet-100 bg-white shadow-sm">
            <div className="p-4 sm:p-5">
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
              departmentResponsibleOptions={departmentResponsibleOptions}
              maxDeadline={maxDeadline}
              canOpenMeetingMinutes={canOpenActaInBlocks}
              onOpenMeetingMinutes={() => setMeetingMinutesOpen(true)}
              canCreateBlocks={Boolean(canCreateOrRemoveBlocks)}
              canEditBlock={canEditSpecificBlock}
              canConvokeBlockMeeting={canConvokeBlockMeeting}
              canAccessBlockRoom={canAccessSpecificBlockRoom}
              unreadByBlockId={unreadByBlockId}
              canEditBlockOwner={Boolean(canManageProject)}
              onOpenBlockMeeting={openBlockMeeting}
            />
          ) : null}

              {activeTab === 'planning' ? (
            <ProjectPlanningTab
              projectId={projectId}
              project={project}
              canConvokeMeetings={Boolean(canConvokeMeetings)}
              meetingActaUser={meetingActaUser}
              onOpenMeetingMinutes={() => setMeetingMinutesOpen(true)}
              onOpenBlockMeeting={openBlockMeeting}
              onOpenTaskMeeting={openTaskMeeting}
              onNavigateToBlock={(blockId) => {
                applyTabChange('blocks')
                setEditingBlockId(blockId)
                setEditingTaskKey(null)
              }}
              onNavigateToTask={(blockId, taskId) => {
                applyTabChange('tasks')
                setEditingTaskKey(`${blockId}:${taskId}`)
              }}
            />
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

              {activeTab === 'tracking' ? (
                <ProjectTrackingTab
                  project={project}
                  onResolveAlert={(target) => {
                    if (target.tab === 'blocks') {
                      applyTabChange('blocks')
                      setEditingBlockId(target.blockId)
                      setEditingTaskKey(null)
                      return
                    }
                    applyTabChange('tasks')
                    setEditingTaskKey(
                      target.taskId ? `${target.blockId}:${target.taskId}` : null
                    )
                  }}
                  onOpenBlock={(blockId) => {
                    applyTabChange('blocks')
                    setEditingBlockId(blockId)
                    setEditingTaskKey(null)
                  }}
                />
              ) : null}
            </div>
          </section>
        )}
      </div>

      {activeTab === 'blocks' && canCreateOrRemoveBlocks && !showBlockComposer ? (
        <FloatingAddButton onClick={() => setShowBlockComposer(true)} />
      ) : null}

      {activeTab === 'tasks' && (canCreateOrRemoveBlocks || isBlockResponsible) ? (
        <FloatingAddButton
          onClick={() => {
            const defaultBlockId = visibleProjectForBlocks.blocks[0]?.id || 'none'
            if (showTaskComposer) {
              setTaskDraft(createTaskDraft())
              setShowTaskComposer(false)
            } else {
              setTaskDraft({
                ...createTaskDraft(),
                blockId: defaultBlockId,
              })
              setShowTaskComposer(true)
            }
          }}
        />
      ) : null}
      {kickoffMeetingOpen ? (
        <ProjectKickoffMeetingDialog
          open={kickoffMeetingOpen}
          project={project}
          kickoffAttendeeOptions={kickoffAttendeeOptions}
          manualKickoffEmail={manualKickoffEmail}
          kickoffReady={kickoffReady}
          sendingKickoff={sendingKickoff}
          onOpenChange={setKickoffMeetingOpen}
          onKickoffFieldChange={setKickoffField}
          onManualKickoffEmailChange={setManualKickoffEmail}
          onAddManualKickoffEmail={addManualKickoffEmail}
          onAddKickoffAttendeeFromUser={addKickoffAttendeeFromUser}
          onSendKickoff={sendKickoff}
          onReopenKickoff={reopenKickoff}
          onRemoveKickoffAttendee={removeKickoffAttendee}
        />
      ) : null}
      {meetingTarget ? (
        <ProjectMeetingDialog
          open={Boolean(meetingTarget)}
          sending={sendingMeeting}
          target={meetingTarget}
          onOpenChange={(open) => {
            if (!open) setMeetingTarget(null)
          }}
          onSubmit={sendProjectMeeting}
        />
      ) : null}
      {meetingMinutesOpen && (canOpenActaInBlocks || canOpenActaInTasks) ? (
        <ProjectMeetingMinutesDialog
          open={meetingMinutesOpen}
          projectId={projectId}
          project={project}
          generatedByLabel={sessionUserName || String(session?.user?.email || '').trim()}
          kickoffAttendeeOptions={kickoffAttendeeOptions}
          saving={savingBlocks}
          onOpenChange={setMeetingMinutesOpen}
          onSaveDraft={(payload, options) => saveKickoffMinutes(payload, options)}
          onFinalize={(payload) => finalizeKickoffMinutes(payload)}
          onReopen={reopenKickoffMinutes}
        />
      ) : null}
      <UnsavedChangesDialog
        open={Boolean(unsavedPrompt)}
        saving={resolvingUnsaved}
        onSave={() => void saveUnsavedPrompt()}
        onDiscard={discardUnsavedPrompt}
        onCancel={cancelUnsavedPrompt}
      />
      <ProjectConfirmDialog
        open={deleteConfirmOpen}
        title="Eliminar projecte"
        description="Vols eliminar aquest projecte? Aquesta acció no es pot desfer."
        confirmLabel="Eliminar"
        destructive
        loading={deletingProject}
        onConfirm={() => {
          void handleDeleteProject().finally(() => setDeleteConfirmOpen(false))
        }}
        onCancel={() => {
          if (!deletingProject) setDeleteConfirmOpen(false)
        }}
      />
    </div>
  )
}
