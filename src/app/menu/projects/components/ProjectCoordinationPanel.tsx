'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Blocks,
  ChevronDown,
  ExternalLink,
  Layers,
  MessageSquare,
  TimerReset,
  Users,
  X,
} from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { buildGeneralRoomId } from '@/lib/projectGeneralRoom'
import { cn } from '@/lib/utils'
import ProjectRoomOpsChat from './ProjectRoomOpsChat'
import {
  BLOCK_WORKSPACE_LABEL,
  buildMissatgeriaChannelHref,
  buildProjectRoomHref,
  GENERAL_ROOM_LABEL,
  MISSATGERIA_OPEN_LABEL,
} from './project-room-ui'
import type { ProjectBlock, ProjectData, ProjectTask } from './project-shared'
import { statusLabel } from './project-shared'
import { deriveProjectParticipants } from './project-workspace-state'
import type { ResponsibleOption } from './project-workspace-helpers'

type Props = {
  projectId: string
  project: ProjectData
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionUserId: string
  userByName: Map<string, ResponsibleOption>
  canAccessBlockRoom: (block: ProjectBlock) => boolean
  onNavigateToBlock: (blockId: string) => void
  onNavigateToTask: (blockId: string, taskId: string) => void
  visibleBlocks: ProjectBlock[]
  visibleTasks: Array<{ block: ProjectBlock; task: ProjectTask; taskKey: string }>
  focusedBlockId?: string | null
  focusedTaskKey?: string | null
  unreadByBlockId?: Record<string, number>
  onRoomSynced?: (room: RoomPayload) => void
}

type RoomPayload = NonNullable<ProjectData['rooms'][number]>
type AccessSection = 'blocks' | 'tasks' | 'workspaces' | 'participants'

function participantRoleLabel(name: string, project: ProjectData) {
  const trimmed = name.trim()
  if (!trimmed) return 'Participant'
  if (trimmed === String(project.owner || '').trim()) return 'Propietari'
  if (trimmed === String(project.sponsor || '').trim()) return 'Sponsor'
  const ownedBlocks = project.blocks.filter((block) => String(block.owner || '').trim() === trimmed)
  if (ownedBlocks.length > 0) {
    return ownedBlocks.length === 1 ? `Cap de bloc: ${ownedBlocks[0].name}` : 'Cap de bloc'
  }
  const taskCount = project.blocks.reduce(
    (count, block) =>
      count + block.tasks.filter((task) => String(task.owner || '').trim() === trimmed).length,
    0
  )
  if (taskCount > 0) return taskCount === 1 ? 'Responsable de tasca' : 'Responsable de tasques'
  return 'Participant'
}

function CollapsibleSection({
  title,
  count,
  icon: Icon,
  expanded,
  onToggle,
  children,
}: {
  title: string
  count: number
  icon: typeof Blocks
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-white/80"
        aria-expanded={expanded}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-violet-700" />
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {count}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded ? <div className="space-y-1.5 px-3 pb-3">{children}</div> : null}
    </div>
  )
}

function AccessListItem({
  title,
  subtitle,
  icon: Icon,
  selected,
  badge,
  onClick,
}: {
  title: string
  subtitle?: string
  icon: typeof Blocks
  selected?: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
        selected
          ? 'border-violet-300 bg-violet-50'
          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50'
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{subtitle}</span>
          ) : null}
        </span>
      </span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

const DEFAULT_EXPANDED_SECTIONS: Record<AccessSection, boolean> = {
  blocks: false,
  tasks: false,
  workspaces: false,
  participants: true,
}

