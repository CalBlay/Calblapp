import {
  eventOpsRoomAvatarLabel,
  eventOpsRoomsToSidebarItems,
} from '@/lib/messaging/channelSidebarItems'
import { parseEventComandaRoomId } from '@/lib/messaging/eventComandaChatIds'
import type { OpsWorkspaceConfig } from '@/lib/messaging/opsWorkspaceTypes'
import type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'
import { isComandaWarehouseChatActive } from '@/lib/eventComanda/batchStatus'

export function createEventOpsWorkspaceConfig(params: {
  eventId: string
  eventTitle: string
  rooms: EventOpsRoom[]
}): OpsWorkspaceConfig<EventOpsRoom> {
  const { eventId, eventTitle, rooms } = params

  const productionRooms = rooms.filter((room) => room.type === 'production')
  const comandaRooms = rooms.filter((room) => room.type === 'comanda')
  const productionUnread = productionRooms.reduce(
    (acc, room) => acc + Number(room.unreadCount || 0),
    0
  )
  const comandaUnread = comandaRooms.reduce(
    (acc, room) => acc + Number(room.unreadCount || 0),
    0
  )

  const filters = [
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
  ].filter(Boolean) as Array<{ key: string; label: string; badge?: number }>

  return {
    roomsUrl: `/api/events/${encodeURIComponent(eventId)}/ops/rooms`,
    contextTitle: eventTitle || 'Esdeveniment',
    sidebarEyebrow: 'Ops',
    sidebarDescription: 'Producció i comandes per magatzem',
    getSidebarEmptyMessage: (activeFilterKey) =>
      activeFilterKey === 'production'
        ? 'No tens accés al xat de producció.'
        : 'No hi ha comandes actives per aquest esdeveniment.',
    roomsToSidebarItems: eventOpsRoomsToSidebarItems,
    getVisibleRooms: (allRooms, activeFilterKey) => {
      if (!activeFilterKey) return allRooms
      return allRooms.filter((room) => room.type === activeFilterKey)
    },
    filters: filters.length > 1 ? filters : undefined,
    resolveInitialSelection: ({ rooms: allRooms, initialRoomId }) => {
      const target = initialRoomId
        ? allRooms.find((room) => room.roomId === initialRoomId) ||
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
        return { roomId: target.roomId, filterKey: target.type }
      }

      if (productionRooms.length > 0) {
        return { roomId: productionRooms[0]?.roomId || null, filterKey: 'production' }
      }

      if (comandaRooms.length > 0) {
        return { roomId: comandaRooms[0]?.roomId || null, filterKey: 'comanda' }
      }

      return { roomId: null }
    },
    getActiveLabel: (room) => room?.label || 'Ops esdeveniment',
    getTopSubtitle: (_room, contextTitle) => `Ops · ${contextTitle}`,
    getChannelSubtitle: (room, contextTitle) => {
      if (room?.type === 'comanda' && room.chatActive === false) {
        return 'Xat tancat — comanda enviada'
      }
      if (room?.type === 'comanda') return 'Comanda de magatzem'
      return `Ops · ${contextTitle}`
    },
    getAvatarText: (room, activeLabel) =>
      room ? eventOpsRoomAvatarLabel(room) : activeLabel.slice(0, 3),
    isChatClosed: (room) => room?.type === 'comanda' && room.chatActive === false,
    ensureRoom: async (room) => {
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
        return json.channelId
      }

      if (!room.warehouseId) throw new Error('Magatzem no vàlid.')

      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda/chat/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: room.warehouseId,
          batchId: room.batchId,
        }),
      })
      const json = (await res.json()) as { channelId?: string; error?: string }
      if (!res.ok || !json.channelId) {
        throw new Error(json.error || 'No s\'ha pogut obrir el xat de comanda.')
      }
      return json.channelId
    },
    addParticipant: async ({ room, channelId, user }) => {
      const res =
        room?.type === 'comanda' && room.warehouseId
          ? await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda/chat/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                warehouseId: room.warehouseId,
                batchId: room.batchId,
              }),
            })
          : await fetch(`/api/messaging/channels/${encodeURIComponent(channelId)}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id }),
            })

      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) throw new Error(json.error || 'No s\'ha pogut afegir el participant.')
      return { channelId: json.channelId }
    },
    removeParticipant: async ({ room, channelId, targetUserId }) => {
      const res =
        room?.type === 'comanda' && room.warehouseId
          ? await fetch(
              `/api/events/${encodeURIComponent(eventId)}/comanda/chat/members?userId=${encodeURIComponent(targetUserId)}&warehouseId=${encodeURIComponent(room.warehouseId)}&batchId=${encodeURIComponent(room.batchId || '')}`,
              { method: 'DELETE' }
            )
          : await fetch(
              `/api/messaging/channels/${encodeURIComponent(channelId)}/members?userId=${encodeURIComponent(targetUserId)}`,
              { method: 'DELETE' }
            )

      const json = (await res.json()) as { error?: string; channelId?: string }
      if (!res.ok) throw new Error(json.error || 'No s\'ha pogut treure el participant.')
      return { channelId: json.channelId }
    },
  }
}
