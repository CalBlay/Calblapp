'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { normalizeRole } from '@/lib/roles'
import { robaTabUiPath } from '@/lib/robaPersonalPermissions'
import type { RobaOperationalSummary, TabId } from './robaPersonalTypes'
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
  const { data: session, status: sessionStatus } = useSession()
  const tabParam = searchParams?.get('tab') ?? null
  const urlTab = parseRobaTab(tabParam)
  const requestIdFromUrl = String(searchParams?.get('requestId') || '').trim()
  const deliveryIdFromUrl = String(searchParams?.get('deliveryId') || '').trim()

  const sessionRoleNorm = normalizeRole((session?.user as { role?: string })?.role)
  const { canViewPath, ready: permsReady, data: uiPermissionData } = useUiPermissions()
  const effectiveDepartment = String(
    uiPermissionData?.profile?.department ??
      (session?.user as { department?: string })?.department ??
      ''
  )
  const sessionDeptNorm = effectiveDepartment
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const isRobaFullUser =
    sessionRoleNorm === 'admin' || sessionDeptNorm === 'recursos humans'
  const isDeptLeadLimited =
    Boolean(
      uiPermissionData?.profile?.isDepartmentRobaLead ??
        (session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead
    ) &&
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

  const visibleTabIds = useMemo(() => new Set(visibleTabs.map(([id]) => id)), [visibleTabs])

  const tabGroups = useMemo(() => {
    const operationalIds = new Set<TabId>([
      'sollicituds',
      'preparacio',
      'recollides',
      'entregues',
    ])
    return [
      {
        id: 'operativa',
        label: isRobaWorkerSelf ? 'La meva roba' : 'Operativa',
        tabs: visibleTabs.filter(([id]) => operationalIds.has(id)),
      },
      {
        id: 'gestio',
        label: 'Gestió',
        tabs: visibleTabs.filter(([id]) => !operationalIds.has(id)),
      },
    ].filter((group) => group.tabs.length > 0)
  }, [visibleTabs, isRobaWorkerSelf])

  const [tab, setTab] = useState<TabId>('productes')
  const [operationalSummary, setOperationalSummary] = useState<RobaOperationalSummary | null>(null)

  const handleOperationalSummaryChange = useCallback((summary: RobaOperationalSummary) => {
    setOperationalSummary(summary)
  }, [])

  const operationalCards = useMemo(() => {
    if (!operationalSummary || isRobaWorkerSelf) return []
    const cards: Array<{ tab: TabId; label: string; value: number; tone: string }> = [
      {
        tab: 'recollides',
        label: isDeptLeadLimited ? 'Per enviar a RRHH' : 'Noves sol·licituds',
        value: operationalSummary.submitted,
        tone: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100',
      },
      {
        tab: 'preparacio',
        label: 'Per preparar',
        value: operationalSummary.sentToRrhh,
        tone: 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100',
      },
      {
        tab: 'recollides',
        label: 'Per recollir',
        value: operationalSummary.prepared,
        tone: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
      },
      {
        tab: 'entregues',
        label: 'Per entregar',
        value: operationalSummary.readyForDelivery,
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
      },
      {
        tab: 'recollides',
        label: 'Incidències',
        value: operationalSummary.disputes,
        tone: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100',
      },
    ]
    return cards.filter((card) => visibleTabIds.has(card.tab))
  }, [operationalSummary, isRobaWorkerSelf, isDeptLeadLimited, visibleTabIds])

  useEffect(() => {
    if (urlTab) setTab(urlTab)
  }, [urlTab])

  useEffect(() => {
    if (tabParam || sessionStatus === 'loading' || !permsReady) return
    const preferredTab: TabId = isRobaWorkerSelf
      ? 'sollicituds'
      : isDeptLeadLimited
        ? 'recollides'
        : 'preparacio'
    const fallback = visibleTabIds.has(preferredTab) ? preferredTab : visibleTabs[0]?.[0]
    if (!fallback) return
    setTab(fallback)
    const p = new URLSearchParams(searchParams?.toString() || '')
    p.set('tab', fallback)
    router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
  }, [
    tabParam,
    sessionStatus,
    permsReady,
    isRobaWorkerSelf,
    isDeptLeadLimited,
    visibleTabIds,
    visibleTabs,
    router,
    searchParams,
  ])

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

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    groupTabs: ReadonlyArray<readonly [TabId, string]>,
    currentId: TabId
  ) => {
    const currentIndex = groupTabs.findIndex(([id]) => id === currentId)
    if (currentIndex < 0) return
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % groupTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + groupTabs.length) % groupTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = groupTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextId = groupTabs[nextIndex]?.[0]
    if (!nextId) return
    setRobaTab(nextId)
    window.requestAnimationFrame(() => document.getElementById(`roba-tab-${nextId}`)?.focus())
  }

  return (
    <div className="space-y-5 px-2 pb-8 sm:px-4">
      <nav
        className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"
        aria-label="Seccions de Roba personal"
      >
        <div role="tablist" aria-label="Seccions de Roba personal" className="space-y-3">
          {tabGroups.map((group) => (
            <div
              key={group.id}
              role="presentation"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </span>
              <div role="presentation" className="flex flex-wrap gap-2">
                {group.tabs.map(([id, label]) => (
                  <button
                    key={id}
                    id={`roba-tab-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={`roba-panel-${id}`}
                    tabIndex={tab === id ? 0 : -1}
                    onClick={() => setRobaTab(id)}
                    onKeyDown={(event) => handleTabKeyDown(event, visibleTabs, id)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                      tab === id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {permsReady && visibleTabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tens cap pestanya de Roba personal habilitada.
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isRobaWorkerSelf
            ? "Demana material, consulta'n l'estat i confirma'n la recepció des d'aquí."
            : isDeptLeadLimited
              ? 'Flux: sol·licitud → enviament a RRHH → recollida del material → entrega al treballador.'
              : 'Flux: sol·licitud → preparació de RRHH → recollida del departament → entrega al treballador.'}
        </p>
      </nav>

      {operationalCards.length > 0 ? (
        <section aria-labelledby="roba-operational-summary-title" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="roba-operational-summary-title" className="text-sm font-semibold">
              Feina pendent
            </h2>
            <span className="text-xs text-muted-foreground">Selecciona un bloc per obrir la cua</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {operationalCards.map((card) => (
              <button
                key={`${card.tab}-${card.label}`}
                type="button"
                onClick={() => setRobaTab(card.tab)}
                className={`rounded-xl border px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${card.tone}`}
              >
                <span className="block text-2xl font-semibold tabular-nums">{card.value}</span>
                <span className="mt-0.5 block text-xs font-medium">{card.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section
        id={`roba-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`roba-tab-${tab}`}
      >
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
          <SollicitudsPanel
            mode="requests"
            highlightRequestId={requestIdFromUrl}
            isDepartmentRobaLeadOverride={isDeptLeadLimited}
            onOperationalSummaryChange={handleOperationalSummaryChange}
          />
        )}
        {tab === 'preparacio' && (!permsReady || canViewPath(robaTabUiPath('preparacio'))) && (
          <SollicitudsPanel
            mode="prepare"
            highlightRequestId={requestIdFromUrl}
            isDepartmentRobaLeadOverride={isDeptLeadLimited}
            onOperationalSummaryChange={handleOperationalSummaryChange}
          />
        )}
        {tab === 'recollides' && (!permsReady || canViewPath(robaTabUiPath('recollides'))) && (
          <SollicitudsPanel
            mode="pickup"
            highlightRequestId={requestIdFromUrl}
            highlightDeliveryId={deliveryIdFromUrl}
            isDepartmentRobaLeadOverride={isDeptLeadLimited}
            onOperationalSummaryChange={handleOperationalSummaryChange}
          />
        )}
        {tab === 'entregues' && (!permsReady || canViewPath(robaTabUiPath('entregues'))) && (
          <EntreguesPanel
            prefillRequestId={requestIdFromUrl}
            prefillDeliveryId={deliveryIdFromUrl}
            isDepartmentRobaLeadOverride={isDeptLeadLimited}
          />
        )}
        {tab === 'compres' && (!permsReady || canViewPath(robaTabUiPath('compres'))) && <CompresPanel />}
      </section>
    </div>
  )
}
