import {
  buildDraftEditorModel,
  normalizeDepartmentKey,
  type DraftEditorModel,
  type EditorDraftInput,
} from '@/lib/quadrantsDraftEditor'

export const mapCuinaDraftToEditorModel = (draft: EditorDraftInput): DraftEditorModel =>
  buildDraftEditorModel({
    ...draft,
    department: 'cuina',
  })

export const mapServeisDraftToEditorModel = (draft: EditorDraftInput): DraftEditorModel =>
  buildDraftEditorModel({
    ...draft,
    department: 'serveis',
  })

export const mapLogisticaDraftToEditorModel = (draft: EditorDraftInput): DraftEditorModel =>
  buildDraftEditorModel({
    ...draft,
    department: 'logistica',
  })

export const mapGenericDraftToEditorModel = (draft: EditorDraftInput): DraftEditorModel =>
  buildDraftEditorModel(draft)

export const mapDraftToEditorModel = (draft: EditorDraftInput): DraftEditorModel => {
  const department = normalizeDepartmentKey(draft.department)

  if (department === 'cuina') return mapCuinaDraftToEditorModel(draft)
  if (department === 'serveis') return mapServeisDraftToEditorModel(draft)
  if (department === 'logistica') return mapLogisticaDraftToEditorModel(draft)

  return mapGenericDraftToEditorModel(draft)
}
