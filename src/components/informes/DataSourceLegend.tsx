'use client'

import type { InformesDataSourceKind } from '@/lib/informes/types'
import { cn } from '@/lib/utils'

const LABELS: Record<InformesDataSourceKind, string> = {
  app: 'App',
  mcp_file: 'MCP / fitxers',
  erp: 'ERP',
  hybrid: 'Combinat',
}

export function DataSourceLegend({
  sources,
  className,
}: {
  sources: readonly InformesDataSourceKind[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-2 text-xs text-muted-foreground', className)}>
      <span className="font-medium text-foreground">Fonts:</span>
      {sources.map((s) => (
        <span
          key={s}
          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-foreground"
        >
          {LABELS[s]}
        </span>
      ))}
    </div>
  )
}
