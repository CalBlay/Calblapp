'use client'

import { useEffect } from 'react'

/** Coalesces quadrant:created/updated into a single debounced dashboard reload. */
export function useQuadrantMutationListeners(
  reload: () => void | Promise<unknown>,
  debounceMs = 200
) {
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handler = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void reload()
      }, debounceMs)
    }

    window.addEventListener('quadrant:created', handler)
    window.addEventListener('quadrant:updated', handler)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('quadrant:created', handler)
      window.removeEventListener('quadrant:updated', handler)
    }
  }, [reload, debounceMs])
}
