'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { BarChart3 } from 'lucide-react'
import { INFORMES_DOMAINS } from '@/lib/informes/domains'
import type { InformesDomainId } from '@/lib/informes/types'
import { cn } from '@/lib/utils'
import { ModuleExportMenuActions } from '@/components/export/ModuleExportMenuContext'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { reportsDomainPermission } from '@/lib/informes/permissions'

const panelLoadingFallback = () => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
    Carregant informes...
  </div>
)

const RrhhInformesPanel = dynamic(
  () => import('./domains/RrhhInformesPanel').then((mod) => ({ default: mod.RrhhInformesPanel })),
  { loading: panelLoadingFallback }
)
const AuditInformesPanel = dynamic(
  () =>
    import('./domains/AuditInformesPanel').then((mod) => ({
      default: mod.AuditInformesPanel,
    })),
  { loading: panelLoadingFallback }
)
const TransportsInformesPanel = dynamic(
  () =>
    import('./domains/TransportsInformesPanel').then((mod) => ({
      default: mod.TransportsInformesPanel,
    })),
  { loading: panelLoadingFallback }
)
const MaintenanceInformesPanel = dynamic(
  () =>
    import('./domains/MaintenanceInformesPanel').then((mod) => ({
      default: mod.MaintenanceInformesPanel,
    })),
  { loading: panelLoadingFallback }
)
const EventsWorkersInformesPanel = dynamic(
  () =>
    import('./domains/EventsWorkersInformesPanel').then((mod) => ({
      default: mod.EventsWorkersInformesPanel,
    })),
  { loading: panelLoadingFallback }
)

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-2">
        Aquest area utilitzara dades de l&apos;app, fitxers enllacats (MCP) i, mes endavant, ERP.
        Pendent de definir KPIs i connexions.
      </p>
    </div>
  )
}

export function InformesModule() {
  const { uiActions, ready: permissionsReady } = useUiPermissions()
  const enabledDomains = useMemo(
    () =>
      INFORMES_DOMAINS.filter((domain) => {
        if (domain.comingSoon) return false
        const permission = reportsDomainPermission(domain.id)
        return permission ? uiActions[permission] === true : false
      }),
    [uiActions]
  )
  const [active, setActive] = useState<InformesDomainId>('rrhh')

  useEffect(() => {
    if (!permissionsReady || enabledDomains.some((domain) => domain.id === active)) return
    const firstDomain = enabledDomains[0]
    if (firstDomain) setActive(firstDomain.id)
  }, [active, enabledDomains, permissionsReady])

  const visibleDomains = useMemo(
    () =>
      INFORMES_DOMAINS.filter(
        (domain) =>
          (domain.comingSoon && enabledDomains.length > 0) ||
          enabledDomains.some((enabled) => enabled.id === domain.id)
      ),
    [enabledDomains]
  )

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 pb-8 pt-4 sm:gap-6 lg:px-6 xl:px-8">
      <ModuleHeader
        icon={<BarChart3 className="h-7 w-7 text-indigo-600" />}
        title="Informes"
        subtitle="Panell per domini: dades de l'app, MCP i fonts externes (ERP) quan estiguin connectades."
        mainHref="/menu/reports"
        actions={<ModuleExportMenuActions />}
      />

      <nav className="flex flex-wrap gap-2">
        {permissionsReady ? visibleDomains.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={d.comingSoon}
            onClick={() => !d.comingSoon && setActive(d.id)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm transition-colors',
              d.comingSoon && 'cursor-not-allowed opacity-50',
              !d.comingSoon && active === d.id
                ? 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100'
                : !d.comingSoon && 'border-border bg-card hover:bg-muted/50'
            )}
          >
            {d.label}
            {d.comingSoon ? (
              <span className="ml-1 text-[10px] text-muted-foreground">Aviat</span>
            ) : null}
          </button>
        )) : null}
      </nav>

      <main className="w-full max-w-none min-w-0">
        {!permissionsReady ? panelLoadingFallback() : null}
        {permissionsReady && enabledDomains.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            No tens cap pestanya d&apos;informes habilitada.
          </div>
        ) : null}
        {permissionsReady && active === 'rrhh' && enabledDomains.some((d) => d.id === 'rrhh') ? <RrhhInformesPanel /> : null}
        {permissionsReady && active === 'audits' && enabledDomains.some((d) => d.id === 'audits') ? <AuditInformesPanel /> : null}
        {permissionsReady && active === 'transports' && enabledDomains.some((d) => d.id === 'transports') ? <TransportsInformesPanel /> : null}
        {permissionsReady && active === 'maintenance' && enabledDomains.some((d) => d.id === 'maintenance') ? <MaintenanceInformesPanel /> : null}
        {permissionsReady && active === 'events' && enabledDomains.some((d) => d.id === 'events') ? <EventsWorkersInformesPanel /> : null}
        {permissionsReady && active === 'finances' ? <ComingSoonPanel label="Finances" /> : null}
        {permissionsReady && active === 'compres' ? <ComingSoonPanel label="Compres" /> : null}
      </main>
    </div>
  )
}
