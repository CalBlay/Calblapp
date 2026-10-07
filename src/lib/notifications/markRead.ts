import { mutate } from 'swr'

const NOTIFICATIONS_SUMMARY_KEY = '/api/notifications/summary'
const NOTIFICATIONS_LIST_KEY = '/api/notifications?mode=list'

async function refreshNotificationCaches() {
  await Promise.allSettled([
    mutate(NOTIFICATIONS_SUMMARY_KEY),
    mutate(NOTIFICATIONS_LIST_KEY),
  ])
}

async function ensureSuccessfulResponse(response: Response) {
  if (response.ok) return
  const payload = await response.json().catch(() => null)
  throw new Error(payload?.error || `No s'han pogut actualitzar els avisos (${response.status})`)
}

export async function markNotificationRead(notificationId: string) {
  const id = String(notificationId || '').trim()
  if (!id) return

  const response = await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markRead', notificationId: id }),
  })
  await ensureSuccessfulResponse(response)

  await refreshNotificationCaches()
}

export async function markAllNotificationsRead(type: string | Iterable<string>) {
  const rawTypes = typeof type === 'string' ? [type] : [...type]
  const types = [...new Set(rawTypes.map((value) => String(value || '').trim()).filter(Boolean))]
  if (types.length === 0) return

  const response = await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead', types }),
  })
  await ensureSuccessfulResponse(response)

  await refreshNotificationCaches()
}
