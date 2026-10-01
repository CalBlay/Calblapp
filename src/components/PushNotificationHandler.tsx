'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { PluginListenerHandle } from '@capacitor/core'

function resolvePushUrl(data: Record<string, unknown> | undefined): string {
  const raw = String(data?.url || data?.link || '/').trim()
  if (!raw || raw === '/') return '/menu'
  return raw.startsWith('/') ? raw : `/${raw}`
}

export default function PushNotificationHandler() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const userId = String(session?.user?.id || '').trim()

  useEffect(() => {
    if (!Capacitor.isNativePlatform?.()) return

    const handles: PluginListenerHandle[] = []
    let cancelled = false
    const trackHandle = (handle: PluginListenerHandle) => {
      if (cancelled) void handle.remove()
      else handles.push(handle)
    }

    const setup = async () => {
      const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const url = resolvePushUrl(event.notification?.data as Record<string, unknown> | undefined)
        router.push(url)
      })
      trackHandle(actionHandle)

      const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification.data as Record<string, unknown> | undefined
        if (data?.foreground === 'false') return
        // En primer pla el sistema ja mostra la notificació nativa quan cal.
      })
      trackHandle(receivedHandle)

      if (status !== 'authenticated' || !userId) return

      const permission = await PushNotifications.checkPermissions()
      if (permission.receive !== 'granted') return

      const registrationHandle = await PushNotifications.addListener('registration', async (token) => {
        if (cancelled || !token.value) return
        try {
          const response = await fetch('/api/push/register-fcm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              token: token.value,
              platform: Capacitor.getPlatform(),
            }),
          })
          if (!response.ok) {
            console.error('[PushNotificationHandler] FCM token sync failed', response.status)
          }
        } catch (error) {
          console.error('[PushNotificationHandler] FCM token sync failed', error)
        }
      })
      trackHandle(registrationHandle)

      const registrationErrorHandle = await PushNotifications.addListener(
        'registrationError',
        (error) => console.error('[PushNotificationHandler] FCM registration failed', error)
      )
      trackHandle(registrationErrorHandle)

      await PushNotifications.register()
    }

    void setup().catch((error) => {
      console.error('[PushNotificationHandler] setup failed', error)
    })

    return () => {
      cancelled = true
      for (const handle of handles) {
        void handle.remove()
      }
    }
  }, [router, status, userId])

  return null
}
