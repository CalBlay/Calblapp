export type OpsSidebarFilter = {
  key: string
  label: string
  badge?: number
}

export type OpsSidebarItem = {
  id: string
  label: string
  meta?: string | null
  preview?: string | null
  timeLabel?: string | null
  unreadCount?: number
  closed?: boolean
  avatarLabel?: string | null
}

export type EventOpsRoom = {
  roomId: string
  type: 'production' | 'comanda'
  label: string
  channelId: string
  unreadCount: number
  warehouseId?: string
  warehouseCode?: string
  warehouseName?: string
  canManageMembers?: boolean
  requesterUserName?: string | null
  batchStatus?: string
  batchId?: string
  chatActive?: boolean
}
