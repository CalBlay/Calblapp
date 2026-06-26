'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { RoleGuard } from '@/lib/withRoleGuard'
import PreparationProgressDashboard from '@/components/logistics/PreparationProgressDashboard'
import { useLogisticsData } from '@/hooks/useLogisticsData'
import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'
import {
  buildDefaultWeekRange,
  parseDateRangeFromSearch,
  parseFilterMode,
  parseRoleForPreparationFilters,
  type PreparationFilterMode,
} from '@/lib/logistics/preparationFilters'
import { BarChart3, Truck } from 'lucide-react'

export default function PreparationDashboardPage() {
  const searchParams = useSearchParams()
  const searchParamsSafe = searchParams ?? new URLSearchParams()
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()

  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(() =>
    parseDateRangeFromSearch(searchParamsSafe, buildDefaultWeekRange())
  )
  const [filterMode, setFilterMode] = useState<PreparationFilterMode>(() =>
    parseFilterMode(searchParamsSafe.get('mode'))
  )
  const { events, loading } = useLogisticsData(dateRange)

  useEffect(() => {
    setDateRange(parseDateRangeFromSearch(searchParamsSafe, buildDefaultWeekRange()))
    setFilterMode(parseFilterMode(searchParamsSafe.get('mode')))
  }, [searchParamsSafe])

  const handleFilterChange = useCallback((f: SmartFiltersChange) => {
    if (f.start && f.end) {
      setDateRange({ start: f.start, end: f.end })
    }
    if (f.mode) {
      setFilterMode(f.mode)
    }
  }, [])

  const rows = useMemo<LogisticsEventPrepRow[]>(() => {
    return [...events].sort((a, b) => {
      const aHas = !!(a.PreparacioData && a.PreparacioHora)
      const bHas = !!(b.PreparacioData && b.PreparacioHora)
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
      if (!aHas && !bHas) {
        return new Date(a.DataInici).getTime() - new Date(b.DataInici).getTime()
      }
      const d1 = new Date(`${a.PreparacioData}T${a.PreparacioHora || '00:00'}`).getTime()
      const d2 = new Date(`${b.PreparacioData}T${b.PreparacioHora || '00:00'}`).getTime()
      return d1 - d2
    })
  }, [events])

  return (
    <section className="space-y-6">
      <ModuleHeader
        icon={<BarChart3 className="h-7 w-7 text-emerald-600" />}
        title="Preparació logística"
        subtitle="Dashboard de seguiment"
        mainHref="/menu/logistica/preparacio"
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => window.close()}
          >
            Tancar pestanya
          </Button>
        }
      />

      <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b bg-gray-50 px-4 py-3">
            <SmartFilters
              role={parseRoleForPreparationFilters(role)}
              showStatus={false}
              modeDefault={filterMode}
              onChange={handleFilterChange}
              showDepartment={false}
              showWorker={false}
              showLocation={false}
              showAdvanced={false}
              initialStart={dateRange?.start}
              initialEnd={dateRange?.end}
            />
          </div>

          <div className="bg-slate-50/50 p-4 md:p-6">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                <Truck className="mx-auto mb-2 h-5 w-5 animate-pulse text-slate-400" />
                Carregant dades del dashboard...
              </div>
            ) : (
              <PreparationProgressDashboard rows={rows} dateRange={dateRange} />
            )}
          </div>
        </div>
      </RoleGuard>
    </section>
  )
}
