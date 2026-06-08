'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768
const LANES_MOBILE = 4
const LANES_DESKTOP_MIN = 6
const LANES_DESKTOP_MAX = 12

type Options = {
  mode: 'month' | 'week'
  weekCount?: number
}

function computeLanes(height: number, width: number, options: Options): number {
  if (width < MOBILE_BREAKPOINT) return LANES_MOBILE

  const chrome = 280
  const available = Math.max(0, height - chrome)

  if (options.mode === 'week') {
    const rowHeight = 48
    const padding = 120
    const lanes = Math.floor((available - padding) / rowHeight)
    return Math.min(LANES_DESKTOP_MAX, Math.max(LANES_DESKTOP_MIN, lanes))
  }

  const weeks = Math.max(1, options.weekCount ?? 5)
  const perWeek = available / weeks
  const laneHeight = 30
  const dayHeader = 70
  const lanes = Math.floor((perWeek - dayHeader) / laneHeight)
  return Math.min(LANES_DESKTOP_MAX, Math.max(LANES_DESKTOP_MIN, lanes))
}

export function useCalendarVisibleLanes(options: Options): number {
  const [lanes, setLanes] = useState(LANES_DESKTOP_MIN)

  useEffect(() => {
    const update = () => {
      setLanes(computeLanes(window.innerHeight, window.innerWidth, options))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [options.mode, options.weekCount])

  return lanes
}
