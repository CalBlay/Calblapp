// Base typography tokens for gradual UI standardization.
// We can migrate modules to these shared classes progressively.

export const TYPOGRAPHY = {
  eyebrow: 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500',
  label: 'text-xs font-semibold text-slate-500',
  bodyXs: 'text-xs text-slate-500',
  bodySm: 'text-sm text-slate-600',
  bodyMd: 'text-sm text-slate-700',
  sectionTitle: 'text-sm font-semibold text-slate-900',
  cardTitle: 'text-base font-semibold text-slate-900',
  pageTitle: 'text-lg font-semibold tracking-tight text-slate-950 xl:text-xl',
  kpiValue: 'text-2xl font-semibold tracking-tight text-slate-950',
  kpiNote: 'text-xs text-slate-500',
} as const

export type TypographyToken = keyof typeof TYPOGRAPHY

export function typography(token: TypographyToken) {
  return TYPOGRAPHY[token]
}