export default function ProjectCoordinationPanel({
  projectId,
  project,
  open,
  onOpenChange,
  sessionUserId,
  userByName,
  canAccessBlockRoom,
  onNavigateToBlock,
  onNavigateToTask,
  visibleBlocks,
  visibleTasks,
  focusedBlockId = null,
  focusedTaskKey = null,
  unreadByBlockId = {},
  onRoomSynced,
}: Props) {
  const generalRoomId = buildGeneralRoomId(projectId)
  const [activeRoomId, setActiveRoomId] = useState(generalRoomId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [room, setRoom] = useState<RoomPayload | null>(null)
  const [expandedSections, setExpandedSections] =
    useState<Record<AccessSection, boolean>>(DEFAULT_EXPANDED_SECTIONS)
  const wasOpenRef = useRef(false)

  const participants = useMemo(
    () => deriveProjectParticipants(project, userByName),
    [project, userByName]
  )

  const accessibleBlockRooms = useMemo(
    () =>
      project.blocks
        .filter((block) => canAccessBlockRoom(block))
        .map((block) => {
          const blockRoom =
            project.rooms.find((item) => item.kind === 'block' && item.blockId === block.id) ||
            ({
              id: `room-block-${block.id}`,
              name: block.name || 'Sala de bloc',
              kind: 'block' as const,
              blockId: block.id,
              departments: [],
              participants: [],
            } satisfies RoomPayload)
          return { room: blockRoom, block }
        }),
    [canAccessBlockRoom, project.blocks, project.rooms]
  )

  const workspaceCount = accessibleBlockRooms.length + 1

  const toggleSection = (section: AccessSection) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const loadRoom = useCallback(
    async (roomId: string) => {
      setLoading(true)
      setError('')
      try {
        const localRoom =
          project.rooms.find((item) => item.id === roomId) ||
          accessibleBlockRooms.find(({ room: blockRoom }) => blockRoom.id === roomId)?.room ||
          null

        if (localRoom?.opsChannelId) {
          setRoom(localRoom)
          return
        }

        let nextRoom = localRoom
        if (!nextRoom?.opsChannelId) {
          const syncRes = await fetch(`/api/projects/${projectId}/rooms/${roomId}`, {
            method: 'PUT',
          })
          const syncPayload = (await syncRes.json().catch(() => ({}))) as {
            error?: string
            room?: RoomPayload
          }
          if (!syncRes.ok) {
            throw new Error(syncPayload.error || 'No s ha pogut sincronitzar la sala')
          }
          if (syncPayload.room) {
            nextRoom = syncPayload.room
            onRoomSynced?.(syncPayload.room)
          }
        }

        if (!nextRoom) {
          throw new Error('Sala no trobada')
        }

        setRoom(nextRoom)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error carregant la sala')
        setRoom(null)
      } finally {
        setLoading(false)
      }
    },
    [accessibleBlockRooms, onRoomSynced, project.rooms, projectId]
  )

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveRoomId(generalRoomId)
      setExpandedSections(DEFAULT_EXPANDED_SECTIONS)
    }
    wasOpenRef.current = open
  }, [generalRoomId, open])

  useEffect(() => {
    if (!open) return
    void loadRoom(activeRoomId)
  }, [activeRoomId, loadRoom, open])

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId)
    setExpandedSections((current) => ({ ...current, workspaces: true }))
  }

  const handleSelectBlock = (blockId: string) => {
    onNavigateToBlock(blockId)
    setExpandedSections((current) => ({ ...current, blocks: true }))
  }

  const handleSelectTask = (blockId: string, taskId: string) => {
    onNavigateToTask(blockId, taskId)
    setExpandedSections((current) => ({ ...current, tasks: true }))
  }

  const activeRoomLabel =
    activeRoomId === generalRoomId
      ? GENERAL_ROOM_LABEL
      : accessibleBlockRooms.find(({ room: blockRoom }) => blockRoom.id === activeRoomId)?.block
          .name ||
        room?.name ||
        BLOCK_WORKSPACE_LABEL

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        overlayClassName="pointer-events-none bg-slate-900/10"
        className="flex h-full w-full max-w-none flex-col gap-0 border-l border-violet-100 p-0 shadow-2xl sm:max-w-4xl lg:max-w-6xl [&>button]:hidden"
      >
        <SheetTitle className="sr-only">{activeRoomLabel}</SheetTitle>

        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{activeRoomLabel}</div>
              <div className="text-xs text-slate-500">Canal Ops · {project.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {room?.opsChannelId ? (
              <Button asChild type="button" variant="outline" size="sm" className="h-8 text-xs">
                <Link href={buildMissatgeriaChannelHref(room.opsChannelId)} target="_blank">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {MISSATGERIA_OPEN_LABEL}
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
            {loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Carregant conversa...
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-red-600">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadRoom(activeRoomId)}
                >
                  Tornar a provar
                </Button>
              </div>
            ) : room?.opsChannelId ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <ProjectRoomOpsChat channelId={room.opsChannelId} userId={sessionUserId} />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                Guarda el projecte per activar el canal de coordinació.
              </div>
            )}
          </section>

          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-slate-50/60">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Accés directe
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Consulta blocs, tasques o espais sense tancar la conversa.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <CollapsibleSection
                title="Blocs"
                count={visibleBlocks.length}
                icon={Blocks}
                expanded={expandedSections.blocks}
                onToggle={() => toggleSection('blocks')}
              >
                {visibleBlocks.length === 0 ? (
                  <p className="px-1 text-xs text-slate-500">Sense blocs visibles.</p>
                ) : (
                  visibleBlocks.map((block) => (
                    <AccessListItem
                      key={block.id}
                      title={block.name || 'Bloc sense nom'}
                      subtitle={statusLabel(block.status)}
                      icon={Blocks}
                      selected={focusedBlockId === block.id}
                      onClick={() => handleSelectBlock(block.id)}
                    />
                  ))
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Tasques"
                count={visibleTasks.length}
                icon={TimerReset}
                expanded={expandedSections.tasks}
                onToggle={() => toggleSection('tasks')}
              >
                {visibleTasks.length === 0 ? (
                  <p className="px-1 text-xs text-slate-500">Sense tasques visibles.</p>
                ) : (
                  visibleTasks.map(({ block, task, taskKey }) => (
                    <AccessListItem
                      key={taskKey}
                      title={task.title || 'Tasca sense nom'}
                      subtitle={`${block.name || 'Bloc'} · ${statusLabel(task.status)}`}
                      icon={TimerReset}
                      selected={focusedTaskKey === taskKey}
                      onClick={() => handleSelectTask(block.id, task.id)}
                    />
                  ))
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title={BLOCK_WORKSPACE_LABEL}
                count={workspaceCount}
                icon={Layers}
                expanded={expandedSections.workspaces}
                onToggle={() => toggleSection('workspaces')}
              >
                <AccessListItem
                  title={GENERAL_ROOM_LABEL}
                  icon={MessageSquare}
                  selected={activeRoomId === generalRoomId}
                  onClick={() => handleSelectRoom(generalRoomId)}
                />
                {accessibleBlockRooms.length === 0 ? (
                  <p className="px-1 text-xs text-slate-500">Sense sales de bloc accessibles.</p>
                ) : (
                  accessibleBlockRooms.map(({ room: blockRoom, block }) => (
                    <AccessListItem
                      key={blockRoom.id}
                      title={block.name || blockRoom.name}
                      subtitle="Sala de bloc"
                      icon={Layers}
                      selected={activeRoomId === blockRoom.id}
                      badge={unreadByBlockId[block.id]}
                      onClick={() => handleSelectRoom(blockRoom.id)}
                    />
                  ))
                )}
                {activeRoomId !== generalRoomId ? (
                  <Button asChild type="button" variant="ghost" size="sm" className="mt-1 h-7 w-full px-2 text-xs">
                    <Link href={buildProjectRoomHref(projectId, activeRoomId)} target="_blank">
                      <ExternalLink className="mr-1.5 h-3 w-3" />
                      Obrir sala completa
                    </Link>
                  </Button>
                ) : null}
              </CollapsibleSection>

              <CollapsibleSection
                title="Participants"
                count={participants.length}
                icon={Users}
                expanded={expandedSections.participants}
                onToggle={() => toggleSection('participants')}
              >
                <div className="space-y-2">
                  {participants.map((participant) => (
                    <div
                      key={participant.name}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                          {initials(participant.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {participant.name}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {participantRoleLabel(participant.name, project)}
                          </div>
                          {participant.department ? (
                            <div className="truncate text-[11px] text-slate-400">
                              {participant.department}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  )
}
