'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Loader2, X } from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import { chatTheme } from '@/components/messaging/chatTheme'
import OpsChannelsSidebar from '@/components/messaging/OpsChannelsSidebar'
import { canManageChannelParticipants, canShowChannelInvite } from '@/lib/messaging/channelChatPermissions'
import type { OpsWorkspaceConfig, OpsWorkspaceRoom } from '@/lib/messaging/opsWorkspaceTypes'
import ProjectRoomOpsChat from '@/app/menu/projects/components/ProjectRoomOpsChat'
import ChannelChatHeader from '@/components/messaging/ChannelChatHeader'
import ChannelParticipantsPanel, {
  type ChannelParticipantMember,
} from '@/components/messaging/ChannelParticipantsPanel'
import type { InviteUserOption } from '@/lib/messaging/userSearch'
import { normalizeRole } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type UserOption = {
  id: string
  name: string
  department?: string
  role?: string
}

type Props<TRoom extends OpsWorkspaceRoom> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: OpsWorkspaceConfig<TRoom>
  initialRoomId?: string | null
  initialChannelId?: string | null
}

export default function OpsWorkspacePanel<TRoom extends OpsWorkspaceRoom>({
  open,
  onOpenChange,
  config,
  initialRoomId = null,
  initialChannelId = null,
}: Props<TRoom>) {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const userRole = normalizeRole(session?.user?.role || '')
  const wasOpenRef = useRef(false)

  const { data, mutate, isLoading } = useSWR<{ rooms?: TRoom[] }>(
    open && config.roomsUrl ? config.roomsUrl : null,
    fetcher
  )

  const rooms = useMemo(() => (Array.isArray(data?.rooms) ? data.rooms : []), [data?.rooms])
  const filters = config.filters

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(filters?.[0]?.key ?? null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const [ensureCanManageMembers, setEnsureCanManageMembers] = useState<boolean | null>(null)
  const [ensureError, setEnsureError] = useState<string | null>(null)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [savingResponsible, setSavingResponsible] = useState(false)

  const visibleRooms = useMemo(
    () => config.getVisibleRooms(rooms, activeFilterKey),
    [activeFilterKey, config, rooms]
  )

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === activeRoomId) || null,
    [activeRoomId, rooms]
  )

  const sidebarItems = useMemo(
    () => config.roomsToSidebarItems(visibleRooms),
    [config, visibleRooms]
  )

  useEffect(() => {
    if (!open || !filters?.length) return
    const pool = config.getVisibleRooms(rooms, activeFilterKey)
    if (pool.length > 0) return
    const fallback = filters.find((filter) => config.getVisibleRooms(rooms, filter.key).length > 0)
    if (fallback) setActiveFilterKey(fallback.key)
  }, [activeFilterKey, config, filters, open, rooms])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      setActiveRoomId(null)
      setChannelId(null)
      setEnsureError(null)
      setEnsuring(false)
      setEnsureCanManageMembers(null)
      setParticipantsOpen(false)
      setActiveFilterKey(filters?.[0]?.key ?? null)
      return
    }

    if (visibleRooms.length === 0) {
      setActiveRoomId(null)
      return
    }

    if (activeRoomId && visibleRooms.some((room) => room.roomId === activeRoomId)) return

    setActiveRoomId(visibleRooms[0]?.roomId || null)
  }, [activeRoomId, filters, open, visibleRooms])

  useEffect(() => {
    if (!open || wasOpenRef.current) return
    wasOpenRef.current = true

    const selection = config.resolveInitialSelection?.({ rooms, initialRoomId })
    if (!selection?.roomId) return
    if (selection.filterKey) setActiveFilterKey(selection.filterKey)
    setActiveRoomId(selection.roomId)
  }, [config, initialRoomId, open, rooms])

  useEffect(() => {
    setParticipantsOpen(false)
    setEnsureCanManageMembers(null)
  }, [activeRoomId])

  const ensureRoom = useCallback(
    async (room: TRoom, options?: { blocking?: boolean }) => {
    const knownChannelId = room.channelId?.trim() || ''
    const channelReady = room.channelReady !== false
      const blocking = options?.blocking ?? (!knownChannelId || !channelReady)

      if (blocking) {
        setEnsuring(true)
        if (!knownChannelId || !channelReady) setChannelId(null)
      }
      setEnsureError(null)

      try {
        const result = await config.ensureRoom(room)
        if (!result) throw new Error('No s\'ha pogut obrir el xat.')
        const nextChannelId = typeof result === 'string' ? result : result.channelId
        const canManageFromEnsure =
          typeof result === 'object' ? result.canManageMembers : undefined
        if (canManageFromEnsure !== undefined) {
          setEnsureCanManageMembers(canManageFromEnsure)
        }
        if (!nextChannelId) throw new Error('No s\'ha pogut obrir el xat.')
        setChannelId(nextChannelId)
        void mutate()
        return nextChannelId
      } catch (error) {
        if (!knownChannelId) {
          setEnsureError(error instanceof Error ? error.message : 'No s\'ha pogut obrir el xat.')
        }
        return null
      } finally {
        if (blocking) setEnsuring(false)
      }
    },
    [config, mutate]
  )

  useEffect(() => {
    if (!open) return
    if (initialChannelId) setChannelId(initialChannelId)
  }, [initialChannelId, open])

  useEffect(() => {
    if (!open || !activeRoom) {
      setChannelId(null)
      return
    }

    const channelReady = activeRoom.channelReady !== false
    const knownChannelId =
      (channelReady ? activeRoom.channelId?.trim() : '') || initialChannelId?.trim() || ''
    if (knownChannelId) setChannelId(knownChannelId)
    void ensureRoom(activeRoom, { blocking: !knownChannelId || !channelReady })
  }, [activeRoom, ensureRoom, initialChannelId, open])

  const { data: membersData, mutate: refreshMembers } = useSWR(
    channelId ? `/api/messaging/channels/${channelId}/members` : null,
    fetcher
  )

  useEffect(() => {
    if (!open || !channelId || ensuring) return
    void refreshMembers()
  }, [channelId, ensuring, open, refreshMembers])

  const activeLabel = config.getActiveLabel(activeRoom)
  const topSubtitle = config.getTopSubtitle(activeRoom, config.contextTitle)
  const channelSubtitle = config.getChannelSubtitle(activeRoom, config.contextTitle)
  const avatarText = config.getAvatarText(activeRoom, activeLabel)
  const chatClosed = config.isChatClosed?.(activeRoom) ?? false

  const membersLoaded = membersData !== undefined
  const invitePermission = {
    channelId,
    apiCanManage: membersData?.canManageMembers,
    membersLoaded,
    hintCanManage: activeRoom?.canManageMembers || ensureCanManageMembers === true,
    actorUserId: userId,
    actorRole: userRole,
    responsibleUserId: membersData?.responsibleUserId ?? null,
  }
  const canInviteMembers = !chatClosed && canShowChannelInvite(invitePermission)
  const canManageParticipants = !chatClosed && canManageChannelParticipants(invitePermission)
  const canEditResponsible = !chatClosed && Boolean(membersData?.canEditResponsible)
  const canToggleVisibility = userRole === 'admin' || userRole === 'direccio'
  const channelMuted = Boolean(membersData?.viewer?.muted)
  const selfHidden = Boolean(membersData?.viewer?.hidden)

  const members = useMemo<ChannelParticipantMember[]>(
    () =>
      Array.isArray(membersData?.members)
        ? membersData.members.map((member: ChannelParticipantMember) => ({
            userId: String(member.userId || ''),
            userName: String(member.userName || ''),
            department: member.department,
            role: member.role,
            isResponsible: Boolean(member.isResponsible),
            canRemove: Boolean(member.canRemove),
          }))
        : [],
    [membersData?.members]
  )

  const { data: usersData } = useSWR<UserOption[]>(
    open && canInviteMembers ? '/api/users?view=project-options' : null,
    fetcher
  )

  const inviteUsers = useMemo<InviteUserOption[]>(() => {
    const users = Array.isArray(usersData) ? usersData : []
    const memberIds = new Set(members.map((member) => member.userId))
    return users
      .filter((user) => user.id && user.name && !memberIds.has(user.id))
      .map((user) => ({
        id: user.id,
        name: user.name,
        department: user.department,
        role: user.role,
      }))
  }, [members, usersData])

  const inviteExcludeIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members]
  )

  const updateResponsible = async (targetUserId: string) => {
    if (!channelId || !canEditResponsible) return
    setSavingResponsible(true)
    try {
      const res = await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/responsible`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error || 'No s\'ha pogut canviar el responsable.')
      }
      await refreshMembers()
    } catch (error) {
      toast({
        title: 'No s\'ha pogut canviar el responsable',
        description: error instanceof Error ? error.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSavingResponsible(false)
    }
  }

  const toggleMute = async () => {
    if (!channelId) return
    try {
      await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/mute`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: !channelMuted }),
      })
      await refreshMembers()
    } catch {
      toast({
        title: 'No s\'ha pogut actualitzar les notificacions',
        variant: 'destructive',
      })
    }
  }

  const toggleVisibility = async () => {
    if (!channelId || !canToggleVisibility) return
    try {
      await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !selfHidden }),
      })
      await refreshMembers()
    } catch {
      toast({
        title: 'No s\'ha pogut actualitzar la visibilitat',
        variant: 'destructive',
      })
    }
  }

  const addParticipant = async (user: InviteUserOption) => {
    if (!channelId || !user.id) return
    setAddingMember(true)
    try {
      const result = await config.addParticipant({ room: activeRoom, channelId, user })
      if (result.channelId) setChannelId(result.channelId)
      await Promise.all([refreshMembers(), mutate()])
      toast({ title: 'Participant afegit', description: user.name })
    } catch (error) {
      toast({
        title: 'No s\'ha pogut afegir',
        description: error instanceof Error ? error.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setAddingMember(false)
    }
  }

  const removeParticipant = async (targetUserId: string) => {
    if (!channelId) return
    setRemovingUserId(targetUserId)
    try {
      const result = await config.removeParticipant({ room: activeRoom, channelId, targetUserId })
      if (result.channelId) setChannelId(result.channelId)
      await Promise.all([refreshMembers(), mutate()])
      toast({ title: 'Participant eliminat' })
    } catch (error) {
      toast({
        title: 'No s\'ha pogut treure',
        description: error instanceof Error ? error.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        overlayClassName="pointer-events-none bg-slate-900/10"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-amber-100 p-0 shadow-2xl sm:max-w-4xl lg:max-w-6xl [&>button]:hidden"
      >
        <SheetTitle className="sr-only">{activeLabel}</SheetTitle>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
              {avatarText || initials(activeLabel)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{activeLabel}</div>
              <div className="truncate text-xs text-slate-500">{topSubtitle}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {channelId ? (
              <ChannelChatHeader
                showTitle={false}
                channelTitle={activeLabel}
                channelSubtitle={channelSubtitle}
                tone={chatClosed ? 'muted' : 'default'}
                channelMuted={channelMuted}
                onToggleMute={() => void toggleMute()}
                participantsOpen={participantsOpen}
                onToggleParticipants={() => setParticipantsOpen((current) => !current)}
                canInvite={canInviteMembers}
                inviteDisabled={canInviteMembers && !membersLoaded}
                inviteUsers={inviteUsers}
                inviteExcludeIds={inviteExcludeIds}
                onInvite={(user) => void addParticipant(user)}
                inviteAdding={addingMember}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <OpsChannelsSidebar
            className="hidden w-72 shrink-0 border-r lg:flex"
            eyebrow={config.sidebarEyebrow}
            description={config.sidebarDescription}
            items={sidebarItems}
            selectedId={activeRoomId}
            onSelect={setActiveRoomId}
            loading={isLoading}
            emptyMessage={config.getSidebarEmptyMessage(activeFilterKey)}
            filters={config.filters && config.filters.length > 1 ? config.filters : undefined}
            activeFilter={activeFilterKey || undefined}
            onFilterChange={setActiveFilterKey}
          />

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {config.filters && config.filters.length > 1 ? (
              <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-2 lg:hidden">
                <div className="flex flex-wrap gap-2">
                  {config.filters.map((filter) => {
                    const active = activeFilterKey === filter.key
                    return (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setActiveFilterKey(filter.key)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition',
                          active
                            ? chatTheme.sidebarChipActive
                            : 'border-slate-200 bg-white text-slate-600'
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          {filter.label}
                          {filter.badge && filter.badge > 0 ? (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] text-white">
                              {filter.badge}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {visibleRooms.length > 1 ? (
              <div className="border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={activeRoomId || ''}
                  onChange={(event) => setActiveRoomId(event.target.value)}
                >
                  {visibleRooms.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.label}
                      {room.unreadCount > 0 ? ` (${room.unreadCount})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {channelId && participantsOpen ? (
              <div className="shrink-0">
                <ChannelParticipantsPanel
                  members={members}
                  canManage={canManageParticipants}
                  onRemove={(targetUserId) => void removeParticipant(targetUserId)}
                  removingUserId={removingUserId}
                  canEditResponsible={canEditResponsible}
                  onSetResponsible={(targetUserId) => void updateResponsible(targetUserId)}
                  savingResponsible={savingResponsible}
                  canToggleVisibility={canToggleVisibility}
                  selfHidden={selfHidden}
                  onToggleVisibility={() => void toggleVisibility()}
                />
              </div>
            ) : null}

            <div className={cn('flex min-h-0 flex-1 flex-col', chatClosed ? 'bg-slate-50' : 'bg-white')}>
              {!channelId && (isLoading || ensuring) ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Obrint conversa…
                </div>
              ) : ensureError && !channelId ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm text-red-600">{ensureError}</p>
                  {activeRoom ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void ensureRoom(activeRoom, { blocking: true })}
                    >
                      Torna-ho a provar
                    </Button>
                  ) : null}
                </div>
              ) : channelId ? (
                <ProjectRoomOpsChat
                  channelId={channelId}
                  userId={userId}
                  embedded
                  consultOnly={chatClosed}
                />
              ) : !activeRoom ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                  {config.mainEmptyMessage || 'No tens cap sala Ops disponible.'}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                  Selecciona una sala per començar.
                </div>
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
