import type { Channel } from '@/app/menu/missatgeria/types'
import { eventDateLabel, initials, timeLabel } from '@/app/menu/missatgeria/utils'
import type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'
import type { OpsSidebarItem } from '@/components/messaging/opsSidebarTypes'

export function channelToSidebarItem(channel: Channel): OpsSidebarItem {
  const label =
    channel.source === 'events' || channel.source === 'event_comanda'
      ? channel.eventTitle || channel.location || channel.name
      : channel.source === 'projects'
        ? channel.roomName || channel.location || channel.name
        : channel.location

  const metaParts: Array<string | null | undefined> = []
  if (channel.source === 'events' || channel.source === 'event_comanda') {
    metaParts.push(
      channel.eventCode,
      channel.source === 'event_comanda' ? 'Comanda' : null,
      eventDateLabel(channel.eventStart || channel.eventEnd),
      channel.location
    )
  } else if (channel.source === 'projects') {
    metaParts.push(
      channel.projectName,
      channel.roomKind === 'block' ? 'Sala automatica' : 'Sala manual'
    )
  }

  const avatarSource =
    channel.roomName || channel.eventTitle || channel.location || channel.name

  return {
    id: channel.id,
    label,
    meta: metaParts.filter(Boolean).join(' · ') || null,
    preview: channel.lastMessagePreview || 'Sense missatges',
    timeLabel: channel.lastMessageAt ? timeLabel(channel.lastMessageAt) : null,
    unreadCount: channel.unreadCount,
    closed: channel.status === 'archived',
    avatarLabel: initials(avatarSource),
  }
}

export function eventOpsRoomToSidebarItem(room: EventOpsRoom): OpsSidebarItem {
  const meta =
    room.type === 'production'
      ? 'Xat de producció'
      : [room.warehouseName || room.warehouseCode, room.batchStatus]
          .filter(Boolean)
          .join(' · ') || 'Comanda de magatzem'

  return {
    id: room.roomId,
    label: room.label,
    meta,
    preview: null,
    avatarLabel: eventOpsRoomAvatarLabel(room),
    unreadCount: room.unreadCount,
    closed: room.chatActive === false,
  }
}

export function eventOpsRoomAvatarLabel(room: EventOpsRoom): string {
  if (room.type === 'production') {
    return initials('Producció')
  }

  const code = String(room.warehouseCode || '').trim()
  if (code) return code.slice(0, 3)

  const parts = room.label.split('·').map((segment) => segment.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (last) return last.slice(0, 3)
  }

  return initials(room.warehouseName || room.label)
}

export function channelsToSidebarItems(channels: Channel[]): OpsSidebarItem[] {
  return channels.map(channelToSidebarItem)
}

export function eventOpsRoomsToSidebarItems(rooms: EventOpsRoom[]): OpsSidebarItem[] {
  return rooms.map(eventOpsRoomToSidebarItem)
}
