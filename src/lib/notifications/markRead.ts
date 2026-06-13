export async function markNotificationRead(notificationId: string) {
  const id = String(notificationId || '').trim()
  if (!id) return

  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markRead', notificationId: id }),
  })
}

export async function markAllNotificationsRead(type: string) {
  const normalizedType = String(type || '').trim()
  if (!normalizedType) return

  await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead', type: normalizedType }),
  })
}
