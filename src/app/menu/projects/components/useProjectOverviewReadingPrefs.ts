'use client'

import { useEffect, useState } from 'react'
import {
  PROJECT_OVERVIEW_READING_STORAGE_KEY,
  type ProjectOverviewReadingFont,
  type ProjectOverviewReadingScale,
} from './project-overview-reading'

type ReadingPrefs = {
  scale: ProjectOverviewReadingScale
  font: ProjectOverviewReadingFont
}

const DEFAULT_PREFS: ReadingPrefs = {
  scale: 'lg',
  font: 'sans',
}

function readStoredPrefs(): ReadingPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PROJECT_OVERVIEW_READING_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ReadingPrefs>
    return {
      scale:
        parsed.scale === 'sm' || parsed.scale === 'md' || parsed.scale === 'lg' || parsed.scale === 'xl'
          ? parsed.scale
          : DEFAULT_PREFS.scale,
      font: parsed.font === 'serif' ? 'serif' : 'sans',
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function useProjectOverviewReadingPrefs() {
  const [prefs, setPrefs] = useState<ReadingPrefs>(DEFAULT_PREFS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setPrefs(readStoredPrefs())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(PROJECT_OVERVIEW_READING_STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs, ready])

  return {
    scale: prefs.scale,
    font: prefs.font,
    setScale: (scale: ProjectOverviewReadingScale) => setPrefs((current) => ({ ...current, scale })),
    setFont: (font: ProjectOverviewReadingFont) => setPrefs((current) => ({ ...current, font })),
  }
}
