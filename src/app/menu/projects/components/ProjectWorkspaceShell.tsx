'use client'

import Link from 'next/link'
import { CalendarClock, CalendarPlus, FolderKanban, MessageSquare, TimerReset, Trash2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type ProjectParticipationKind } from '@/lib/projectParticipation'
import { formatProjectDate, phaseLabel, type ProjectData } from './project-shared'
import { type WorkspaceTab, workspaceTabs } from './project-workspace-helpers'
import ProjectSummaryStrip, { projectDaysRunningLabel, projectDeadlineStatus } from './ProjectSummaryStrip'
import { GENERAL_ROOM_LABEL } from './project-room-ui'
import type { WorkspaceAutosaveStatus } from './useProjectWorkspaceAutosave'

type Props = {
  project: ProjectData
  activeTab: WorkspaceTab
  visibleTabs?: WorkspaceTab[]
  participationLabel?: string
  participationBadgeClass?: ProjectParticipationKind
  onTabChange: (tab: WorkspaceTab) => void
  canDelete?: boolean
  deleting?: boolean
  onDelete?: () => void
  canConvokeProjectMeeting?: boolean
  onCreateMeeting?: () => void
  canAccessGeneralRoom?: boolean
  coordinationUnreadCount?: number
  coordinationHasMessagesToRead?: boolean
  coordinationActivityLoading?: boolean
  onOpenCoordination?: () => void
  autosaveStatus?: WorkspaceAutosaveStatus
  canEditLaunchDate?: boolean
  dirtyLaunchDate?: boolean
  savingLaunchDate?: boolean
  onLaunchDateChange?: (value: string) => void
  onSaveLaunchDate?: () => void
}

export default function ProjectWorkspaceShell({
  project,
  activeTab,
  visibleTabs,
  participationLabel,
  onTabChange,
  canDelete = false,
  deleting = false,
  onDelete,
  canConvokeProjectMeeting = false,
  onCreateMeeting,
  canAccessGeneralRoom = false,
  coordinationUnreadCount = 0,
  coordinationHasMessagesToRead = false,
  coordinationActivityLoading = false,
  onOpenCoordination,
  autosaveStatus = 'idle',
  canEditLaunchDate = false,
  dirtyLaunchDate = false,
  savingLaunchDate = false,
  onLaunchDateChange,
  onSaveLaunchDate,
}: Props) {
  const tabs = visibleTabs?.length
    ? visibleTabs
        .map((tabId) => workspaceTabs.find((tab) => tab.id === tabId))
        .filter((tab): tab is (typeof workspaceTabs)[number] => Boolean(tab))
    : workspaceTabs

  const metaParts = [phaseLabel(project.phase), participationLabel].filter(Boolean)
  const owner = String(project.owner || '').trim() || 'Sense responsable'
  const daysRunning = projectDaysRunningLabel(project.createdAt)
  const deadlineStatus = projectDeadlineStatus(project.launchDate)

  const autosaveLabel =
    autosaveStatus === 'pending'
      ? 'Canvis pendents...'
      : autosaveStatus === 'saving'
        ? 'Guardant...'
        : autosaveStatus === 'saved'
          ? 'Guardat'
          : autosaveStatus === 'error'
            ? 'Error en guardar'
            : null

  const coordinationIndicatorLabel =
    coordinationUnreadCount > 0
      ? `${coordinationUnreadCount} missatge${coordinationUnreadCount === 1 ? '' : 's'} per a tu`
      : coordinationHasMessagesToRead
        ? 'Missatges nous al canal general'
        : 'Canal general al dia'

  return (
    <div className="sticky top-0 z-30 w-full border-b border-violet-200/80 bg-gradient-to-r from-violet-200/65 via-fuchsia-100/55 to-violet-50 shadow-[0_8px_20px_-16px_rgba(109,40,217,0.35)] backdrop-blur-sm">
      <div className="px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <FolderKanban className="mt-0.5 h-4.5 w-4.5 shrink-0 text-violet-600" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm">
                <Link href="/menu/projects" className="font-semibold text-slate-700 hover:underline">
                  Projectes
                </Link>
                <span className="text-slate-400">/</span>
                <span className="truncate font-bold text-slate-900">
                  {project.name || 'Projecte sense nom'}
                </span>
              </div>
              {metaParts.length > 0 ? (
                <p className="mt-1 text-xs text-slate-600">{metaParts.join(' · ')}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3 w-3 text-violet-600" />
                  <span className="truncate">{owner}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <TimerReset className="h-3 w-3 text-violet-600" />
                  <span>{daysRunning}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3 text-violet-600" />
                  <span>{formatProjectDate(project.launchDate)}</span>
                </span>
                <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', deadlineStatus.tone)}>
                  <span>{deadlineStatus.label}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {autosaveLabel ? (
              <span className="hidden text-xs text-slate-500 sm:inline">{autosaveLabel}</span>
            ) : null}
            {canAccessGeneralRoom && onOpenCoordination ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                title={`${GENERAL_ROOM_LABEL} · ${coordinationIndicatorLabel}`}
                onClick={onOpenCoordination}
                className="relative h-7 w-7 shrink-0 border-violet-200 bg-white/90 text-violet-800 hover:bg-violet-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {!coordinationActivityLoading ? (
                  coordinationUnreadCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                      {coordinationUnreadCount > 99 ? '99+' : coordinationUnreadCount}
                    </span>
                  ) : coordinationHasMessagesToRead ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                      aria-hidden="true"
                    />
                  )
                ) : null}
              </Button>
            ) : null}
            {canConvokeProjectMeeting && onCreateMeeting ? (
              <Button
                type="button"
                size="icon"
                title="Reunió d'arrencada"
                aria-label="Reunió d'arrencada"
                onClick={onCreateMeeting}
                className="h-7 w-7 shrink-0 border border-violet-200 bg-white/90 text-violet-700 shadow-sm shadow-violet-200/30 hover:bg-violet-50 hover:text-violet-800"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onDelete}
                disabled={deleting}
                title={deleting ? 'Eliminant projecte...' : 'Eliminar projecte'}
                aria-label={deleting ? 'Eliminant projecte' : 'Eliminar projecte'}
                className="h-7 w-7 shrink-0 border-red-200 bg-white/85 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex flex-wrap rounded-2xl border border-white/95 bg-white/88 p-1 shadow-md shadow-violet-200/30"
            role="tablist"
            aria-label="Seccions del projecte"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-300/40'
                      : 'text-slate-600 hover:bg-white/90 hover:text-violet-800'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-2">
          <ProjectSummaryStrip
            project={project}
            compact
            canEditLaunchDate={canEditLaunchDate}
            dirtyLaunchDate={dirtyLaunchDate}
            savingLaunchDate={savingLaunchDate}
            onLaunchDateChange={onLaunchDateChange}
            onSaveLaunchDate={onSaveLaunchDate}
          />
        </div>
      </div>
    </div>
  )
}
