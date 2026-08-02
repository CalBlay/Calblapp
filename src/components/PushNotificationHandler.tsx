'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform?.()) return

    const handles: PluginListenerHandle[] = []

    const setup = async () => {
      const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const url = resolvePushUrl(event.notification?.data as Record<string, unknown> | undefined)
        router.push(url)
      })
      handles.push(actionHandle)

      const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification.data as Record<string, unknown> | undefined
        if (data?.foreground === 'false') return
        // En primer pla el sistema ja mostra la notificació nativa quan cal.
      })
      handles.push(receivedHandle)
    }

    void setup()

    return () => {
      for (const handle of handles) {
        void handle.remove()
      }
    }
  }, [router])

  return null
}
