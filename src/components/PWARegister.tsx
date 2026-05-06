'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean
    getPlatform?: () => string
  }
}

export default function PWARegister() {
  useEffect(() => {
    const windowWithCapacitor = typeof window !== 'undefined' ? (window as CapacitorWindow) : null
    const isNativeParam =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('native') === '1'
    const isNative =
      Capacitor.isNativePlatform?.() ||
      (windowWithCapacitor &&
        (windowWithCapacitor.Capacitor?.isNativePlatform?.() ||
          windowWithCapacitor.Capacitor?.getPlatform?.() === 'android' ||
          windowWithCapacitor.Capacitor?.getPlatform?.() === 'ios' ||
          navigator.userAgent.includes('Capacitor')))
    if (isNative || isNativeParam) return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          console.log('[PWA] Service Worker registrat')
        })
        .catch(err => {
          console.error('[PWA] Error registrant SW', err)
        })
    }
  }, [])

  return null
}
