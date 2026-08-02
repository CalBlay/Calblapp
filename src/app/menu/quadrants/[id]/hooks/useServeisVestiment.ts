'use client'

import { useEffect, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type { DriverCrewPremise } from '@/services/premises'
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
  driverCrews: DriverCrewPremise[]
}

export function useServeisVestiment({
  open,
  isServeis,
  event,
}: UseServeisVestimentParams): UseServeisVestimentResult {
  const [serveisVestimentModels, setServeisVestimentModels] = useState<string[]>([])
  const [vestimentModelChoice, setVestimentModelChoice] = useState<string>('__none__')
  const [driverCrews, setDriverCrews] = useState<DriverCrewPremise[]>([])

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
        const { vestimentModels: models, driverCrews: crews } = await loadDepartmentPremises('serveis')
        if (cancelled) return
        setServeisVestimentModels(models)
        setDriverCrews(crews)
      } catch {
        if (!cancelled) {
          setServeisVestimentModels([])
          setDriverCrews([])
        }
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
    driverCrews,
  }
}
