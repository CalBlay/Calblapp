'use client'

import { ArrowRight, CalendarDays, PackageCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDateOnly } from '@/lib/date-format'
import type { RequestRow } from './robaPersonalTypes'
import { getRobaRequestExperience, type RobaRequestTone } from './robaRequestExperience'

const badgeVariantByTone: Record<
  RobaRequestTone,
  'default' | 'success' | 'warning' | 'destructive' | 'secondary'
> = {
  neutral: 'secondary',
  info: 'default',
  warning: 'warning',
  success: 'success',
  danger: 'destructive',
}

export function RobaWorkerRequestCards({
  rows,
  productLabel,
  highlightedRequestId,
  canCancel,
  onCancel,
  onOpenDeliveries,
}: {
  rows: RequestRow[]
  productLabel: (productId: string) => string
  highlightedRequestId?: string
  canCancel: (request: RequestRow) => boolean
  onCancel: (requestId: string) => void
  onOpenDeliveries: (requestId: string) => void
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Les meves sol·licituds">
      {rows.map((request) => {
        const experience = getRobaRequestExperience(request.status)
        const canOpenDelivery = ['ready_for_worker_delivery', 'picked_up', 'fulfilled'].includes(
          request.status
        )

        return (
          <Card
            key={request.id}
            id={`roba-req-${request.id}`}
            className={cn(
              'space-y-4 p-4 shadow-none transition-colors sm:p-5',
              highlightedRequestId?.trim() === request.id &&
                'border-indigo-400 bg-indigo-500/5 ring-2 ring-indigo-400/20'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">
                  {request.reference ?? `S-${request.id}`}
                </p>
                <h3 className="mt-1 font-semibold text-foreground">
                  {request.lines.length === 1
                    ? productLabel(request.lines[0].productId)
                    : `${request.lines.length} articles sol·licitats`}
                </h3>
              </div>
              <Badge variant={badgeVariantByTone[experience.tone]}>{experience.label}</Badge>
            </div>

            {experience.step > 0 ? (
              <div>
                <div
                  className="grid grid-cols-4 gap-1.5"
                  role="progressbar"
                  aria-label={`Pas ${experience.step} de ${experience.totalSteps}`}
                  aria-valuemin={1}
                  aria-valuemax={experience.totalSteps}
                  aria-valuenow={experience.step}
                >
                  {Array.from({ length: experience.totalSteps }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-1.5 rounded-full bg-muted',
                        index < experience.step &&
                          (experience.closed ? 'bg-emerald-500' : 'bg-indigo-500')
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Ara: </span>
                  {experience.nextAction}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{experience.nextAction}</p>
            )}

            <div className="rounded-lg bg-muted/50 px-3 py-2.5">
              <ul className="space-y-1.5 text-sm">
                {request.lines.map((line, index) => (
                  <li key={`${line.productId}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{productLabel(line.productId)}</span>
                    <span className="shrink-0 font-medium tabular-nums">× {line.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {request.createdAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    Sol·licitada el {formatDateOnly(request.createdAt)}
                  </span>
                ) : null}
                {request.pickupDate && request.status === 'prepared' ? (
                  <span>Recollida prevista: {formatDateOnly(request.pickupDate)}</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                {canCancel(request) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => onCancel(request.id)}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Cancel·lar
                  </Button>
                ) : null}
                {canOpenDelivery ? (
                  <Button type="button" size="sm" onClick={() => onOpenDeliveries(request.id)}>
                    <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
                    Revisar recepció
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
