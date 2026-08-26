/**
 * Room GET `/api/projects/[id]/rooms/[roomId]` returns a privacy-scoped
 * snapshot: only the linked block (or `[]` for the general room) and the
 * current room. Project PATCH replace-merges top-level arrays, so uploading
 * a "Docs inicials" file from the room page must not send that snapshot back.
 */
export const ROOM_INITIAL_DOCUMENT_UPLOAD_FORBIDDEN_FIELDS = [
  'blocks',
  'rooms',
  'sprints',
  'status',
  'name',
  'sponsor',
  'owner',
  'context',
  'strategy',
  'risks',
  'startDate',
  'launchDate',
  'budget',
  'phase',
  'departments',
  'documents',
  'kickoff',
] as const

export function fillRoomInitialDocumentUploadForm(
  form: FormData,
  file: Blob,
  fileName: string
): FormData {
  form.set('file', file)
  form.set('fileCategory', 'initial')
  form.set('fileLabel', fileName)
  return form
}

export function roomInitialDocumentUploadOmitsProjectSnapshot(form: FormData): boolean {
  return ROOM_INITIAL_DOCUMENT_UPLOAD_FORBIDDEN_FIELDS.every((field) => form.get(field) === null)
}
