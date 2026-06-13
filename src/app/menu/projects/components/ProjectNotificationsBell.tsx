'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markNotificationRead } from '@/lib/notifications/markRead'

type ProjectNotification = {
  id: string
  title?: string
  body?: string
  type?: string
  read?: boolean
  projectId?: string
  projectName?: string
  blockId?: string
  blockName?: string
  taskId?: string
  taskName?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function extractNotificationLabel(notification: ProjectNotification) {
  const body = String(notification.body || '')

  if (notification.type === 'project_task_assignment') {
    const taskName =
      String(notification.taskName || '').trim() ||
      body.match(/tasca\s+(.+?)\s+del bloc/i)?.[1]?.trim() ||
      'Tasca'
    const blockName =
      String(notification.blockName || '').trim() ||
      body.match(/bloc\s+(.+)$/i)?.[1]?.trim() ||
      ''
    return { primary: taskName, secondary: blockName, prefix: 'Tasca' }
  }

  if (notification.type === 'project_block_assignment') {
    const blockName =
      String(notification.blockName || '').trim() ||
      body.match(/bloc\s+(.+?)\s+del projecte/i)?.[1]?.trim() ||
      'Bloc'
    const projectName =
      String(notification.projectName || '').trim() ||
      body.match(/projecte\s+(.+)$/i)?.[1]?.trim() ||
      ''
    return { primary: blockName, secondary: projectName, prefix: 'Bloc' }
  }

  const projectName =
    String(notification.projectName || '').trim() ||
    body.split('projecte:').pop()?.trim() ||
    'Projecte'
  return { primary: projectName, secondary: '', prefix: 'Projecte' }
}

function ProjectNotificationsBellItems({
  notifications,
  onDismiss,
}: {
  notifications: ProjectNotification[]
  onDismiss: (notificationId: string) => Promise<void>
}) {
  const router = useRouter()
  const closeBell = useCloseModuleNotificationsBell()

  const openNotification = (notification: ProjectNotification) => {
    const projectId = String(notification.projectId || '').trim()
    if (!projectId) return

    closeBell?.()

    if (
      notification.type === 'project_task_assignment' ||
      notification.type === 'project_block_assignment'
    ) {
      router.push(`/menu/projects/${projectId}?tab=tasks`)
      return
    }

    router.push(`/menu/projects/${projectId}`)
  }

  return (
    <>
      {notifications.slice(0, 12).map((notification: ProjectNotification) => {
        const label = extractNotificationLabel(notification)
        return (
          <NotificationListItem
            key={notification.id}
            prefix={
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                {label.prefix}
              </span>
            }
            primary={label.primary}
            secondary={label.secondary || undefined}
            detail={!label.secondary ? notification.title || undefined : undefined}
            onOpen={() => openNotification(notification)}
            onDismiss={async () => {
              await onDismiss(notification.id)
            }}
          />
        )
      })}
    </>
  )
}

export default function ProjectNotificationsBell() {
  const { data, mutate } = useSWR('/api/notifications?mode=list', fetcher)

  const notifications = useMemo(
    () =>
      (Array.isArray(data?.notifications) ? data.notifications : []).filter(
        (notification: ProjectNotification) =>
          !notification.read &&
          [
            'project_assignment',
            'project_block_assignment',
            'project_task_assignment',
          ].includes(String(notification.type || ''))
      ),
    [data]
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  return (
    <ModuleNotificationsBell title="Avisos de projectes" count={notifications.length}>
      <ProjectNotificationsBellItems notifications={notifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
