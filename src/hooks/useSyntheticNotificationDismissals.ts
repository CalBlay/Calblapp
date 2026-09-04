'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

export type SyntheticDismissalScope = 'incidents' | 'roba_personal'

const LEGACY_STORAGE_KEYS: Record<SyntheticDismissalScope, string> = {
  incidents: 'incident-dismissed-synthetic-notifications',
  roba_personal: 'roba-personal-dismissed-synthetic-notifications',
}

type DismissalsPayload = { ids?: string[] }

const normalizeIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))]
    : []

const fetcher = async (url: string): Promise<DismissalsPayload> => {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(payload?.error || 'Error carregant avisos descartats'))
  return payload
}

async function persistDismissals(scope: SyntheticDismissalScope, ids: string[]) {
  const response = await fetch('/api/notifications/synthetic-dismissals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, ids }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(payload?.error || 'Error desant avisos descartats'))
}

export function useSyntheticNotificationDismissals(scope: SyntheticDismissalScope) {
  const key = `/api/notifications/synthetic-dismissals?scope=${scope}`
  const { data, mutate } = useSWR<DismissalsPayload>(key, fetcher)
  const [legacyIds, setLegacyIds] = useState<string[]>([])
  const migratedRef = useRef(false)

  const serverIds = useMemo(() => normalizeIds(data?.ids), [data?.ids])
  const dismissedIds = useMemo(
    () => [...new Set([...serverIds, ...legacyIds])],
    [legacyIds, serverIds]
  )

  useEffect(() => {
    if (migratedRef.current || data === undefined || typeof window === 'undefined') return
    migratedRef.current = true
    const storageKey = LEGACY_STORAGE_KEYS[scope]
    let localIds: string[] = []
    try {
      localIds = normalizeIds(JSON.parse(window.localStorage.getItem(storageKey) || '[]'))
    } catch {
      localIds = []
    }
    if (localIds.length === 0) return

    setLegacyIds(localIds)
    void persistDismissals(scope, localIds)
      .then(async () => {
        window.localStorage.removeItem(storageKey)
        setLegacyIds([])
        await mutate()
      })
      .catch(() => {})
  }, [data, mutate, scope])

  const dismiss = useCallback(
    async (ids: string[]) => {
      const normalized = normalizeIds(ids)
      if (normalized.length === 0) return
      const optimisticIds = [...new Set([...dismissedIds, ...normalized])]
      await mutate({ ids: optimisticIds }, { revalidate: false })
      try {
        await persistDismissals(scope, normalized)
      } finally {
        await mutate()
      }
    },
    [dismissedIds, mutate, scope]
  )

  return { dismissedIds, dismiss }
}
