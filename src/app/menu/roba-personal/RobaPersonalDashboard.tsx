'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { normalizeRole } from '@/lib/roles'
import { ProductesPanel } from './ProductesPanel'
import type { TabId } from './robaPersonalTypes'
import { parseRobaTab } from './robaPersonalConstants'
import { RobaPersonalRequestNotificationsBanner } from './RobaPersonalRequestNotificationsBanner'
import { TreballadorsPanel } from './TreballadorsPanel'
import { EstocPanel } from './EstocPanel'
import { SollicitudsPanel } from './SollicitudsPanel'
import { EntreguesPanel } from './EntreguesPanel'
import { CompresPanel } from './CompresPanel'

export default function RobaPersonalDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const tabParam = searchParams.get('tab')
  const urlTab = parseRobaTab(tabParam)
  const requestIdFromUrl = String(searchParams.get('requestId') || '').trim()
  const deliveryIdFromUrl = String(searchParams.get('deliveryId') || '').trim()

  const sessionRoleNorm = normalizeRole((session?.user as { role?: string })?.role)
  const sessionDeptNorm = String((session?.user as { department?: string })?.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const isRobaFullUser =
    sessionRoleNorm === 'admin' || sessionDeptNorm === 'recursos humans'
  const isDeptLeadLimited =
    Boolean((session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead) &&
    !isRobaFullUser
  const isRobaWorkerSelf =
    Boolean(
      String(
        (session?.user as { robaLinkedPersonnelId?: string | null })?.robaLinkedPersonnelId || ''
      ).trim()
    ) &&
    !isRobaFullUser &&
    !isDeptLeadLimited
  /** Cap de roba: sol·licituds + entregues. Treballador: només entregues (pròpies, filtrades a l’API). */
  const isRobaDeptLeadTabs = isDeptLeadLimited

  const [tab, setTab] = useState<TabId>('productes')

  useEffect(() => {
    if (urlTab) setTab(urlTab)
  }, [urlTab])

  useEffect(() => {
    if (isRobaWorkerSelf) {
      if (tab === 'entregues') return
      setTab('entregues')
      const p = new URLSearchParams(searchParams.toString())
      p.set('tab', 'entregues')
      router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
      return
    }
    if (!isDeptLeadLimited) return
    if (tab === 'sollicituds' || tab === 'entregues') return
    setTab('sollicituds')
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', 'sollicituds')
    p.delete('requestId')
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }, [isRobaWorkerSelf, isDeptLeadLimited, tab, router, searchParams])

  const setRobaTab = (id: TabId) => {
    setTab(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', id)
    if (id !== 'entregues' && id !== 'sollicituds') p.delete('requestId')
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }

  const navigateEntregaForRequest = useCallback(
    (requestId: string) => {
      setTab('entregues')
      router.replace(
        `/menu/roba-personal?tab=entregues&requestId=${encodeURIComponent(requestId)}`,
        { scroll: false }
      )
    },
    [router]
  )

  const navigateDeliveryAck = useCallback(
    (deliveryId: string) => {
      setTab('entregues')
      router.replace(
        `/menu/roba-personal?tab=entregues&deliveryId=${encodeURIComponent(deliveryId)}`,
        { scroll: false }
      )
    },
    [router]
  )

  return (
    <div className="space-y-5 px-2 pb-8 sm:px-4">
      <RobaPersonalRequestNotificationsBanner
        onPrepareDelivery={navigateEntregaForRequest}
        onMaterialReady={navigateEntregaForRequest}
        onDeliveryAck={navigateDeliveryAck}
        onDeliveryRevised={navigateDeliveryAck}
        onDeliveryDispute={navigateDeliveryAck}
      />

      {!isRobaWorkerSelf ? (
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {(isRobaDeptLeadTabs
            ? ([
                ['sollicituds', 'Sol·licituds'],
                ['entregues', 'Entregues'],
              ] as const)
            : ([
                ['productes', 'Productes'],
                ['treballadors', 'Treballadors'],
                ['estoc', 'Estoc'],
                ['sollicituds', 'Sol·licituds'],
                ['entregues', 'Entregues'],
                ['compres', 'Compres'],
              ] as const)
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRobaTab(id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-semibold text-foreground">Entregues</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirmeu recepcions i consulteu l’historial.
          </p>
        </div>
      )}

      {tab === 'productes' && <ProductesPanel />}
      {tab === 'treballadors' && <TreballadorsPanel />}
      {tab === 'estoc' && <EstocPanel />}
      {tab === 'sollicituds' && (
        <SollicitudsPanel highlightRequestId={requestIdFromUrl} />
      )}
      {tab === 'entregues' && (
        <EntreguesPanel
          prefillRequestId={requestIdFromUrl}
          prefillDeliveryId={deliveryIdFromUrl}
        />
      )}
      {tab === 'compres' && <CompresPanel />}
    </div>
  )
}
