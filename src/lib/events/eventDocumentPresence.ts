/** Mateixos prefixes que `/api/events/[id]/documents?prefix=all`. */
const EVENT_ATTACHMENT_FIELD_RE = /^(?:file|zohoFile|cuinaFile|visitVideo)\d+$/i

export function eventRecordHasAttachedDocuments(
  data: Record<string, unknown>
): boolean {
  return Object.entries(data).some(
    ([key, value]) =>
      EVENT_ATTACHMENT_FIELD_RE.test(key) &&
      typeof value === 'string' &&
      value.trim().length > 0
  )
}
