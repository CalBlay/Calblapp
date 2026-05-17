import { DEFAULT_ALLERGENS } from '@/data/allergens'
import type { AllergenItem, AllergenValue, FormState } from './types'

export const DEFAULT_ALLERGEN_KEYS = new Set<string>(
  DEFAULT_ALLERGENS.map(allergen => allergen.key)
)

export const EMPTY_SELECT = '__none__'

export const ALLERGEN_OPTIONS: Array<{
  value: AllergenValue | typeof EMPTY_SELECT
  label: string
}> = [
  { value: EMPTY_SELECT, label: '-' },
  { value: 'NO', label: 'No' },
  { value: 'T', label: 'Traces' },
  { value: 'SI', label: 'Si' },
]

export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()

export const slugify = (value: string) => normalize(value).replace(/\s+/g, '-')

export const parseMenus = (value: string) => {
  const raw = normalize(value)
  if (!raw) return []

  const tokens = raw.split(/\s+/).filter(Boolean)
  const menus = new Set<string>()

  for (const token of tokens) {
    if (/^c\d+$/i.test(token)) {
      menus.add(token.toUpperCase())
      continue
    }
    if (/^ch\d+$/i.test(token)) {
      menus.add(token.toUpperCase())
      continue
    }
    if (token.startsWith('cel')) {
      menus.add('CELIAC')
    }
  }

  return Array.from(menus)
}

export const normalizeMenuId = (value: string) => value.trim()

export const formatMenuLabel = (value: string) => value.trim()

export const toAllergenKey = (value: string) => {
  const parts = normalize(value).split(' ').filter(Boolean)
  return parts
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('')
}

export const buildAllergensState = (
  source: Record<string, string | null> = {},
  list: readonly AllergenItem[] = DEFAULT_ALLERGENS
): Record<string, AllergenValue> => {
  const state: Record<string, AllergenValue> = {}
  list.forEach(({ key }) => {
    const value = source?.[key]
    state[key] = value === 'SI' || value === 'NO' || value === 'T' ? value : ''
  })
  return state
}

export const defaultFormState: FormState = {
  code: '',
  nameCa: '',
  nameEs: '',
  nameEn: '',
  nameMeta: {},
  categoryId: '',
  familyId: '',
  menus: [],
  menusRaw: '',
  vegan: false,
  vegetarian: false,
  allergens: buildAllergensState(),
}
