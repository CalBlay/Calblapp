import type { RobaOperationalSummary } from './robaPersonalTypes'

const OPEN_REQUEST_STATUSES = new Set([
  'submitted',
  'sent_to_rrhh',
  'prepared',
  'ready_for_worker_delivery',
  'picked_up',
])

/**
 * Les cues operatives no poden amagar feina pendent només perquè es va crear
 * abans del període seleccionat. El rang de dates s'aplica a l'històric tancat.
 */
export function isOpenRobaRequestStatus(status: string): boolean {
  return OPEN_REQUEST_STATUSES.has(String(status || '').trim())
}

export function buildRobaOperationalSummary(
  requests: ReadonlyArray<{ status: string }>,
  deliveries: ReadonlyArray<{ workerReceiptCorrectionOpen?: boolean }>
): RobaOperationalSummary {
  const summary: RobaOperationalSummary = {
    submitted: 0,
    sentToRrhh: 0,
    prepared: 0,
    readyForDelivery: 0,
    disputes: 0,
  }

  for (const request of requests) {
    if (request.status === 'submitted') summary.submitted += 1
    else if (request.status === 'sent_to_rrhh') summary.sentToRrhh += 1
    else if (request.status === 'prepared') summary.prepared += 1
    else if (
      request.status === 'ready_for_worker_delivery' ||
      request.status === 'picked_up'
    ) {
      summary.readyForDelivery += 1
    }
  }
  for (const delivery of deliveries) {
    if (delivery.workerReceiptCorrectionOpen === true) summary.disputes += 1
  }

  return summary
}
