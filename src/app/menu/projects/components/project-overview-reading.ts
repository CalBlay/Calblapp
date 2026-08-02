export type ProjectOverviewReadingScale = 'sm' | 'md' | 'lg' | 'xl'
export type ProjectOverviewReadingFont = 'sans' | 'serif'

export const PROJECT_OVERVIEW_READING_STORAGE_KEY = 'calblay.projectOverview.readingPrefs'

export const PROJECT_OVERVIEW_READING_SCALE_OPTIONS: Array<{
  id: ProjectOverviewReadingScale
  label: string
  description: string
}> = [
  { id: 'sm', label: 'S', description: 'Text petit' },
  { id: 'md', label: 'M', description: 'Text mitjà' },
  { id: 'lg', label: 'L', description: 'Text gran (recomanat)' },
  { id: 'xl', label: 'XL', description: 'Text molt gran' },
]

export const PROJECT_OVERVIEW_READING_FONT_OPTIONS: Array<{
  id: ProjectOverviewReadingFont
  label: string
}> = [
  { id: 'sans', label: 'Sistema' },
  { id: 'serif', label: 'Serif' },
]

export const projectOverviewReadingScaleClass = (scale: ProjectOverviewReadingScale) => {
  if (scale === 'sm') {
    return cnScale(
      'text-sm',
      '[&_label]:!text-sm',
      '[&_input]:!text-sm',
      '[&_textarea]:!text-sm',
      '[&_select]:!text-sm',
      '[&_.overview-section-title]:!text-base',
      '[&_.overview-section-subtitle]:!text-sm',
      '[&_.overview-body-copy]:!text-sm'
    )
  }
  if (scale === 'md') {
    return cnScale(
      'text-base',
      '[&_label]:!text-base',
      '[&_input]:!text-base',
      '[&_textarea]:!text-base',
      '[&_select]:!text-base',
      '[&_.overview-section-title]:!text-lg',
      '[&_.overview-section-subtitle]:!text-base',
      '[&_.overview-body-copy]:!text-base'
    )
  }
  if (scale === 'xl') {
    return cnScale(
      'text-xl',
      '[&_label]:!text-xl',
      '[&_input]:!text-xl [&_input]:!h-14',
      '[&_textarea]:!text-xl [&_textarea]:!min-h-[180px] [&_textarea]:!leading-relaxed',
      '[&_select]:!text-xl [&_select]:!h-14',
      '[&_.overview-section-title]:!text-2xl',
      '[&_.overview-section-subtitle]:!text-lg',
      '[&_.overview-body-copy]:!text-xl'
    )
  }
  return cnScale(
    'text-lg',
    '[&_label]:!text-lg',
    '[&_input]:!text-lg [&_input]:!h-12',
    '[&_textarea]:!text-lg [&_textarea]:!min-h-[160px] [&_textarea]:!leading-relaxed',
    '[&_select]:!text-lg [&_select]:!h-12',
    '[&_.overview-section-title]:!text-xl',
    '[&_.overview-section-subtitle]:!text-lg',
    '[&_.overview-body-copy]:!text-lg'
  )
}

export const projectOverviewReadingFontClass = (font: ProjectOverviewReadingFont) => {
  if (font === 'serif') {
    return 'font-serif [&_input]:!font-serif [&_textarea]:!font-serif [&_select]:!font-serif'
  }
  return 'font-sans [&_input]:!font-sans [&_textarea]:!font-sans [&_select]:!font-sans'
}

function cnScale(...classes: string[]) {
  return classes.join(' ')
}
