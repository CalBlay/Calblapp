import { mutate } from 'swr'

const NOTIFICATIONS_SUMMARY_KEY = '/api/notifications/summary'
const NOTIFICATIONS_LIST_KEY = '/api/notifications?mode=list'

async function refreshNotificationCaches() {
  await Promise.allSettled([
    mutate(NOTIFICATIONS_SUMMARY_KEY),
    mutate(NOTIFICATIONS_LIST_KEY),
  ])
}

export async function markNotificationRead(notificationId: string) {
  const id = String(notificationId || '').trim()
  if (!id) return

  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markRead', notificationId: id }),
  })

  await refreshNotificationCaches()
}

export async function markAllNotificationsRead(type: string) {
  const normalizedType = String(type || '').trim()
  if (!normalizedType) return

  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead', type: normalizedType }),
  })

  await refreshNotificationCaches()
}
