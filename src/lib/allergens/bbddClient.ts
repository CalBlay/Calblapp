import type { ImportConflictItem, PlatDocData } from '@/app/menu/allergens/bbdd/types'

export type AllergensCatalogResponse = {
  categories: Array<{ id: string; label: string }>
  families: Array<{ id: string; label: string }>
  menus: Array<{ id: string; label: string }>
  allergens: Array<{ key: string; label: string }>
  allergensSource: 'default' | 'db'
  platsIndex: Array<{
    id: string
    code: string
    nameCa: string
    nameEs: string
    nameEn: string
  }>
  importConflicts: ImportConflictItem[]
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as T | { error?: string } | null
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: string }).error)
        : `HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}

export async function fetchAllergensCatalog(): Promise<AllergensCatalogResponse> {
  const res = await fetch('/api/allergens/bbdd/catalog', { cache: 'no-store' })
  return parseJson<AllergensCatalogResponse>(res)
}

export async function fetchPlatByCode(code: string): Promise<PlatDocData & { id: string }> {
  const res = await fetch(`/api/allergens/bbdd/plats/${encodeURIComponent(code)}`, {
    cache: 'no-store',
  })
  return parseJson<PlatDocData & { id: string }>(res)
}

export async function fetchAllPlatsForExport() {
  const res = await fetch('/api/allergens/bbdd/plats', { cache: 'no-store' })
  const data = await parseJson<{ plats: Array<Record<string, unknown> & { id: string }> }>(res)
  return data.plats
}

type TaxonomyEntry = { id: string; label: string; source?: string }

export async function savePlat(params: {
  code: string
  payload: Record<string, unknown>
  taxonomy?: {
    category?: TaxonomyEntry | null
    family?: TaxonomyEntry | null
    menu?: TaxonomyEntry | null
  }
}) {
  const res = await fetch(`/api/allergens/bbdd/plats/${encodeURIComponent(params.code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: params.payload, taxonomy: params.taxonomy }),
  })
  return parseJson<{ ok: boolean }>(res)
}

export async function patchPlat(code: string, updates: Record<string, unknown>) {
  const res = await fetch(`/api/allergens/bbdd/plats/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return parseJson<{ ok: boolean }>(res)
}

export async function deletePlat(code: string) {
  const res = await fetch(`/api/allergens/bbdd/plats/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  })
  return parseJson<{ ok: boolean }>(res)
}

export async function seedDefaultAllergens() {
  const res = await fetch('/api/allergens/bbdd/allergens/seed', { method: 'POST' })
  return parseJson<{ ok: boolean }>(res)
}

export async function upsertAllergen(key: string, label: string) {
  const res = await fetch(`/api/allergens/bbdd/allergens/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, source: 'manual' }),
  })
  return parseJson<{ ok: boolean }>(res)
}

export async function deleteAllergen(key: string, removeFromPlats: boolean) {
  const qs = removeFromPlats ? '?removeFromPlats=true' : ''
  const res = await fetch(`/api/allergens/bbdd/allergens/${encodeURIComponent(key)}${qs}`, {
    method: 'DELETE',
  })
  return parseJson<{ ok: boolean }>(res)
}
