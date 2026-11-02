import { initials } from '@/app/menu/missatgeria/utils'
import type { OpsWorkspaceConfig } from '@/lib/messaging/opsWorkspaceTypes'
import type { PreparationOpsRoom } from '@/lib/messaging/preparationOps.server'

export function createPreparationOpsWorkspaceConfig(params: {
  rowId: string
  eventTitle: string
  warehouse: string
}): OpsWorkspaceConfig<PreparationOpsRoom> {
  const { rowId, eventTitle, warehouse } = params
  const encodedRowId = encodeURIComponent(rowId)
  const encodedWarehouse = encodeURIComponent(warehouse)

  return {
    roomsUrl: `/api/logistics/${encodedRowId}/preparation-chat/rooms?warehouse=${encodedWarehouse}`,
    contextTitle: eventTitle || 'Preparació',
    sidebarEyebrow: 'Ops',
    sidebarDescription: 'Preparació per magatzem',
    getSidebarEmptyMessage: () => 'No s\'ha pogut carregar el xat de preparació.',
    mainEmptyMessage: 'No tens cap xat de preparació disponible.',
    roomsToSidebarItems: (rooms) => rooms.map((room) => ({
      id: room.roomId,
      label: room.label,
      meta: `Magatzem · ${room.warehouseName}`,
      unreadCount: room.unreadCount,
      avatarLabel: room.warehouseCode.slice(0, 3),
    })),
    getVisibleRooms: (rooms) => rooms,
    resolveInitialSelection: ({ rooms }) => ({ roomId: rooms[0]?.roomId || null }),
    getActiveLabel: (room) => room?.label || 'Xat de preparació',
    getTopSubtitle: (room) => `Ops · ${room?.warehouseName || warehouse}`,
    getChannelSubtitle: (room) =>
      `Preparador i Producció · ${room?.warehouseName || warehouse}`,
    getAvatarText: (room, activeLabel) =>
      room?.warehouseCode.slice(0, 3) || initials(activeLabel),
    ensureRoom: async () => {
      const response = await fetch(
        `/api/logistics/${encodedRowId}/preparation-chat/ensure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse }),
        }
      )
      const json = (await response.json().catch(() => ({}))) as {
        channelId?: string
        canManageChatMembers?: boolean
        error?: string
      }
      if (!response.ok || !json.channelId) {
        throw new Error(json.error || 'No s\'ha pogut obrir el xat de preparació.')
      }
      return {
        channelId: json.channelId,
        canManageMembers: json.canManageChatMembers,
      }
    },
    addParticipant: async ({ channelId, user }) => {
      const response = await fetch(
        `/api/messaging/channels/${encodeURIComponent(channelId)}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }
      )
      const json = (await response.json().catch(() => ({}))) as {
        channelId?: string
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'No s\'ha pogut afegir el participant.')
      return { channelId: json.channelId }
    },
    removeParticipant: async ({ channelId, targetUserId }) => {
      const response = await fetch(
        `/api/messaging/channels/${encodeURIComponent(channelId)}/members?userId=${encodeURIComponent(targetUserId)}`,
        { method: 'DELETE' }
      )
      const json = (await response.json().catch(() => ({}))) as {
        channelId?: string
        error?: string
      }
      if (!response.ok) throw new Error(json.error || 'No s\'ha pogut treure el participant.')
      return { channelId: json.channelId }
    },
  }
}
