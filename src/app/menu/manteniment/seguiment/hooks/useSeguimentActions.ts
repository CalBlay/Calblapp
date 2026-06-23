'use client'

import { useCallback, useState } from 'react'
import type { Ticket, TicketStatus } from '@/app/menu/manteniment/tickets/types'
import type { CompletedRecord, Preventiu } from '../types'
import { normalizeStatus } from '../utils'

type Params = {
  loadData: (opts?: { silent?: boolean }) => Promise<void>
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>
}

export function useSeguimentActions({ loadData, setTickets }: Params) {
  const [validatingTicketId, setValidatingTicketId] = useState<string | null>(null)
  const [validatingPreventiuId, setValidatingPreventiuId] = useState<string | null>(null)

  const openPreventiu = useCallback((item: Preventiu) => {
    const url = item.recordId
      ? `/menu/manteniment/preventius/fulls/${encodeURIComponent(item.id)}?recordId=${encodeURIComponent(item.recordId)}`
      : `/menu/manteniment/preventius/fulls/${encodeURIComponent(item.id)}`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }, [])

  const handleCapValidateTicket = useCallback(
    async (ticket: Ticket) => {
      try {
        setValidatingTicketId(ticket.id)
        const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ validationApproval: 'cap' }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

        if (json?.ticket) {
          setTickets((current) =>
            current.map((item) =>
              item.id === ticket.id
                ? {
                    ...(json.ticket as Ticket),
                    status: normalizeStatus(json.ticket.status) as TicketStatus,
                  }
                : item
            )
          )
        }

        await loadData({ silent: true })
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "No s'ha pogut validar el ticket")
      } finally {
        setValidatingTicketId(null)
      }
    },
    [loadData, setTickets]
  )

  const handleValidatePreventiu = useCallback(
    async (item: Preventiu) => {
      const recordId = String(item.recordId || '').trim()
      if (!recordId) {
        window.alert('Aquest preventiu no te registre completat per validar.')
        return
      }

      try {
        setValidatingPreventiuId(item.id)

        const currentRes = await fetch(
          `/api/maintenance/preventius/completed/${encodeURIComponent(recordId)}`,
          { cache: 'no-store' }
        )
        const currentJson = await currentRes.json().catch(() => ({}))
        if (!currentRes.ok) {
          throw new Error(currentJson?.error || `HTTP ${currentRes.status}`)
        }

        const record = currentJson?.record as CompletedRecord | undefined
        const res = await fetch('/api/maintenance/preventius/completed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: recordId,
            plannedId: String(record?.plannedId || item.id || '').trim() || null,
            templateId: String(record?.templateId || '').trim() || null,
            title: String(record?.title || item.title || 'Preventiu'),
            worker: record?.worker || item.workerNames.join(', ') || null,
            startTime: String(record?.startTime || item.plannedStart || ''),
            endTime: String(record?.endTime || item.plannedEnd || ''),
            status: 'validat',
            notes: String(record?.notes || item.notes || ''),
            completedAt: record?.completedAt || item.completedAt || Date.now(),
            nextDue: null,
            checklist:
              record?.checklist && typeof record.checklist === 'object'
                ? record.checklist
                : item.checklist || {},
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

        await loadData({ silent: true })
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'No s ha pogut validar el preventiu')
      } finally {
        setValidatingPreventiuId(null)
      }
    },
    [loadData]
  )

  return {
    validatingTicketId,
    validatingPreventiuId,
    openPreventiu,
    handleCapValidateTicket,
    handleValidatePreventiu,
  }
}
