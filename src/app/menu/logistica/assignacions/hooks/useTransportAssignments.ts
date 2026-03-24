//file:/src/app/menu/logistica/assignacions/hooks/useTransportAssignments.ts
'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface AssignmentRow {
  id: string
  department?: string
  name?: string
  plate?: string
  vehicleType?: string
  startTime?: string
  arrivalTime?: string
  endTime?: string
  startDate?: string
  endDate?: string
}

export interface TransportAssignmentItem {
  eventCode: string
  day: string
  eventStartTime: string
  eventEndTime?: string
  eventName: string
  location: string
  pax: number
  status: 'draft' | 'confirmed'
  service?: string
  eventCodeAlias?: string
  rows?: AssignmentRow[]
}

interface TransportAssignmentItemInput
  extends Omit<Partial<TransportAssignmentItem>, 'rows'> {
  rows?: Array<Partial<AssignmentRow>>
}

export function useTransportAssignments(start: string, end: string) {
  const key = start && end ? `/api/transports/assignacions?start=${start}&end=${end}` : null
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, { revalidateOnFocus: false })

  return {
    items: ((data?.items || []) as TransportAssignmentItemInput[]).map(
      (item, itemIndex): TransportAssignmentItem => ({
        eventCode: item.eventCode || item.eventCodeAlias || '',
        day: item.day || '',
        eventStartTime: item.eventStartTime || '',
        eventEndTime: item.eventEndTime,
        eventName: item.eventName || '',
        location: item.location || '',
        pax: typeof item.pax === 'number' ? item.pax : 0,
        status: item.status === 'confirmed' ? 'confirmed' : 'draft',
        service: item.service,
        rows: Array.isArray(item.rows)
          ? item.rows.map((row, rowIndex) => ({
              id: row.id || `${item.eventCode || itemIndex}-${rowIndex}`,
              department: row.department,
              name: row.name,
              plate: row.plate,
              vehicleType: row.vehicleType,
              startTime: row.startTime,
              arrivalTime: row.arrivalTime,
              endTime: row.endTime,
              startDate: row.startDate,
              endDate: row.endDate,
            }))
          : [],
      })
    ),
    loading: isLoading,
    error,
    refetch: mutate,
  }
} 
