'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import OpsWorkspacePanel from '@/components/messaging/OpsWorkspacePanel'
import type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'
import { createEventOpsWorkspaceConfig } from '@/lib/messaging/eventOpsWorkspace'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export type { EventOpsRoom } from '@/components/messaging/opsSidebarTypes'

type Props = {
  eventId: string
  eventTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRoomId?: string | null
  initialChannelId?: string | null
}

export default function EventOpsPanel({
  eventId,
  eventTitle,
  open,
  onOpenChange,
  initialRoomId = null,
  initialChannelId = null,
}: Props) {
  const { data } = useSWR<{ rooms?: EventOpsRoom[] }>(
    open && eventId ? `/api/events/${encodeURIComponent(eventId)}/ops/rooms` : null,
    fetcher
  )

  const rooms = useMemo(
    () => (Array.isArray(data?.rooms) ? data.rooms : []),
    [data?.rooms]
  )

  const config = useMemo(
    () => createEventOpsWorkspaceConfig({ eventId, eventTitle, rooms }),
    [eventId, eventTitle, rooms]
  )

  return (
    <OpsWorkspacePanel
      open={open}
      onOpenChange={onOpenChange}
      config={config}
      initialRoomId={initialRoomId}
      initialChannelId={initialChannelId}
    />
  )
}
