import type { OpsSidebarFilter, OpsSidebarItem } from '@/components/messaging/opsSidebarTypes'
import type { InviteUserOption } from '@/lib/messaging/userSearch'

export type OpsWorkspaceRoom = {
  roomId: string
  label: string
  channelId: string
  unreadCount: number
  canManageMembers?: boolean
  /** false fins que el canal existeix a Firestore (no només ID previst). */
  channelReady?: boolean
}

export type OpsWorkspaceInitialSelection = {
  roomId: string | null
  filterKey?: string | null
}

export type OpsEnsureResult = string | { channelId: string; canManageMembers?: boolean }

export type OpsWorkspaceConfig<TRoom extends OpsWorkspaceRoom> = {
  roomsUrl: string | null
  contextTitle: string
  sidebarEyebrow: string
  sidebarDescription: string
  getSidebarEmptyMessage: (activeFilterKey: string | null) => string
  mainEmptyMessage?: string
  roomsToSidebarItems: (rooms: TRoom[]) => OpsSidebarItem[]
  getVisibleRooms: (rooms: TRoom[], activeFilterKey: string | null) => TRoom[]
  filters?: OpsSidebarFilter[]
  resolveInitialSelection?: (params: {
    rooms: TRoom[]
    initialRoomId: string | null
  }) => OpsWorkspaceInitialSelection
  getActiveLabel: (room: TRoom | null) => string
  getTopSubtitle: (room: TRoom | null, contextTitle: string) => string
  getChannelSubtitle: (room: TRoom | null, contextTitle: string) => string
  getAvatarText: (room: TRoom | null, activeLabel: string) => string
  isChatClosed?: (room: TRoom | null) => boolean
  ensureRoom: (room: TRoom) => Promise<OpsEnsureResult | null>
  addParticipant: (params: {
    room: TRoom | null
    channelId: string
    user: InviteUserOption
  }) => Promise<{ channelId?: string }>
  removeParticipant: (params: {
    room: TRoom | null
    channelId: string
    targetUserId: string
  }) => Promise<{ channelId?: string }>
}
