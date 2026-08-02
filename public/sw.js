// Service Worker for Web Push (Cal Blay)

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch (err) {
      data = { title: event.data.text() }
    }
  }

  const title = data.title || 'Cal Blay'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/cb.svg',
    badge: data.badge || '/icons/cb.svg',
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/menu'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (!('focus' in client)) continue
        const clientUrl = String(client.url || '')
        if (clientUrl.includes(self.location.origin)) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.focus().then(() => client.navigate(targetUrl))
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      return undefined
    })
  )
})
