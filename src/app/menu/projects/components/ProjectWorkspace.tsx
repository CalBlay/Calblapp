'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { normalizeRole } from '@/lib/roles'
import {
  getPreLaunchDeadline,
  type ProjectData,
} from './project-shared'
import ProjectMeetingDialog from './ProjectMeetingDialog'
import ProjectOverviewTab from './ProjectOverviewTab'
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
import {
  createBlockDraft,
  createTaskDraft,
  normalizeDepartment,
  type WorkspaceTab,
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
  const { usersCatalog, responsibles } = useProjectUsersCatalog()
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
  const {
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
    hasFullProjectVisibility,
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
  })

  useProjectAutoSync({
    project,
    setProject,
    usersCatalog,
    userByName,
  })

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
    setDirtyBlocksState,
    setDirtyOverviewState,
    setDocumentDraft,
    setPendingDocumentFile,
    setProject,
    setSavingBlocks,
    setSavingOverview,
    syncRoomsWithOps,
    userByName,
  })

  const {
    createSprint,
    handleTabChange,
  } = useProjectTabWorkflow({
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
  })

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
              canEditBlockOwner={Boolean(canManageProject)}
              onOpenBlockMeeting={openBlockMeeting}
            />
          ) : null}

          {activeTab === 'tasks' ? (
            <ProjectTasksTab
              projectId={projectId}
              projectBlocks={visibleProjectForTasks.blocks}
              projectSprints={project.sprints || []}
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
              onCreateSprint={createSprint}
              onOpenTaskMeeting={openTaskMeeting}
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
      <ProjectMeetingDialog
        open={Boolean(meetingTarget)}
        sending={sendingMeeting}
        target={meetingTarget}
        onOpenChange={(open) => {
          if (!open) setMeetingTarget(null)
        }}
        onSubmit={sendProjectMeeting}
      />
    </div>
  )
}
