'use client'

import useSWR from 'swr'
import { useMemo } from 'react'
import {
  DEFAULT_TRANSPORT_TYPE_DEFINITIONS,
  type TransportTypeDefinition,
} from '@/lib/transportTypes'

type TransportTypesResponse = { types?: TransportTypeDefinition[] }

const fetcher = async (url: string): Promise<TransportTypesResponse> => {
  const response = await fetch(url, { cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as TransportTypesResponse & {
    error?: string
  }
  if (!response.ok) throw new Error(body.error || 'No s’han pogut carregar els tipus de vehicle.')
  return body
}

export function useTransportTypes(includeInactive = false) {
  const url = includeInactive ? '/api/transport-types?includeInactive=1' : '/api/transport-types'
  const { data, error, isLoading, mutate } = useSWR<TransportTypesResponse>(url, fetcher, {
    revalidateOnFocus: false,
  })
  const types = useMemo(
    () =>
      Array.isArray(data?.types)
        ? data.types
        : DEFAULT_TRANSPORT_TYPE_DEFINITIONS.filter((type) => includeInactive || type.active),
    [data?.types, includeInactive]
  )

  return {
    data: types,
    error: error instanceof Error ? error.message : null,
    loading: isLoading,
    refetch: mutate,
  }
}
