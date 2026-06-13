'use client'

import React, { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { normalizeRole } from '@/lib/roles'
import { robaTabUiPath } from '@/lib/robaPersonalPermissions'
import type { TabId } from './robaPersonalTypes'
import { parseRobaTab } from './robaPersonalConstants'

const tabLoadingFallback = () => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
    Carregant pestanya...
  </div>
)

const ProductesPanel = dynamic(
  () => import('./ProductesPanel').then((mod) => ({ default: mod.ProductesPanel })),
  { loading: tabLoadingFallback }
)
const TreballadorsPanel = dynamic(
  () => import('./TreballadorsPanel').then((mod) => ({ default: mod.TreballadorsPanel })),
  { loading: tabLoadingFallback }
)
const EstocPanel = dynamic(
  () => import('./EstocPanel').then((mod) => ({ default: mod.EstocPanel })),
  { loading: tabLoadingFallback }
)
const SollicitudsPanel = dynamic(
  () => import('./SollicitudsPanel').then((mod) => ({ default: mod.SollicitudsPanel })),
  { loading: tabLoadingFallback }
)
const EntreguesPanel = dynamic(
  () => import('./EntreguesPanel').then((mod) => ({ default: mod.EntreguesPanel })),
  { loading: tabLoadingFallback }
)
const CompresPanel = dynamic(
  () => import('./CompresPanel').then((mod) => ({ default: mod.CompresPanel })),
  { loading: tabLoadingFallback }
)
const RrhhInformesPanel = dynamic(
  () =>
    import('@/components/informes/domains/RrhhInformesPanel').then((mod) => ({
      default: mod.RrhhInformesPanel,
    })),
  { loading: tabLoadingFallback }
)

export default function RobaPersonalDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const tabParam = searchParams?.get('tab') ?? null
  const urlTab = parseRobaTab(tabParam)
  const requestIdFromUrl = String(searchParams?.get('requestId') || '').trim()
  const deliveryIdFromUrl = String(searchParams?.get('deliveryId') || '').trim()

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
  const isRobaDeptLeadTabs = isDeptLeadLimited

  const { canViewPath, ready: permsReady } = useUiPermissions()

  const roleTabDefs = useMemo((): ReadonlyArray<readonly [TabId, string]> => {
    if (isRobaWorkerSelf) {
      return [
        ['sollicituds', 'Sol·licituds'],
        ['entregues', 'Entregues'],
      ] as const
    }
    if (isRobaDeptLeadTabs) {
      return [
        ['sollicituds', 'Sol·licituds'],
        ['recollides', 'Recepcions'],
        ['entregues', 'Entregues'],
      ] as const
    }
    return [
      ['productes', 'Productes'],
      ['treballadors', 'Treballadors'],
      ['estoc', 'Estoc'],
      ['informes', 'Informes'],
      ['sollicituds', 'Sol·licituds'],
      ['preparacio', 'Preparació'],
      ['recollides', 'Recepcions'],
      ['entregues', 'Entregues'],
      ['compres', 'Compres'],
    ] as const
  }, [isRobaWorkerSelf, isRobaDeptLeadTabs])

  const visibleTabs = useMemo(() => {
    return roleTabDefs.filter(([id]) => {
      if (id === 'informes' && !isRobaFullUser) return false
      if (!permsReady) return true
      return canViewPath(robaTabUiPath(id))
    })
  }, [roleTabDefs, isRobaFullUser, permsReady, canViewPath])

  const [tab, setTab] = useState<TabId>('productes')

  useEffect(() => {
    if (urlTab) setTab(urlTab)
  }, [urlTab])

  useEffect(() => {
    if (!permsReady) return
    if (canViewPath(robaTabUiPath(tab))) return
    const fallback = visibleTabs[0]?.[0]
    if (!fallback) return
    setTab(fallback)
    const p = new URLSearchParams(searchParams?.toString() || '')
    p.set('tab', fallback)
    if (fallback !== 'entregues' && fallback !== 'sollicituds' && fallback !== 'preparacio' && fallback !== 'recollides') {
      p.delete('requestId')
      p.delete('deliveryId')
    }
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }, [permsReady, canViewPath, tab, visibleTabs, router, searchParams])

  useEffect(() => {
    if (isRobaWorkerSelf) {
      if (tab === 'sollicituds' || tab === 'entregues') return
      setTab('sollicituds')
      const p = new URLSearchParams(searchParams?.toString() || '')
      p.set('tab', 'sollicituds')
      router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
      return
    }
    if (!isDeptLeadLimited) return
    if (tab === 'sollicituds' || tab === 'recollides' || tab === 'entregues') return
    setTab('recollides')
    const p = new URLSearchParams(searchParams?.toString() || '')
    p.set('tab', 'recollides')
    p.delete('requestId')
    p.delete('deliveryId')
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }, [isRobaWorkerSelf, isDeptLeadLimited, tab, router, searchParams])

  const setRobaTab = (id: TabId) => {
    setTab(id)
    const p = new URLSearchParams(searchParams?.toString() || '')
    p.set('tab', id)
    if (
      id !== 'entregues' &&
      id !== 'sollicituds' &&
      id !== 'preparacio' &&
      id !== 'recollides'
    ) {
      p.delete('requestId')
      p.delete('deliveryId')
    }
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-5 px-2 pb-8 sm:px-4">
      {!isRobaWorkerSelf ? (
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {visibleTabs.map(([id, label]) => (
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
          {permsReady && visibleTabs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tens cap pestanya de Roba personal habilitada.
            </p>
          )}
        </div>
      ) : (
        <div className="border-b border-border pb-3">
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map(([id, label]) => (
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            Feu sol·licituds i confirmeu recepcions.
          </p>
        </div>
      )}

      {tab === 'productes' && (!permsReady || canViewPath(robaTabUiPath('productes'))) && (
        <ProductesPanel />
      )}
      {tab === 'treballadors' && (!permsReady || canViewPath(robaTabUiPath('treballadors'))) && (
        <TreballadorsPanel />
      )}
      {tab === 'estoc' && (!permsReady || canViewPath(robaTabUiPath('estoc'))) && <EstocPanel />}
      {tab === 'informes' &&
        isRobaFullUser &&
        (!permsReady || canViewPath(robaTabUiPath('informes'))) && <RrhhInformesPanel />}
      {tab === 'sollicituds' && (!permsReady || canViewPath(robaTabUiPath('sollicituds'))) && (
        <SollicitudsPanel mode="requests" highlightRequestId={requestIdFromUrl} />
      )}
      {tab === 'preparacio' && (!permsReady || canViewPath(robaTabUiPath('preparacio'))) && (
        <SollicitudsPanel mode="prepare" highlightRequestId={requestIdFromUrl} />
      )}
      {tab === 'recollides' && (!permsReady || canViewPath(robaTabUiPath('recollides'))) && (
        <SollicitudsPanel
          mode="pickup"
          highlightRequestId={requestIdFromUrl}
          highlightDeliveryId={deliveryIdFromUrl}
        />
      )}
      {tab === 'entregues' && (!permsReady || canViewPath(robaTabUiPath('entregues'))) && (
        <EntreguesPanel
          prefillRequestId={requestIdFromUrl}
          prefillDeliveryId={deliveryIdFromUrl}
        />
      )}
      {tab === 'compres' && (!permsReady || canViewPath(robaTabUiPath('compres'))) && <CompresPanel />}
    </div>
  )
}
