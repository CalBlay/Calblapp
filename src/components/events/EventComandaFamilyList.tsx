'use client'

import { Fragment } from 'react'
import { corporateFilterLabelClass } from '@/lib/corporate-filters'
import { sortFamilies, eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import type { EventComandaLine } from '@/lib/eventComanda/types'
import {
  eventComandaLinesScrollClass,
  eventComandaPrefixListClass,
  eventComandaTableClass,
  eventComandaTableGroupRowClass,
  eventComandaTableHeadCellClass,
  eventComandaTableQtyCellClass,
  eventComandaTableRowClass,
  formatEventComandaGroupSummary,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  linesByFamily: Record<string, EventComandaLine[]>
  familyOrder?: string[]
  previewLimitPerFamily?: number
  className?: string
  scrollable?: boolean
}

export default function EventComandaFamilyList({
  linesByFamily,
  familyOrder,
  previewLimitPerFamily,
  className,
  scrollable = true,
}: Props) {
  const families = familyOrder?.length
    ? sortFamilies(
        familyOrder.filter((family) => (linesByFamily[family]?.length ?? 0) > 0)
      )
    : sortFamilies(
        Object.keys(linesByFamily).filter((family) => (linesByFamily[family]?.length ?? 0) > 0)
      )

  const content = (
    <div className={cn(eventComandaPrefixListClass, className)}>
      <div className="overflow-x-auto">
        <table className={eventComandaTableClass}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={eventComandaTableHeadCellClass}>Codi</th>
              <th className={eventComandaTableHeadCellClass}>Article</th>
              <th className={cn(eventComandaTableHeadCellClass, 'text-right')}>Quantitat</th>
              <th className={cn(eventComandaTableHeadCellClass, 'w-16 text-right')}>U.</th>
            </tr>
          </thead>
          <tbody>
            {families.map((family) => {
              const lines = [...(linesByFamily[family] || [])].sort((a, b) =>
                a.articleCode.localeCompare(b.articleCode)
              )
              const visibleLines =
                previewLimitPerFamily != null ? lines.slice(0, previewLimitPerFamily) : lines
              const hiddenCount =
                previewLimitPerFamily != null
                  ? Math.max(0, lines.length - previewLimitPerFamily)
                  : 0

              return (
                <Fragment key={family}>
                  <tr className={eventComandaTableGroupRowClass}>
                    <td colSpan={4} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn(corporateFilterLabelClass, 'text-sm')}>
                          Codi {family}
                        </span>
                        <span className={cn(typography('bodyXs'), 'tabular-nums')}>
                          {formatEventComandaGroupSummary(lines)}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {visibleLines.map((line, index) => (
                    <tr
                      key={`${family}-${line.articleCode}-${index}`}
                      className={eventComandaTableRowClass}
                    >
                      <td className="px-3 py-2 align-top font-mono text-xs text-slate-600">
                        {line.articleCode}
                      </td>
                      <td className={cn(typography('bodyMd'), 'px-3 py-2 align-top break-words')}>
                        {line.articleName}
                      </td>
                      <td className={eventComandaTableQtyCellClass}>
                        {Number.isInteger(line.qtyInitial)
                          ? line.qtyInitial
                          : line.qtyInitial.toLocaleString('ca-ES', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right align-top text-xs font-semibold uppercase text-slate-600">
                        {eventComandaQtyUnit(line.qtyUnit)}
                      </td>
                    </tr>
                  ))}
                  {hiddenCount > 0 ? (
                    <tr className={eventComandaTableRowClass}>
                      <td colSpan={4} className={cn(typography('bodyXs'), 'px-3 py-2 text-slate-500')}>
                        +{hiddenCount} articles més al grup {family}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (!scrollable) return content

  return <div className={eventComandaLinesScrollClass}>{content}</div>
}
