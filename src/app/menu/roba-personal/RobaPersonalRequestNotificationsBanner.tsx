'use client'

import React, { useEffect, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import { Badge } from '@/components/ui/badge'
import type { DeliveryRow, RequestRow, RobaPersonalRequestNotification } from './robaPersonalTypes'
import { useRobaPersonalApiAccess } from '@/hooks/useRobaPersonalApiAccess'

const swrFetcher = (url: string) => fetch(url).then((r) => r.json())

function notificationKindLabel(type: string): string {
  if (type === 'roba_personal_sent_to_rrhh') return 'Preparació'
  if (type === 'roba_personal_request') return 'Recepció'
  if (type === 'roba_personal_ready') return 'Recepció'
  if (type === 'roba_personal_delivery_dispute') return 'Incidència'
  return 'Entrega'
}

function notificationKindVariant(
  type: string
): 'secondary' | 'warning' | 'success' | 'destructive' {
  if (type === 'roba_personal_delivery_dispute') return 'destructive'
  if (type === 'roba_personal_ready') return 'warning'
  if (type === 'roba_personal_delivery_ack' || type === 'roba_personal_delivery_revised') {
    return 'success'
  }
  return 'secondary'
}

function notificationHeadline(n: RobaPersonalRequestNotification): string {
  const type = String(n.type || '')
  if (type === 'roba_personal_sent_to_rrhh') {
    return 'Sol·licitud pendent de preparar'
  }
  if (type === 'roba_personal_request') return 'Nova sol·licitud del departament'
  if (type === 'roba_personal_ready') return 'Preparació pendent de validar'
  if (type === 'roba_personal_delivery_ack') return 'Recepció pendent de signar'
  if (type === 'roba_personal_delivery_revised') return 'Recepció corregida pendent'
  if (type === 'roba_personal_delivery_dispute') return 'Incidència pendent de revisar'
  return String(n.title || '').trim() || 'Notificació'
}

function notificationSummary(n: RobaPersonalRequestNotification): string {
  const type = String(n.type || '')
  const ref = String(n.reference || '').trim()
  const worker = String(n.requestedByWorkerName || '').trim()
  const dept = String(n.requestingDepartment || '').trim()
  if (type === 'roba_personal_delivery_dispute') {
    return [ref, 'revisar quantitats'].filter(Boolean).join(' · ')
  }
  if (type === 'roba_personal_delivery_ack') {
    return [ref, 'revisar i signar'].filter(Boolean).join(' · ')
  }
  if (type === 'roba_personal_delivery_revised') {
    return [ref, 'tornar a revisar i signar'].filter(Boolean).join(' · ')
  }
  return [ref, worker, dept].filter(Boolean).join(' · ')
}

export function RobaPersonalRequestNotificationsBanner({
  onOpenPreparation,
  onMaterialReady,
  onDeliveryAck,
  onDeliveryRevised,
  onDeliveryDispute,
  onWorkerPendingRequest,
}: {
  onOpenPreparation: (requestId: string) => void
  onMaterialReady: (requestId: string) => void
  /** Quan el responsable ha registrat l’entrega i el treballador ha de confirmar. */
  onDeliveryAck?: (deliveryId: string) => void
  /** Després de corregir línies d’entrega (mateixa navegació que ack). */
  onDeliveryRevised?: (deliveryId: string) => void
  /** Treballador ha reportat incidència (responsable). */
  onDeliveryDispute?: (deliveryId: string) => void
  onWorkerPendingRequest?: (requestId: string) => void
}) {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()
  const {
    isFullUser,
    isDeptLeadLimited,
    isWorkerSelf,
    canFetchRequests,
    canFetchDeliveries,
  } = useRobaPersonalApiAccess()

  const { data, mutate } = useSWR(userId ? '/api/notifications?mode=list' : null, swrFetcher)
  const { data: requestsData } = useSWR<RequestRow[]>(
    canFetchRequests ? '/api/roba-personal/requests' : null,
    swrFetcher
  )
  const { data: deliveriesData } = useSWR<DeliveryRow[]>(
    canFetchDeliveries ? '/api/roba-personal/deliveries' : null,
    swrFetcher
  )

  useEffect(() => {
    if (!userId) return
    const handler = () => {
      mutate().catch(() => {})
    }
    return subscribeToAblyEvent({
      channelName: `user:${userId}:notifications`,
      eventName: 'created',
      handler,
    })
  }, [userId, mutate])

  const notifications = useMemo(
    () =>
      (Array.isArray(data?.notifications) ? data.notifications : []).filter(
        (n: RobaPersonalRequestNotification) =>
          !n.read &&
          (String(n.type || '') === 'roba_personal_request' ||
            String(n.type || '') === 'roba_personal_sent_to_rrhh' ||
            String(n.type || '') === 'roba_personal_ready' ||
            String(n.type || '') === 'roba_personal_delivery_ack' ||
            String(n.type || '') === 'roba_personal_delivery_revised' ||
            String(n.type || '') === 'roba_personal_delivery_dispute')
      ),
    [data]
  )

  const visibleNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return []
    if (isWorkerSelf) {
      return notifications.filter((n) => {
        const dtype = String(n.type || '')
        if (dtype === 'roba_personal_delivery_ack' || dtype === 'roba_personal_delivery_revised') {
          const did = String(n.deliveryId || '').trim()
          return Array.isArray(deliveriesData)
            ? deliveriesData.some(
                (d) => String(d.id || '').trim() === did && d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
              )
            : false
        }
        if (dtype === 'roba_personal_ready') {
          const rid = String(n.requestId || '').trim()
          return Array.isArray(requestsData)
            ? requestsData.some((r) => {
                const status = String(r.status || '').trim()
                return String(r.id || '').trim() === rid && (status === 'ready_for_worker_delivery' || status === 'picked_up')
              })
            : false
        }
        return false
      })
    }
    return notifications
  }, [deliveriesData, isWorkerSelf, notifications, requestsData])

  const taskCount = useMemo(() => {
    const requests = Array.isArray(requestsData) ? requestsData : []
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : []

    if (isWorkerSelf) {
      const requestsPending = requests.filter(
        (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
      ).length
      const deliveriesPending = deliveries.filter(
        (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
      ).length
      return requestsPending + deliveriesPending
    }

    if (isDeptLeadLimited) {
      const requestsPending = requests.filter(
        (r) => r.status === 'submitted' || r.status === 'prepared'
      ).length
      const disputesPending = deliveries.filter((d) => d.workerReceiptCorrectionOpen === true).length
      return requestsPending + disputesPending
    }

    if (isFullUser) {
      const requestsPending = requests.filter((r) => r.status === 'sent_to_rrhh').length
      return requestsPending
    }

    return 0
  }, [deliveriesData, isDeptLeadLimited, isFullUser, isWorkerSelf, requestsData])

  const syntheticWorkerNotice = useMemo(() => {
    if (!isWorkerSelf || visibleNotifications.length > 0) return null
    const requests = Array.isArray(requestsData) ? requestsData : []
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : []
    const pendingRequest = requests.find(
      (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
    )
    if (pendingRequest) {
      return {
        headline: 'Recepció pendent de signar',
        summary: [String(pendingRequest.reference || '').trim(), 'revisar i signar']
          .filter(Boolean)
          .join(' · '),
      }
    }
    const pendingDelivery = deliveries.find(
      (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
    )
    if (pendingDelivery) {
      return {
        headline: 'Recepció pendent de signar',
        summary: [String(pendingDelivery.reference || '').trim(), 'revisar i signar']
          .filter(Boolean)
          .join(' · '),
      }
    }
    return null
  }, [deliveriesData, isWorkerSelf, requestsData, visibleNotifications.length])

  const openSyntheticWorkerNotice = () => {
    if (!isWorkerSelf) return
    const requests = Array.isArray(requestsData) ? requestsData : []
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : []
    const pendingRequest = requests.find(
      (r) => r.status === 'ready_for_worker_delivery' || r.status === 'picked_up'
    )
    if (pendingRequest?.id && onWorkerPendingRequest) {
      onWorkerPendingRequest(pendingRequest.id)
      return
    }
    const pendingDelivery = deliveries.find(
      (d) => d.workerReceiptAckExpected === true && !d.workerReceiptAckAt
    )
    if (pendingDelivery?.id && onDeliveryAck) {
      onDeliveryAck(pendingDelivery.id)
    }
  }

  const markRead = async (notificationId: string) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', notificationId }),
    })
    await mutate()
  }

  const openNotification = async (n: RobaPersonalRequestNotification) => {
    const dtype = String(n.type || '')
    if (dtype === 'roba_personal_delivery_ack') {
      const did = String(n.deliveryId || '').trim()
      if (!did || !onDeliveryAck) return
      await markRead(n.id)
      onDeliveryAck(did)
      return
    }
    if (dtype === 'roba_personal_delivery_revised') {
      const did = String(n.deliveryId || '').trim()
      const fn = onDeliveryRevised ?? onDeliveryAck
      if (!did || !fn) return
      await markRead(n.id)
      fn(did)
      return
    }
    if (dtype === 'roba_personal_delivery_dispute') {
      const did = String(n.deliveryId || '').trim()
      const fn = onDeliveryDispute ?? onDeliveryAck
      if (!did || !fn) return
      await markRead(n.id)
      fn(did)
      return
    }
    const rid = String(n.requestId || '').trim()
    if (!rid) return
    await markRead(n.id)
    if (dtype === 'roba_personal_ready') {
      onMaterialReady(rid)
    } else if (dtype === 'roba_personal_request' && isDeptLeadLimited) {
      onMaterialReady(rid)
    } else {
      onOpenPreparation(rid)
    }
  }

  if (!userId || (visibleNotifications.length === 0 && taskCount === 0)) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 shadow-sm dark:bg-slate-950/20 dark:border-slate-800">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
          Avisos de roba
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {taskCount} pendents
        </Badge>
      </div>
      {visibleNotifications.length > 0 ? (
      <div className="space-y-2">
        {visibleNotifications.slice(0, 8).map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={notificationKindVariant(String(n.type || ''))}>
                  {notificationKindLabel(String(n.type || ''))}
                </Badge>
                <button
                  type="button"
                  className="min-w-0 text-left font-medium text-foreground hover:text-indigo-700"
                  onClick={() => void openNotification(n)}
                >
                  <span className="block truncate">{notificationHeadline(n)}</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {notificationSummary(n) || 'Sense detall'}
              </p>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-indigo-600 transition hover:bg-indigo-100 dark:hover:bg-indigo-950/50"
              aria-label="Marcar com a llegit"
              onClick={() => void markRead(n.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      ) : syntheticWorkerNotice ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Entrega</Badge>
              <button
                type="button"
                className="min-w-0 text-left font-medium text-foreground hover:text-indigo-700"
                onClick={openSyntheticWorkerNotice}
              >
                {syntheticWorkerNotice.headline}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {syntheticWorkerNotice.summary || 'Revisar i signar'}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No hi ha avisos per llegir. Queden tasques pendents al flux.
        </p>
      )}
    </section>
  )
}
