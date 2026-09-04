/**
 * Calendar manual event mutations must stay inside Zoho stage collections.
 * Without this gate, clients that hold calendar attach/update permissions can
 * pass an arbitrary Firestore collection name into Admin SDK writes.
 */
export function isAllowedCalendarManualCollection(collection: unknown): boolean {
  return typeof collection === 'string' && collection.startsWith('stage_')
}

/** Attach slots written by AttachFileButton / CalendarNewEventModal (`file1`, …). */
export function isAllowedCalendarManualAttachField(field: unknown): boolean {
  return typeof field === 'string' && /^file\d+$/.test(field.trim())
}

/** Attachment slots exposed by the calendar (`fileN` and synced `zohoFileN`). */
export function isAllowedCalendarAttachmentField(field: unknown): boolean {
  return typeof field === 'string' && /^(?:file|zohoFile)\d+$/.test(field.trim())
}

export function calendarAttachmentFieldKeys(field: string): string[] {
  return [
    field,
    `${field}Name`,
    `${field}MimeType`,
    `${field}AttachmentId`,
    `${field}ModifiedTime`,
    `${field}Size`,
    `${field}Path`,
    `${field}Source`,
  ]
}

const MANUAL_PUT_META_FIELDS = new Set(['codeConfirmed'])

/**
 * Whitelist body fields for PUT /api/calendar/manual/[id].
 * Modal edits, attachment clears (`fileN: null`), and attach name keys only.
 */
export function pickCalendarManualPutFields(
  data: Record<string, unknown>,
  modalOverrideFields: ReadonlySet<string>
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (modalOverrideFields.has(key) || MANUAL_PUT_META_FIELDS.has(key)) {
      picked[key] = value
      continue
    }
    if (isAllowedCalendarManualAttachField(key)) {
      picked[key] = value
      continue
    }
    const nameMatch = typeof key === 'string' ? key.match(/^(file\d+)Name$/) : null
    if (nameMatch) {
      picked[key] = value
    }
  }
  return picked
}
