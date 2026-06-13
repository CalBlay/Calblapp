'use client'

import Link from 'next/link'
import { CalendarPlus, FolderKanban, MessageSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type ProjectParticipationKind } from '@/lib/projectParticipation'
import { formatProjectDate, phaseLabel, type ProjectData } from './project-shared'
import { type WorkspaceTab, workspaceTabs } from './project-workspace-helpers'
import ProjectMissionStrip from './ProjectMissionStrip'
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
}: Props) {
  const launchDateRaw = String(project.launchDate || '').trim()
  const launchDate = launchDateRaw
    ? new Date(launchDateRaw.length === 10 ? `${launchDateRaw}T00:00:00` : launchDateRaw)
    : null
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const launchStart =
    launchDate && !Number.isNaN(launchDate.getTime())
      ? new Date(launchDate.getFullYear(), launchDate.getMonth(), launchDate.getDate())
      : null
  const daysToLaunch = launchStart
    ? Math.round((launchStart.getTime() - todayStart.getTime()) / 86400000)
    : null

  const tabs = visibleTabs?.length
    ? visibleTabs
        .map((tabId) => workspaceTabs.find((tab) => tab.id === tabId))
        .filter((tab): tab is (typeof workspaceTabs)[number] => Boolean(tab))
    : workspaceTabs

  const metaParts = [
    phaseLabel(project.phase),
    participationLabel,
    project.launchDate ? `Arrencada ${formatProjectDate(project.launchDate)}` : null,
  ].filter(Boolean)

  const delayLabel =
    daysToLaunch !== null
      ? daysToLaunch > 0
        ? `Falten ${daysToLaunch}d`
        : daysToLaunch === 0
          ? 'Avui'
          : `Retard ${Math.abs(daysToLaunch)}d`
      : null

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
    <div className="w-full border-b border-violet-200/80 bg-gradient-to-r from-violet-200/70 via-fuchsia-100/60 to-violet-50 shadow-[0_8px_24px_-16px_rgba(109,40,217,0.35)]">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <FolderKanban className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
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
                className="relative h-8 w-8 shrink-0 border-violet-200 bg-white/90 text-violet-800 hover:bg-violet-50"
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
                size="sm"
                onClick={onCreateMeeting}
                className="h-8 shrink-0 gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2.5 text-white shadow-sm shadow-violet-300/40 hover:from-violet-700 hover:to-fuchsia-700"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                <span className="hidden text-xs font-medium sm:inline">Reunió d'arrencada</span>
              </Button>
            ) : null}
            {canDelete ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              title="Eliminar el projecte sencer i tot el contingut associat"
              className="h-8 shrink-0 gap-1.5 border-red-200 bg-white/80 px-2.5 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden text-xs font-medium sm:inline">
                {deleting ? 'Eliminant...' : 'Eliminar projecte'}
              </span>
            </Button>
          ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex flex-wrap rounded-xl border border-white/90 bg-white/75 p-1 shadow-md shadow-violet-200/30"
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
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
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

          {delayLabel ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                daysToLaunch !== null && daysToLaunch < 0
                  ? 'bg-red-100 text-red-700'
                  : daysToLaunch === 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-white/70 text-slate-600'
              )}
            >
              {delayLabel}
            </span>
          ) : null}
        </div>
      </div>

      <ProjectMissionStrip context={project.context} strategy={project.strategy} />
    </div>
  )
}
