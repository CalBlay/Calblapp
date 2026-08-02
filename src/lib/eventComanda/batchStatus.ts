import type {
  EventComandaBatchStatus,
  EventComandaOrderBatch,
  EventComandaOrderStatus,
} from '@/lib/eventComanda/types'

export const EVENT_COMANDA_BATCH_STATUS_LABELS: Record<EventComandaBatchStatus, string> = {
  pending: 'Pendent',
  in_progress: 'En preparació',
  ready: 'Preparada',
  sent: 'Enviada',
  issue: 'Problema',
  cancelled: 'Anul·lada',
}

export const EVENT_COMANDA_BATCH_STATUS_BADGES: Record<EventComandaBatchStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  sent: 'border-sky-200 bg-sky-50 text-sky-900',
  issue: 'border-rose-200 bg-rose-50 text-rose-900',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-500',
}

/** Lots visibles al preparador (fins que marca «Enviada»). */
export const PREPARER_VISIBLE_BATCH_STATUSES = new Set<EventComandaBatchStatus>([
  'pending',
  'in_progress',
  'issue',
  'ready',
])

/** Lots visibles a l'historial del preparador (ja enviats). */
export const PREPARER_HISTORY_BATCH_STATUSES = new Set<EventComandaBatchStatus>(['sent'])

/** Xat de comanda actiu mentre el lot encara no està enviat ni anul·lat. */
export const COMANDA_WAREHOUSE_CHAT_ACTIVE_STATUSES = new Set<EventComandaBatchStatus>([
  'pending',
  'in_progress',
  'issue',
  'ready',
])

export function isComandaWarehouseChatActive(
  status: string | undefined | null
): boolean {
  return COMANDA_WAREHOUSE_CHAT_ACTIVE_STATUSES.has(
    normalizeEventComandaBatchStatus(status)
  )
}

const BATCH_STATUS_SET = new Set<string>(Object.keys(EVENT_COMANDA_BATCH_STATUS_LABELS))

export function normalizeEventComandaBatchStatus(
  status: string | undefined | null
): EventComandaBatchStatus {
  const raw = String(status || '').trim()
  if (raw === 'done') return 'ready'
  if (BATCH_STATUS_SET.has(raw)) return raw as EventComandaBatchStatus
  return 'pending'
}

export function normalizeEventComandaOrderBatches(
  batches: EventComandaOrderBatch[] | undefined
): EventComandaOrderBatch[] | undefined {
  if (!batches?.length) return batches
  return batches.map((batch, index) => ({
    ...batch,
    batchId: String(batch.batchId || batch.warehouseId || `batch_${index}`).trim(),
    kind: batch.kind === 'revision' ? 'revision' : 'primary',
    status: normalizeEventComandaBatchStatus(batch.status),
    lines: batch.lines.map((line) => ({
      ...line,
      qtyPrepared:
        line.qtyPrepared == null || !Number.isFinite(Number(line.qtyPrepared))
          ? null
          : Number(line.qtyPrepared),
      modifiedAt: line.modifiedAt ?? null,
      qtyRequestedBefore:
        line.qtyRequestedBefore == null || !Number.isFinite(Number(line.qtyRequestedBefore))
          ? null
          : Number(line.qtyRequestedBefore),
    })),
  }))
}

export function deriveOrderStatusFromBatches(
  batches: EventComandaOrderBatch[]
): EventComandaOrderStatus {
  if (!batches.length) return 'sent'

  const statuses = batches.map((batch) => normalizeEventComandaBatchStatus(batch.status))
  if (statuses.every((status) => status === 'cancelled')) return 'closed'

  const active = statuses.filter((status) => status !== 'cancelled')
  if (!active.length) return 'closed'
  if (active.every((status) => status === 'ready' || status === 'sent')) return 'closed'
  if (
    active.some(
      (status) =>
        status === 'in_progress' ||
        status === 'issue' ||
        status === 'ready' ||
        status === 'sent'
    )
  ) {
    return 'in_progress'
  }
  return 'sent'
}
