'use client'

import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { useCallback, useMemo } from 'react'
import { isUiPathAllowed, isUiPathBlocked } from '@/lib/uiPathAccess'

export type UiPermissionsResponse = {
  map: Record<string, boolean>
  edit?: Record<string, boolean>
  actions?: Record<string, boolean>
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  return (await res.json()) as UiPermissionsResponse
}

export function useUiPermissions() {
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  const { data, error, isLoading, mutate } = useSWR<UiPermissionsResponse>(
    userId ? '/api/permissions/ui' : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const map = useMemo(() => (data?.map || {}) as Record<string, boolean>, [data])
  const edit = useMemo(() => (data?.edit || {}) as Record<string, boolean>, [data])
  const actions = useMemo(() => (data?.actions || {}) as Record<string, boolean>, [data])

  const canViewPath = useCallback((path: string) => map[path] !== false, [map])
  const isPathBlocked = useCallback((path: string) => isUiPathBlocked(path, map), [map])
  const isPathAllowed = useCallback((path: string) => isUiPathAllowed(path, map), [map])
  const canEditPath = useCallback(
    (path: string) => map[path] !== false && edit[path] !== false,
    [map, edit]
  )
  const hasAction = useCallback((key: string) => actions[key] !== false, [actions])

  const ready = Boolean(userId) && !isLoading && !error && Boolean(data)

  return {
    uiMap: map,
    uiEdit: edit,
    uiActions: actions,
    ready,
    // Back-compat (some modules still destructure these names)
    map,
    edit,
    actions,
    canViewPath,
    canEditPath,
    hasAction,
    isPathBlocked,
    isPathAllowed,
    data,
    error,
    isLoading,
    mutate,
  }
}
