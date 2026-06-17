import { initials } from '@/app/menu/missatgeria/utils'
import { maintenanceTicketOpsRoomsToSidebarItems } from '@/lib/messaging/channelSidebarItems'
import type { MaintenanceTicketOpsRoom } from '@/lib/messaging/maintenanceTicketOps.server'
import type { OpsWorkspaceConfig } from '@/lib/messaging/opsWorkspaceTypes'

export function createMaintenanceOpsWorkspaceConfig(): OpsWorkspaceConfig<MaintenanceTicketOpsRoom> {
  return {
    roomsUrl: '/api/maintenance/tickets/ops/rooms',
    contextTitle: 'Manteniment',
    sidebarEyebrow: 'Ops',
    sidebarDescription: 'Tickets nous sense planificar',
    getSidebarEmptyMessage: () => 'No hi ha tickets nous amb xat actiu.',
    mainEmptyMessage: 'No hi ha cap ticket nou amb xat actiu.',
    roomsToSidebarItems: maintenanceTicketOpsRoomsToSidebarItems,
    getVisibleRooms: (rooms) => rooms,
    resolveInitialSelection: ({ rooms, initialRoomId }) => ({
      roomId:
        (initialRoomId && rooms.find((room) => room.roomId === initialRoomId)?.roomId) ||
        rooms[0]?.roomId ||
        null,
    }),
    getActiveLabel: (room) => room?.ticketLabel || 'Ticket',
    getTopSubtitle: (room) =>
      room?.creatorName ? `Ops · ${room.creatorName}` : 'Ops · Ticket de manteniment',
    getChannelSubtitle: (room) =>
      room?.creatorName ? `Ops · ${room.creatorName}` : 'Ops · Ticket de manteniment',
    getAvatarText: (room, activeLabel) => initials(room?.ticketLabel || activeLabel),
    ensureRoom: async (room) => {
      const res = await fetch(
        `/api/maintenance/tickets/${encodeURIComponent(room.ticketId)}/ops/ensure`,
        { method: 'POST' }
      )
      const json = (await res.json()) as {
        channelId?: string
        canManageChatMembers?: boolean
        error?: string
      }
      if (!res.ok || !json.channelId) {
        throw new Error(json.error || 'No s\'ha pogut obrir el xat del ticket.')
      }
      return {
        channelId: json.channelId,
        canManageMembers: json.canManageChatMembers,
      }
    },
    addParticipant: async ({ channelId, user }) => {
      const res = await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) throw new Error(json.error || 'No s\'ha pogut afegir el participant.')
      return { channelId: json.channelId }
    },
    removeParticipant: async ({ channelId, targetUserId }) => {
      const res = await fetch(
        `/api/messaging/channels/${encodeURIComponent(channelId)}/members?userId=${encodeURIComponent(targetUserId)}`,
        { method: 'DELETE' }
      )
      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) throw new Error(json.error || 'No s\'ha pogut treure el participant.')
      return { channelId: json.channelId }
    },
  }
}
