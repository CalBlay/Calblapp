'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Loader2, X } from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import { chatTheme } from '@/components/messaging/chatTheme'
import OpsChannelsSidebar from '@/components/messaging/OpsChannelsSidebar'
import type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'
import { eventOpsRoomsToSidebarItems, eventOpsRoomAvatarLabel } from '@/lib/messaging/channelSidebarItems'
import { canManageChannelParticipants, canShowChannelInvite } from '@/lib/messaging/channelChatPermissions'
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
import { parseEventComandaRoomId } from '@/lib/messaging/eventComandaChatIds'
import { isComandaWarehouseChatActive } from '@/lib/eventComanda/batchStatus'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'

type UserOption = {
  id: string
  name: string
  department?: string
  role?: string
}

type Props = {
  eventId: string
  eventTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRoomId?: string | null
}

export default function EventOpsPanel({
  eventId,
  eventTitle,
  open,
  onOpenChange,
  initialRoomId = null,
}: Props) {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const userRole = normalizeRole(session?.user?.role || '')
  const wasOpenRef = useRef(false)

  const { data, mutate, isLoading } = useSWR<{ rooms?: EventOpsRoom[] }>(
    open && eventId ? `/api/events/${encodeURIComponent(eventId)}/ops/rooms` : null,
    fetcher
  )

  const rooms = useMemo(
    () => (Array.isArray(data?.rooms) ? data.rooms : []),
    [data?.rooms]
  )

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [roomFilter, setRoomFilter] = useState<'production' | 'comanda'>('production')
  const [channelId, setChannelId] = useState<string | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const [ensureError, setEnsureError] = useState<string | null>(null)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [savingResponsible, setSavingResponsible] = useState(false)

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === activeRoomId) || null,
    [activeRoomId, rooms]
  )

  const productionRooms = useMemo(
    () => rooms.filter((room) => room.type === 'production'),
    [rooms]
  )
  const comandaRooms = useMemo(
    () => rooms.filter((room) => room.type === 'comanda'),
    [rooms]
  )

  const productionUnread = useMemo(
    () => productionRooms.reduce((acc, room) => acc + Number(room.unreadCount || 0), 0),
    [productionRooms]
  )
  const comandaUnread = useMemo(
    () => comandaRooms.reduce((acc, room) => acc + Number(room.unreadCount || 0), 0),
    [comandaRooms]
  )

  const visibleRooms = useMemo(
    () => rooms.filter((room) => room.type === roomFilter),
    [roomFilter, rooms]
  )

  const sidebarItems = useMemo(
    () => eventOpsRoomsToSidebarItems(visibleRooms),
    [visibleRooms]
  )

  const sidebarFilters = useMemo(
    () =>
      [
        productionRooms.length > 0
          ? {
              key: 'production',
              label: 'Producció',
              badge: productionUnread > 0 ? productionUnread : undefined,
            }
          : null,
        comandaRooms.length > 0
          ? {
              key: 'comanda',
              label: 'Comanda',
              badge: comandaUnread > 0 ? comandaUnread : undefined,
            }
          : null,
      ].filter(Boolean) as Array<{ key: string; label: string; badge?: number }>,
    [comandaRooms.length, comandaUnread, productionRooms.length, productionUnread]
  )

  useEffect(() => {
    if (!open) return
    if (roomFilter === 'production' && productionRooms.length === 0 && comandaRooms.length > 0) {
      setRoomFilter('comanda')
    }
  }, [comandaRooms.length, open, productionRooms.length, roomFilter])

  useEffect(() => {
    if (!open) return
    const pool = roomFilter === 'production' ? productionRooms : comandaRooms
    if (pool.length === 0) {
      setActiveRoomId(null)
      return
    }
    if (activeRoomId && pool.some((room) => room.roomId === activeRoomId)) return
    setActiveRoomId(pool[0]?.roomId || null)
  }, [activeRoomId, comandaRooms, open, productionRooms, roomFilter])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true

    const target = initialRoomId
      ? rooms.find((room) => room.roomId === initialRoomId) ||
        (() => {
          const parsed = parseEventComandaRoomId(initialRoomId)
          if (!parsed?.warehouseId || parsed.batchId) return null
          return (
            comandaRooms.find(
              (room) =>
                room.warehouseId === parsed.warehouseId &&
                isComandaWarehouseChatActive(room.batchStatus)
            ) ||
            comandaRooms.find((room) => room.warehouseId === parsed.warehouseId) ||
            null
          )
        })()
      : null
    if (target?.type === 'production' || target?.type === 'comanda') {
      setRoomFilter(target.type)
      setActiveRoomId(target.roomId)
      return
    }

    if (productionRooms.length > 0) {
      setRoomFilter('production')
      setActiveRoomId(productionRooms[0]?.roomId || null)
      return
    }

    if (comandaRooms.length > 0) {
      setRoomFilter('comanda')
      setActiveRoomId(comandaRooms[0]?.roomId || null)
    }
  }, [comandaRooms, initialRoomId, open, productionRooms, rooms])

  useEffect(() => {
    setParticipantsOpen(false)
  }, [activeRoomId])

  const ensureRoom = useCallback(async (room: EventOpsRoom) => {
    setEnsuring(true)
    setEnsureError(null)
    setChannelId(null)

    try {
      if (room.type === 'production') {
        const res = await fetch('/api/messaging/events/ensure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        })
        const json = (await res.json()) as { channelId?: string; error?: string }
        if (!res.ok || !json.channelId) {
          throw new Error(json.error || 'No s\'ha pogut obrir el xat de producció.')
        }
        setChannelId(json.channelId)
        return
      }

      if (!room.warehouseId) {
        throw new Error('Magatzem no vàlid.')
      }

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/comanda/chat/ensure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warehouseId: room.warehouseId,
            batchId: room.batchId,
          }),
        }
      )
      const json = (await res.json()) as { channelId?: string; error?: string }
      if (!res.ok || !json.channelId) {
        throw new Error(json.error || 'No s\'ha pogut obrir el xat de comanda.')
      }
      setChannelId(json.channelId)
    } catch (error) {
      setEnsureError(error instanceof Error ? error.message : 'No s\'ha pogut obrir el xat.')
    } finally {
      setEnsuring(false)
    }
  }, [eventId])

  useEffect(() => {
    if (!open || !activeRoom) return
    void ensureRoom(activeRoom)
  }, [activeRoom, ensureRoom, open])

  const { data: membersData, mutate: refreshMembers } = useSWR(
    channelId ? `/api/messaging/channels/${channelId}/members` : null,
    fetcher
  )

  const activeLabel = activeRoom?.label || 'Ops esdeveniment'
  const chatClosed = activeRoom?.type === 'comanda' && activeRoom.chatActive === false

  const membersLoaded = membersData !== undefined
  const invitePermission = {
    channelId,
    apiCanManage: membersData?.canManageMembers,
    membersLoaded,
    hintCanManage: activeRoom?.canManageMembers,
    actorUserId: userId,
    actorRole: userRole,
    responsibleUserId: membersData?.responsibleUserId ?? null,
  }
  const canInviteMembers =
    !chatClosed && canShowChannelInvite(invitePermission)
  const canManageParticipants =
    !chatClosed && canManageChannelParticipants(invitePermission)
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

  const channelSubtitle = useMemo(() => {
    if (chatClosed) return 'Xat tancat — comanda enviada'
    if (activeRoom?.type === 'comanda') return 'Comanda de magatzem'
    return `Ops · ${eventTitle || 'Esdeveniment'}`
  }, [activeRoom?.type, chatClosed, eventTitle])

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
      const res =
        activeRoom?.type === 'comanda' && activeRoom.warehouseId
          ? await fetch(
              `/api/events/${encodeURIComponent(eventId)}/comanda/chat/members`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: user.id,
                  warehouseId: activeRoom.warehouseId,
                  batchId: activeRoom.batchId,
                }),
              }
            )
          : await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id }),
            })

      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) {
        toast({
          title: 'No s\'ha pogut afegir',
          description: json.error || 'Error inesperat',
          variant: 'destructive',
        })
        return
      }
      if (json.channelId) setChannelId(json.channelId)
      await Promise.all([refreshMembers(), mutate()])
      toast({ title: 'Participant afegit', description: user.name })
    } catch {
      toast({
        title: 'No s\'ha pogut afegir',
        description: 'Error inesperat',
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
      const res =
        activeRoom?.type === 'comanda' && activeRoom.warehouseId
          ? await fetch(
              `/api/events/${encodeURIComponent(eventId)}/comanda/chat/members?userId=${encodeURIComponent(targetUserId)}&warehouseId=${encodeURIComponent(activeRoom.warehouseId)}&batchId=${encodeURIComponent(activeRoom.batchId || '')}`,
              { method: 'DELETE' }
            )
          : await fetch(
              `/api/messaging/channels/${encodeURIComponent(channelId)}/members?userId=${encodeURIComponent(targetUserId)}`,
              { method: 'DELETE' }
            )

      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) {
        toast({
          title: 'No s\'ha pogut treure',
          description: json.error || 'Error inesperat',
          variant: 'destructive',
        })
        return
      }
      if (json.channelId) setChannelId(json.channelId)
      await Promise.all([refreshMembers(), mutate()])
      toast({ title: 'Participant eliminat' })
    } catch {
      toast({
        title: 'No s\'ha pogut treure',
        description: 'Error inesperat',
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
              {activeRoom ? eventOpsRoomAvatarLabel(activeRoom) : initials(activeLabel)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{activeLabel}</div>
              <div className="truncate text-xs text-slate-500">
                Ops · {eventTitle || 'Esdeveniment'}
              </div>
            </div>
          </div>
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

        <div className="flex min-h-0 flex-1">
          <OpsChannelsSidebar
            className="hidden w-72 shrink-0 border-r lg:flex"
            eyebrow="Ops"
            description="Producció i comandes per magatzem"
            items={sidebarItems}
            selectedId={activeRoomId}
            onSelect={setActiveRoomId}
            loading={isLoading}
            emptyMessage={
              roomFilter === 'production'
                ? 'No tens accés al xat de producció.'
                : 'No hi ha comandes actives per aquest esdeveniment.'
            }
            filters={sidebarFilters.length > 1 ? sidebarFilters : undefined}
            activeFilter={roomFilter}
            onFilterChange={(key) => setRoomFilter(key as 'production' | 'comanda')}
          />

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {sidebarFilters.length > 1 ? (
              <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-2 lg:hidden">
                <div className="flex flex-wrap gap-2">
                  {sidebarFilters.map((filter) => {
                    const active = roomFilter === filter.key
                    return (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setRoomFilter(filter.key as 'production' | 'comanda')}
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

            {channelId ? (
              <div className="shrink-0">
                <ChannelChatHeader
                  channelTitle={activeLabel}
                  channelSubtitle={channelSubtitle}
                  avatarText={activeRoom ? eventOpsRoomAvatarLabel(activeRoom) : undefined}
                  tone={chatClosed ? 'muted' : 'default'}
                  channelMuted={channelMuted}
                  onToggleMute={toggleMute}
                  participantsOpen={participantsOpen}
                  onToggleParticipants={() => setParticipantsOpen((current) => !current)}
                  canInvite={canInviteMembers}
                  inviteDisabled={canInviteMembers && !membersLoaded}
                  inviteUsers={inviteUsers}
                  inviteExcludeIds={inviteExcludeIds}
                  onInvite={(user) => void addParticipant(user)}
                  inviteAdding={addingMember}
                />

                {participantsOpen ? (
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
                ) : null}
              </div>
            ) : null}

            <div className={cn('flex min-h-0 flex-1 flex-col', chatClosed ? 'bg-slate-50' : 'bg-white')}>
              {isLoading || ensuring ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Obrint conversa…
                </div>
              ) : ensureError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm text-red-600">{ensureError}</p>
                  {activeRoom ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void ensureRoom(activeRoom)}
                    >
                      Torna-ho a provar
                    </Button>
                  ) : null}
                </div>
              ) : !activeRoom ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                  No tens cap sala Ops disponible.
                </div>
              ) : channelId ? (
                <ProjectRoomOpsChat
                  channelId={channelId}
                  userId={userId}
                  embedded
                  consultOnly={chatClosed}
                />
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
