export const projectSectionTitleClass = 'text-lg font-semibold leading-none tracking-tight text-slate-900'
export const projectSectionSubtitleClass = 'text-sm font-medium text-slate-600'
export const projectCardTitleClass = 'text-base font-semibold leading-tight text-slate-900'
export const projectCardMetaClass = 'text-sm font-medium text-slate-500'
export const projectEmptyStateClass = 'text-sm font-medium text-slate-500'

/** Contenidor principal de secció (blocs, hub, estructura). */
export const projectModuleShellClass =
  'overflow-hidden rounded-[28px] border border-violet-200/90 bg-white shadow-[0_20px_50px_-22px_rgba(109,40,217,0.32)]'

/** Capçalera amb gradient de marca. */
export const projectSectionHeaderBarClass =
  'border-b border-violet-100/90 bg-gradient-to-r from-violet-100/80 via-fuchsia-50/60 to-violet-50/50 px-5 py-4 sm:px-6'

/** Franja de metadades / departaments dins una secció. */
export const projectMetaStripClass =
  'border-b border-violet-100/70 bg-gradient-to-r from-violet-50/70 via-fuchsia-50/40 to-sky-50/30'

/** Panell de formulari o detalls. */
export const projectPanelClass =
  'overflow-hidden rounded-2xl border border-violet-100/80 bg-gradient-to-br from-white via-white to-violet-50/25 shadow-[0_10px_32px_-14px_rgba(109,40,217,0.2)]'

/** Subpanell suau dins un formulari. */
export const projectPanelInsetClass =
  'rounded-xl border border-violet-100/50 bg-gradient-to-br from-slate-50/60 via-white to-violet-50/15'

/** Targeta de bloc del projecte. */
export const projectBlockCardClass =
  'group relative flex h-full flex-col overflow-hidden rounded-xl border border-violet-100/80 bg-gradient-to-br from-white via-white to-violet-50/30 px-3.5 py-3.5 shadow-[0_4px_16px_-8px_rgba(109,40,217,0.15)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-200/90 hover:shadow-[0_12px_28px_-12px_rgba(109,40,217,0.22)] sm:px-4 sm:py-4'

export const projectBlockCardAccentClass =
  'pointer-events-none absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-violet-400 via-fuchsia-400 to-violet-500 opacity-70'

/** Icona de secció amb gradient de marca. */
export const projectIconBoxClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40'

export const projectSectionLabelClass =
  'text-xs font-semibold uppercase tracking-[0.14em] text-violet-600/80'

/** Departament no assignat (abans d'arrossegar). */
export const projectDepartmentIdleClass =
  'border-violet-100 bg-white text-slate-600 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800'

/** CTA principal del mòdul. */
export const projectPrimaryButtonClass =
  'gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm shadow-violet-300/50 hover:from-violet-700 hover:to-fuchsia-700'

/** Composer de bloc / element nou. */
export const projectComposerShellClass =
  'rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50/80 via-fuchsia-50/40 to-violet-50/60 p-4 shadow-sm'

/** Estat buit amb accent de marca. */
export const projectEmptyShellClass =
  'flex flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200/80 bg-gradient-to-br from-violet-50/50 via-white to-fuchsia-50/30 px-6 py-12 text-center'

export const projectEmptyIconClass =
  'flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200/60'

export const projectStatusToneClass = (status: string) => {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
  if (status === 'in_progress') return 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
  if (status === 'blocked') return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
  if (status === 'overdue') return 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
}

export const projectStatusAccentClass = (status?: string) => {
  if (status === 'done') return 'bg-emerald-500'
  if (status === 'in_progress') return 'bg-sky-500'
  if (status === 'blocked') return 'bg-rose-500'
  if (status === 'overdue') return 'bg-amber-500'
  return 'bg-slate-400'
}

/** Tipografia de la fitxa del projecte (overview). Mida/font via selector de lectura. */
export const projectOverviewSectionTitleClass =
  'overview-section-title font-semibold tracking-tight text-slate-900'
export const projectOverviewSectionSubtitleClass =
  'overview-section-subtitle mt-0.5 text-slate-600'
export const projectOverviewLabelClass = 'font-semibold text-slate-700'
export const projectOverviewInputClass = 'h-11'
export const projectOverviewSelectClass =
  'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
export const projectOverviewTextareaClass = 'min-h-[140px] resize-y leading-relaxed'
export const projectOverviewMetaClass = 'overview-body-copy text-slate-600'
export const projectOverviewChipClass = 'overview-body-copy'
export const projectOverviewBlockTitleClass =
  'h-10 border-0 bg-transparent px-0 font-semibold text-slate-900 shadow-none focus-visible:ring-0'
export const projectOverviewSectionLabelClass =
  'overview-body-copy font-semibold uppercase tracking-[0.12em] text-violet-600/80'

/** Resum / seguiment: contenidor principal (més pla i corporatiu que el shell general). */
export const projectTrackingShellClass =
  'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'

/** Barra de metadades del resum executiu. */
export const projectTrackingMetaBarClass =
  'border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5 lg:px-6'

/** Targeta KPI del resum (sense gradients ni ombres pronunciades). */
export const projectTrackingKpiCardClass =
  'border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3'

/** Etiqueta de KPI / mètrica. */
export const projectTrackingKpiLabelClass =
  'text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500'

/** Icona de secció del resum (marca violeta, sense gradient). */
export const projectTrackingIconBoxClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-700'

/** Targeta de bloc/tasca al resum executiu. */
export const projectTrackingCardClass =
  'group relative flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white px-3.5 py-3 transition-colors hover:border-violet-300 hover:bg-slate-50/50 sm:px-4 sm:py-3.5'

export const projectTrackingCardAccentClass =
  'pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-violet-500'

/** Barra de progrés del CURRENT tracking cards. */
export const projectTrackingProgressTrackClass = 'h-1 overflow-hidden rounded-sm bg-slate-200'
export const projectTrackingProgressFillClass = 'h-full rounded-sm bg-violet-600'
export const projectTrackingProgressFillTasksClass = 'h-full rounded-sm bg-emerald-600'

/** Panell secundari del resum (formulari, alertes). */
export const projectTrackingPanelClass =
  'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'

/** Fila d'alerta del resum. */
export const projectTrackingAlertRowClass =
  'flex items-start gap-3 border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3'

/** Badge d'estat compacte (resum executiu). */
export const projectTrackingStatusBadgeClass =
  'shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold leading-none'

/** Etiqueta secundària (departament, prioritat). */
export const projectTrackingTagClass =
  'inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-medium'
