'use client'

import ResetFilterButton from '@/components/ui/ResetFilterButton'
import {
  CorporateFilterBadgeGroup,
  CorporateFilterSelect,
  CorporateFiltersShell,
  type CorporateFilterBadgeOption,
} from '@/components/layout/corporate-filters'

const ALL = '__all__'

export type EventComandaWarehouseFilterOption = {
  id: string
  label: string
}

type Props = {
  warehouseFilter: string
  statusFilter: string
  warehouseOptions: EventComandaWarehouseFilterOption[]
  statusOptions: CorporateFilterBadgeOption[]
  onWarehouseChange: (value: string) => void
  onStatusChange: (value: string) => void
  onReset: () => void
}

function FilterDivider() {
  return <div className="hidden h-7 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
}

export default function EventComandaWarehouseFiltersBar({
  warehouseFilter,
  statusFilter,
  warehouseOptions,
  statusOptions,
  onWarehouseChange,
  onStatusChange,
  onReset,
}: Props) {
  const hasActiveFilters = warehouseFilter !== ALL || statusFilter !== ALL

  return (
    <CorporateFiltersShell
      variant="toolbar"
      showHeader={false}
      sticky
      className="w-full"
      bodyClassName="overflow-x-auto px-3 py-2.5 sm:px-4 lg:px-5"
    >
      <div className="flex min-w-max items-center gap-2 sm:gap-2.5 lg:min-w-0 lg:w-full lg:flex-nowrap">
        {warehouseOptions.length > 0 ? (
          <>
            <CorporateFilterSelect
              aria-label="Magatzem"
              title="Magatzem"
              value={warehouseFilter}
              onChange={(event) => onWarehouseChange(event.target.value)}
              minWidthClassName="min-w-[10rem]"
              className="h-9 max-w-[14rem] truncate px-2.5 text-xs font-medium sm:max-w-[16rem] sm:text-sm"
            >
              <option value={ALL}>Tots els magatzems</option>
              {warehouseOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </CorporateFilterSelect>
            <FilterDivider />
          </>
        ) : null}

        {statusOptions.length > 0 ? (
          <div className="min-w-0 shrink overflow-x-auto">
            <CorporateFilterBadgeGroup
              value={statusFilter}
              onChange={onStatusChange}
              allLabel="Tots"
              allValue={ALL}
              options={statusOptions}
              className="flex-nowrap"
            />
          </div>
        ) : null}

        {hasActiveFilters ? (
          <>
            <FilterDivider />
            <ResetFilterButton onClick={onReset} />
          </>
        ) : null}
      </div>
    </CorporateFiltersShell>
  )
}

export const EVENT_COMANDA_WAREHOUSE_FILTER_ALL = ALL
