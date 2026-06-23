'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { maintenanceStatusBadge } from '@/lib/colors'
import type { Preventiu } from '../types'
import {
  formatDateTime,
  formatTrackedHours,
  getDaysBadge,
  getDaysOpen,
  getPlannedMinutes,
  getTrackedMinutes,
  parseDateFromParts,
  STATUS_LABELS,
} from '../utils'

type Props = {
  item: Preventiu
  expanded: boolean
  canValidatePreventius: boolean
  validatingPreventiuId: string | null
  onOpen: (item: Preventiu) => void
  onToggleExpanded: (id: string) => void
  onValidate: (item: Preventiu) => Promise<void>
}

export default function SeguimentPreventiuRow({
  item,
  expanded,
  canValidatePreventius,
  validatingPreventiuId,
  onOpen,
  onToggleExpanded,
  onValidate,
}: Props) {
  const days = getDaysOpen(item.createdAt)
  const trackedMinutes = getTrackedMinutes(item.history)
  const plannedMinutes = getPlannedMinutes(item.plannedStart, item.plannedEnd)
  const canDirectValidatePreventiu = canValidatePreventius && item.status === 'fet'

  return (
    <article className="px-4 py-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="text-left text-base font-semibold text-slate-900 hover:underline"
              >
                {item.title}
              </button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${maintenanceStatusBadge(item.status)}`}
              >
                {STATUS_LABELS[item.status]}
              </span>
              {days !== null ? (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getDaysBadge(days)}`}>
                  {days} dies
                </span>
              ) : null}
              {item.status === 'fet' ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                  Pendent de validar
                </span>
              ) : null}
              {typeof item.progress === 'number' ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Checklist {item.progress}%
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-7">
              <InfoCard label="Ubicacio" value={item.location || '-'} />
              <InfoCard label="Operari" value={item.workerNames.join(', ') || '-'} />
              <InfoCard label="Hores planificades" value={formatTrackedHours(plannedMinutes)} />
              <InfoCard label="Hores reals" value={formatTrackedHours(trackedMinutes)} />
              <InfoCard
                label="Planificat"
                value={formatDateTime(
                  parseDateFromParts(item.plannedDate, item.plannedStart)?.toISOString() || null
                )}
              />
              <InfoCard label="Ultim moviment" value={formatDateTime(item.updatedAt || item.createdAt)} />
              <InfoCard label="Data alta" value={formatDateTime(item.createdAt)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDirectValidatePreventiu ? (
              <Button
                type="button"
                variant="default"
                className="rounded-full"
                disabled={validatingPreventiuId === item.id}
                onClick={() => void onValidate(item)}
              >
                {validatingPreventiuId === item.id ? 'Validant...' : 'Validar'}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => onToggleExpanded(item.id)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded ? (
          <div className="space-y-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            {canDirectValidatePreventiu ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Validacio del preventiu
                  </div>
                  <div className="mt-1 text-sm text-amber-900">
                    Aquest preventiu esta marcat com a fet i es pot validar des d&apos;aqui.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="default"
                  className="rounded-full"
                  disabled={validatingPreventiuId === item.id}
                  onClick={() => void onValidate(item)}
                >
                  {validatingPreventiuId === item.id ? 'Validant...' : 'Validar preventiu'}
                </Button>
              </div>
            ) : null}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</div>
              <PreventiuHistory item={item} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function PreventiuHistory({ item }: { item: Preventiu }) {
  const history = item.history
    .slice()
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))

  if (history.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
        Aquest preventiu encara no te historial de canvis.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {history.map((entry, index) => (
        <div
          key={`${entry.status}-${entry.at}-${index}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
        >
          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-[120px_140px_120px_minmax(0,1fr)_140px]">
            <div>
              <div className="font-medium text-slate-500">Estat</div>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${maintenanceStatusBadge(entry.status)}`}
              >
                {STATUS_LABELS[entry.status]}
              </span>
            </div>
            <div>
              <div className="font-medium text-slate-500">Operari</div>
              <div>{entry.byName || '-'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Hora</div>
              <div>
                {entry.startTime || entry.endTime
                  ? `${entry.startTime || '--:--'}-${entry.endTime || '--:--'}`
                  : '-'}
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Observacions</div>
              <div>{entry.note || '-'}</div>
            </div>
            <div>
              <div className="font-medium text-slate-500">Data</div>
              <div>{formatDateTime(entry.at)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-slate-700">{value}</div>
    </div>
  )
}
