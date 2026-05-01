/**
 * Patró visual compartit per llistes de fitxers/documents adjunts
 * (p. ex. pestanya Documents de projectes, mòdul Documentació).
 */
import {
  projectCardTitleClass,
  projectEmptyStateClass,
  projectSectionTitleClass,
} from '@/app/menu/projects/components/project-ui'

export const attachmentListSectionTitleClass = projectSectionTitleClass

export const attachmentListRowClass =
  'flex items-center justify-between gap-3 rounded-2xl bg-slate-50/70 px-4 py-3'

export const attachmentListIconWrapClass =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600'

export const attachmentListMetaRowClass = 'mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500'

export const attachmentListEmptyBoxClass = `rounded-2xl bg-slate-50/80 px-4 py-4 ${projectEmptyStateClass}`

export const attachmentListCardTitleClass = projectCardTitleClass

export { projectEmptyStateClass as attachmentListEmptyTextClass }
