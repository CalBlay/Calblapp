export type QuadrantAutoSaveOptions = {
  confirm?: boolean
}

export type QuadrantAutoSaveResult = 'clean' | 'saved' | false

export type QuadrantAutoSaveHandler = (
  options?: QuadrantAutoSaveOptions
) => Promise<QuadrantAutoSaveResult>

export type QuadrantAutoSaveRegistrar = (
  handler: QuadrantAutoSaveHandler | null
) => void
