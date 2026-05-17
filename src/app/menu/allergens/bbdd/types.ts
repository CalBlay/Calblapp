export type AllergenValue = 'SI' | 'NO' | 'T' | ''

export type AllergenItem = {
  key: string
  label: string
}

export type NameMeta = {
  es?: { auto?: boolean; reviewed?: boolean }
  en?: { auto?: boolean; reviewed?: boolean }
}

export type OptionItem = {
  id: string
  label: string
}

export type ImportConflictEntry = {
  code?: string
  sheet?: string
  row?: number
  nameCa?: string
}

export type ImportConflictItem = {
  id: string
  code?: string
  reason?: string
  status?: string
  existingNameCa?: string
  entries?: ImportConflictEntry[]
}

export type FormState = {
  code: string
  nameCa: string
  nameEs: string
  nameEn: string
  nameMeta: NameMeta
  categoryId: string
  familyId: string
  menus: string[]
  menusRaw: string
  vegan: boolean
  vegetarian: boolean
  allergens: Record<string, AllergenValue>
}

export type PlatExport = {
  id: string
  code?: string
  name?: {
    ca?: string | null
    es?: string | null
    en?: string | null
  }
  categoryLabel?: string | null
  familyLabel?: string | null
  menus?: string[]
  allergens?: Record<string, string | null>
  consumption?: {
    vegan?: boolean
    vegetarian?: boolean
  }
}

export type PlatLookupItem = {
  id: string
  code: string
  nameCa: string
  nameEs: string
  nameEn: string
}

export type SessionUser = {
  role?: string
  department?: string
}

export type NamedLabelDoc = {
  label?: string
}

export type PlatDocData = {
  code?: string
  name?: {
    ca?: string | null
    es?: string | null
    en?: string | null
  }
  nameMeta?: NameMeta
  category?: string | null
  family?: string | null
  menus?: string[]
  onEstanRaw?: string
  allergens?: Record<string, string | null>
  consumption?: {
    vegan?: boolean
    vegetarian?: boolean
  }
}

export type ParsedImportRow = {
  code: string
  nameCa: string
  rowIndex: number
  sheetKey: string
  data: {
    code: string
    name: { ca: string | null; es: string | null; en: string | null }
    nameMeta: NameMeta
    category: string | null
    categoryLabel: string | null
    family: string | null
    familyLabel: string | null
    menus: string[]
    allergens: Record<string, string | null>
    onEstanRaw: string | null
    consumption: {
      vegan: boolean | null
      vegetarian: boolean | null
    }
    importSource: string
    importSheet: string
    updatedAt: number
  }
}
