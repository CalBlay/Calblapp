'use client'

import React, { useEffect, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { subscribeToAblyEvent } from '@/lib/ablyClient'
import type { RobaPersonalRequestNotification } from './robaPersonalTypes'

const swrFetcher = (url: string) => fetch(url).then((r) => r.json())

/** Cos llegible per a avisos de sol·licitud (compatibilitat amb notificacions antigues sense cos ric). */
function formatRobaRequestNotificationBody(n: RobaPersonalRequestNotification): string {
  if (String(n.type || '') !== 'roba_personal_request') return String(n.body || '').trim()
  const rawBody = String(n.body || '').trim()
  if (rawBody.startsWith('Treballador:')) {
    return rawBody
  }
  const worker = String(n.requestedByWorkerName || '').trim()
  const dept = String(n.requestingDepartment || '').trim()
  const ref = String(n.reference || '').trim()
  const mat = String(n.linesSummary || '').trim()
  const tram = String(n.createdByUserName || '').trim()
  const parts: string[] = []
  if (worker) parts.push(`Treballador: ${worker}`)
  if (dept) parts.push(`Departament: ${dept}`)
  if (ref) parts.push(`Referència: ${ref}`)
  if (tram && tram !== worker) parts.push(`Tramitat per: ${tram}`)
  if (mat) parts.push(`Material: ${mat}`)
  else if (rawBody) parts.push(rawBody)
  return parts.join('\n')
}

export function RobaPersonalRequestNotificationsBanner({
  onPrepareDelivery,
  onMaterialReady,
  onDeliveryAck,
  onDeliveryRevised,
  onDeliveryDispute,
}: {
  onPrepareDelivery: (requestId: string) => void
  onMaterialReady: (requestId: string) => void
  /** Quan el responsable ha registrat l’entrega i el treballador ha de confirmar. */
  onDeliveryAck?: (deliveryId: string) => void
  /** Després de corregir línies d’entrega (mateixa navegació que ack). */
  onDeliveryRevised?: (deliveryId: string) => void
  /** Treballador ha reportat incidència (responsable). */
  onDeliveryDispute?: (deliveryId: string) => void
}) {
  const { data: session } = useSession()
  const userId = String((session?.user as { id?: string })?.id || '').trim()

  const { data, mutate } = useSWR(userId ? '/api/notifications?mode=list' : null, swrFetcher)

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
            String(n.type || '') === 'roba_personal_ready' ||
            String(n.type || '') === 'roba_personal_delivery_ack' ||
            String(n.type || '') === 'roba_personal_delivery_revised' ||
            String(n.type || '') === 'roba_personal_delivery_dispute')
      ),
    [data]
  )

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
    } else {
      onPrepareDelivery(rid)
    }
  }

  if (!userId || notifications.length === 0) return null

  return (
    <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-2.5 py-2 shadow-sm dark:bg-indigo-950/20 dark:border-indigo-900/50">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-800">
          Roba personal · Avisos
        </div>
        <div className="text-xs text-muted-foreground">{notifications.length} per llegir</div>
      </div>
      <div className="space-y-1">
        {notifications.slice(0, 8).map((n) => (
          <div
            key={n.id}
            className="flex min-h-9 items-start gap-2 rounded-md border border-border bg-background/80 px-2.5 py-2 text-sm"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left font-medium text-foreground hover:text-indigo-700 hover:underline"
              onClick={() => void openNotification(n)}
            >
              <span className="block leading-snug">{n.title || 'Notificació'}</span>
              {String(n.type || '') === 'roba_personal_request' ? (
                <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                  {formatRobaRequestNotificationBody(n) || 'Sense detall'}
                </span>
              ) : n.body ? (
                <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground whitespace-normal break-words">
                  {n.body}
                </span>
              ) : null}
            </button>
            <span className="shrink-0 text-[10px] text-muted-foreground hidden sm:inline">
              {String(n.type || '') === 'roba_personal_delivery_ack' ||
              String(n.type || '') === 'roba_personal_delivery_revised'
                ? 'Entrega'
                : String(n.type || '') === 'roba_personal_delivery_dispute'
                  ? 'Incidència'
                  : 'Entregues'}
            </span>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-indigo-600 transition hover:bg-indigo-100 dark:hover:bg-indigo-950/50"
              aria-label="Marcar com a llegit"
              onClick={() => void markRead(n.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
