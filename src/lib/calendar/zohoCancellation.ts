const ZOHO_MANAGED_CANCELLATION_SOURCES = new Set([
  'zoho-stage-lost',
  'zoho-record-missing',
])

const CANCELLATION_FIELDS = [
  'cancelledAt',
  'cancelledByUserId',
  'cancelledByName',
  'cancellationSource',
  'cancellationNoticeSentAt',
  'cancellationNoticeSentByUserId',
  'cancellationNoticeRecipientCount',
] as const

/**
 * Reconciles an active Zoho deal with the latest calendar document.
 *
 * Only cancellations created by the Zoho sync may be automatically cleared.
 * Manual cancellations are copied from the latest document so a concurrent
 * user action cannot be overwritten by a long-running synchronization.
 */
export function reconcileActiveZohoDealCancellation(
  incoming: Record<string, unknown>,
  existing?: Record<string, unknown>
): Record<string, unknown> {
  if (!existing || existing.cancelled !== true) return incoming

  const source = String(existing.cancellationSource || '').trim()
  if (ZOHO_MANAGED_CANCELLATION_SOURCES.has(source)) {
    return {
      ...incoming,
      cancelled: false,
      cancelledAt: null,
      cancelledByUserId: null,
      cancelledByName: null,
      cancellationSource: null,
      cancellationNoticeSentAt: null,
      cancellationNoticeSentByUserId: null,
      cancellationNoticeRecipientCount: null,
    }
  }

  const out = { ...incoming, cancelled: true }
  for (const field of CANCELLATION_FIELDS) {
    if (existing[field] !== undefined) out[field] = existing[field]
  }
  return out
}
