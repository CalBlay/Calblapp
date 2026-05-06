'use client'

import { useState } from 'react'

export interface ToastOptions {
  title?: string
  description?: string
  duration?: number
  variant?: 'default' | 'destructive'
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastOptions[]>([])

  const toast = (options: ToastOptions) => {
    setToasts([...toasts, options])
    // Autoesborra el toast després del temps indicat
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t !== options))
    }, options.duration ?? 3000)

    if (options.variant === 'destructive') {
      console.error('❌', options.title || '', options.description || '')
    } else {
      console.log('✅', options.title || '', options.description || '')
    }
  }

  return { toast, toasts }
}

// Shortcut global (com a import directe)
export const toast = (options: ToastOptions) => {
  const msg = `${options.title ?? ''} ${options.description ?? ''}`
  if (options.variant === 'destructive') console.error('❌', msg)
  else console.log('✅', msg)
}
