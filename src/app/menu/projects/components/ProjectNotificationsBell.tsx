'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'
import useSWR from 'swr'
import ModuleNotificationsBell, {
  useCloseModuleNotificationsBell,
} from '@/components/layout/ModuleNotificationsBell'
import NotificationListItem from '@/components/layout/NotificationListItem'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/markRead'

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

const PROJECT_NOTIFICATION_TYPES = [
  'project_assignment',
  'project_block_assignment',
  'project_task_assignment',
  'project_task_dependency_unlocked',
] as const

const fetchProjectNotifications = async (): Promise<ProjectNotification[]> => {
  const responses = await Promise.all(
    PROJECT_NOTIFICATION_TYPES.map(async (type) => {
      const response = await fetch(
        `/api/notifications?mode=list&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' }
      )
      return response.json().catch(() => ({ notifications: [] }))
    })
  )

  const notifications = responses.flatMap((payload) =>
    Array.isArray(payload?.notifications) ? payload.notifications : []
  ) as ProjectNotification[]

  const deduped = new Map<string, ProjectNotification>()
  notifications.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id || deduped.has(id)) return
    deduped.set(id, notification)
  })

  return [...deduped.values()].sort((a, b) => {
    const aCreatedAt = typeof (a as { createdAt?: unknown }).createdAt === 'number'
      ? Number((a as { createdAt?: unknown }).createdAt)
      : 0
    const bCreatedAt = typeof (b as { createdAt?: unknown }).createdAt === 'number'
      ? Number((b as { createdAt?: unknown }).createdAt)
      : 0
    return bCreatedAt - aCreatedAt
  })
}

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

  if (notification.type === 'project_task_dependency_unlocked') {
    const taskName =
      String(notification.taskName || '').trim() ||
      body.match(/tasca\s+(.+?)\s+(?:ja\s+)?disponible/i)?.[1]?.trim() ||
      'Tasca desbloquejada'
    const blockName =
      String(notification.blockName || '').trim() ||
      body.match(/bloc\s+(.+)$/i)?.[1]?.trim() ||
      ''
    return { primary: taskName, secondary: blockName, prefix: 'Desbloqueig' }
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
      notification.type === 'project_block_assignment' ||
      notification.type === 'project_task_dependency_unlocked'
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
  const { data, mutate } = useSWR('project-notifications', fetchProjectNotifications)

  const notifications = useMemo(
    () =>
      (Array.isArray(data) ? data : []).filter(
        (notification: ProjectNotification) =>
          !notification.read &&
          PROJECT_NOTIFICATION_TYPES.includes(
            String(notification.type || '') as (typeof PROJECT_NOTIFICATION_TYPES)[number]
          )
      ),
    [data]
  )

  const dismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
    await mutate()
  }

  const markAll = async () => {
    for (const type of PROJECT_NOTIFICATION_TYPES) {
      await markAllNotificationsRead(type)
    }
    await mutate()
  }

  return (
    <ModuleNotificationsBell
      title="Avisos de projectes"
      count={notifications.length}
      showWhenEmpty
      emptyMessage="Cap avís de projectes pendent"
      headerActions={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          onClick={() => void markAll()}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Marcar tot
        </button>
      }
    >
      <ProjectNotificationsBellItems notifications={notifications} onDismiss={dismiss} />
    </ModuleNotificationsBell>
  )
}
