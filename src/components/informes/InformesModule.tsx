'use client'

import { useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { BarChart3 } from 'lucide-react'
import { INFORMES_DOMAINS } from '@/lib/informes/domains'
import type { InformesDomainId } from '@/lib/informes/types'
import { cn } from '@/lib/utils'
import { RrhhInformesPanel } from './domains/RrhhInformesPanel'
import { TransportsInformesPanel } from './domains/TransportsInformesPanel'
import { MaintenanceInformesPanel } from './domains/MaintenanceInformesPanel'
import { ModuleExportMenuActions } from '@/components/export/ModuleExportMenuContext'

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-2">
        Aquest àrea utilitzarà dades de l&apos;app, fitxers enllaçats (MCP) i, més endavant, ERP.
        Pendent de definir KPIs i connexions.
      </p>
    </div>
  )
}

export function InformesModule() {
  const enabledDomains = useMemo(
    () => INFORMES_DOMAINS.filter((d) => !d.comingSoon),
    []
  )
  const [active, setActive] = useState<InformesDomainId>(
    (enabledDomains[0]?.id as InformesDomainId) ?? 'rrhh'
  )

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
      <ModuleHeader
        icon={<BarChart3 className="w-7 h-7 text-indigo-600" />}
        title="Informes"
        subtitle="Panell per domini: dades de l’app, MCP i fonts externes (ERP) quan estiguin connectades."
        mainHref="/menu/reports"
        actions={<ModuleExportMenuActions />}
      />

      <div className="flex flex-col lg:flex-row gap-4">
        <aside className="w-full lg:w-52 shrink-0">
          <nav className="grid grid-cols-2 sm:grid-cols-1 gap-2">
            {INFORMES_DOMAINS.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={d.comingSoon}
                onClick={() => !d.comingSoon && setActive(d.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                  d.comingSoon && 'opacity-50 cursor-not-allowed',
                  !d.comingSoon && active === d.id
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-100'
                    : !d.comingSoon && 'bg-card border-border hover:bg-muted/50'
                )}
              >
                {d.label}
                {d.comingSoon ? (
                  <span className="block text-[10px] text-muted-foreground mt-0.5">Aviat</span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          {active === 'rrhh' ? <RrhhInformesPanel /> : null}
          {active === 'transports' ? <TransportsInformesPanel /> : null}
          {active === 'maintenance' ? <MaintenanceInformesPanel /> : null}
          {active === 'finances' ? <ComingSoonPanel label="Finances" /> : null}
          {active === 'compres' ? <ComingSoonPanel label="Compres" /> : null}
          {active === 'events' ? <ComingSoonPanel label="Esdeveniments" /> : null}
        </main>
      </div>
    </div>
  )
}
