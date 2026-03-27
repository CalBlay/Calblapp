'use client'

export type TemplateSection = { location: string; items: { label: string }[] }

export type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  sections: TemplateSection[]
}

export type ImportModel = 'A' | 'B' | 'C' | 'D' | 'UNKNOWN'

export type ImportCandidate = {
  name: string
  periodicity?: Template['periodicity']
  location?: string
  sections: TemplateSection[]
}

export type ImportPreview = {
  fileName: string
  model: ImportModel
  templates: ImportCandidate[]
  warnings: string[]
}

export type ModelBImportMode = 'single' | 'split' | 'custom'

export const PERIODICITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Totes' },
  { value: 'daily', label: 'Diari' },
  { value: 'weekly', label: 'Setmanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]
