'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { PluginListenerHandle } from '@capacitor/core'

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [error, setError] = useState<string | null>(null)
  const getIsNative = () => {
    if (typeof window === 'undefined') return false
    const cap = (window as any)?.Capacitor
    const platform = cap?.getPlatform?.() ?? Capacitor.getPlatform?.()
    if (platform === 'android' || platform === 'ios') return true
    if (platform === 'web') return false
    if (Capacitor.isNativePlatform?.()) return true
    if (platform === 'android' || platform === 'ios') return true
    if (cap?.Plugins?.PushNotifications) return true
    return false
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (getIsNative()) {
      setPermission('default')
      return
    }
    if (!('Notification' in window)) {
      setError('Aquest navegador no suporta notificacions push')
      return
    }
    setPermission(Notification.permission)
  }, [])

  const requestPermission = async () => {
    try {
      if (getIsNative()) {
        const res = await PushNotifications.requestPermissions()
        const granted = res.receive === 'granted'
        setPermission(granted ? 'granted' : 'denied')
        if (!granted) setError('Has de permetre les notificacions al mòbil')
        return granted ? 'granted' : 'denied'
      }
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('Notificacions no suportades')
      }
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setError('Has de permetre les notificacions al navegador')
      }
      return result
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (msg.toLowerCase().includes('not implemented')) {
        setError('Push no disponible: cal actualitzar l’app')
        return 'denied'
      }
      setError(err?.message || 'No s’ha pogut demanar permís')
      return 'denied'
    }
  }

  const subscribeUser = async (userId: string) => {
    try {
      if (getIsNative()) {
        const permission = await PushNotifications.checkPermissions()
        if (permission.receive !== 'granted') {
          const req = await PushNotifications.requestPermissions()
          if (req.receive !== 'granted') {
            throw new Error('Has de permetre les notificacions al mòbil')
          }
        }

        const token = await new Promise<string>((resolve, reject) => {
          let regHandle: PluginListenerHandle | null = null
          let errHandle: PluginListenerHandle | null = null

          const cleanup = () => {
            regHandle?.remove()
            errHandle?.remove()
          }

          void PushNotifications.addListener('registration', (token) => {
            cleanup()
            resolve(token.value)
          }).then((handle) => {
            regHandle = handle
          })

          void PushNotifications.addListener('registrationError', (error) => {
            cleanup()
            const message = error instanceof Error ? error.message : 'Error registrant push'
            reject(message)
          }).then((handle) => {
            errHandle = handle
          })

          PushNotifications.register()
        })

        const res = await fetch('/api/push/register-fcm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, token, platform: Capacitor.getPlatform() }),
        })
        if (!res.ok) throw new Error('Error activant notificacions natives')
        setPermission('granted')
        return true
      }
      if (typeof window === 'undefined') throw new Error('No window')
      if (!('serviceWorker' in navigator)) throw new Error('No SW disponible')

      let registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js')
      }
      if (!registration) throw new Error('No SW disponible')
      if (!registration.active) {
        registration = await navigator.serviceWorker.ready
      }
      if (!registration || !registration.pushManager) {
        throw new Error('Push no disponible en aquest dispositiu')
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        throw new Error('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY')
      }

      const convertedKey = urlBase64ToUint8Array(vapidKey)
      const existingSub = await registration.pushManager.getSubscription()
      const sub =
        existingSub ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        }))

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, subscription: sub }),
      })

      if (!res.ok) {
        throw new Error('Error enviant subscripció')
      }
      return true
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (msg.toLowerCase().includes('not implemented')) {
        setError('Push no disponible: cal actualitzar l’app')
        return false
      }
      setError(err?.message || 'Error activant notificacions')
      return false
    }
  }

  return { permission, error, requestPermission, subscribeUser }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}


