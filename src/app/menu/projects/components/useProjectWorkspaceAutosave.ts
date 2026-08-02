'use client'

import { useEffect, useRef, useState } from 'react'

export type WorkspaceAutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

type Params = {
  dirtyOverview: boolean
  dirtyBlocks: boolean
  savingOverview: boolean
  savingBlocks: boolean
  saveOverview: () => Promise<boolean>
  saveBlocks: () => Promise<boolean>
  enabled?: boolean
  delayMs?: number
}

export function useProjectWorkspaceAutosave({
  dirtyOverview,
  dirtyBlocks,
  savingOverview,
  savingBlocks,
  saveOverview,
  saveBlocks,
  enabled = true,
  delayMs = 2500,
}: Params) {
  const [status, setStatus] = useState<WorkspaceAutosaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (!dirtyOverview && !dirtyBlocks) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setStatus((current) => (current === 'saving' ? current : 'idle'))
      return
    }

    if (savingOverview || savingBlocks) return

    setStatus('pending')

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void (async () => {
        setStatus('saving')
        let ok = true

        if (dirtyOverview) {
          ok = (await saveOverview()) && ok
        }
        if (dirtyBlocks) {
          ok = (await saveBlocks()) && ok
        }

        setStatus(ok ? 'saved' : 'error')
      })()
    }, delayMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [delayMs, dirtyBlocks, dirtyOverview, enabled, saveBlocks, saveOverview, savingBlocks, savingOverview])

  return { autosaveStatus: status }
}
