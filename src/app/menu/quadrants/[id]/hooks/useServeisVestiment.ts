'use client'

import { useEffect, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import { loadDepartmentPremises } from '../components/quadrantModalApi'

type UseServeisVestimentParams = {
  open: boolean
  isServeis: boolean
  event: QuadrantEvent
}

type UseServeisVestimentResult = {
  serveisVestimentModels: string[]
  vestimentModelChoice: string
  setVestimentModelChoice: React.Dispatch<React.SetStateAction<string>>
}

export function useServeisVestiment({
  open,
  isServeis,
  event,
}: UseServeisVestimentParams): UseServeisVestimentResult {
  const [serveisVestimentModels, setServeisVestimentModels] = useState<string[]>([])
  const [vestimentModelChoice, setVestimentModelChoice] = useState<string>('__none__')

  useEffect(() => {
    if (!open || !isServeis) return
    const draftVestimentRaw = String(
      (event as unknown as { draft?: { vestimentModel?: string | null } })?.draft?.vestimentModel ||
        ''
    ).trim()
    setVestimentModelChoice(draftVestimentRaw || '__none__')
    let cancelled = false
    ;(async () => {
      try {
        const { vestimentModels: models } = await loadDepartmentPremises('serveis')
        if (cancelled) return
        setServeisVestimentModels(models)
      } catch {
        if (!cancelled) setServeisVestimentModels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [event, open, isServeis])

  return {
    serveisVestimentModels,
    vestimentModelChoice,
    setVestimentModelChoice,
  }
}
