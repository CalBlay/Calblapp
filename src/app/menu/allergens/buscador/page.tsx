'use client'

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Leaf,
  Salad,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DEFAULT_ALLERGENS } from '@/data/allergens'
import { parseMenus } from '../bbdd/utils'
import { fetchAllergensCatalog, fetchAllPlatsForExport } from '@/lib/allergens/bbddClient'
import { useUiPermissions } from '@/hooks/useUiPermissions'

type AllergenFilter = 'ANY' | 'NO' | 'T' | 'SI'

type AllergenItem = {
  key: string
  label: string
}

type Plat = {
  id: string
  code?: string
  name?: {
    ca?: string
    es?: string
    en?: string
  }
  category?: string | null
  categoryLabel?: string | null
  family?: string | null
  familyLabel?: string | null
  menus?: string[]
  onEstanRaw?: string | null
  allergens?: Record<string, string | null>
  consumption?: {
    vegan?: boolean
    vegetarian?: boolean
  }
}

type OptionItem = {
  id: string
  label: string
}

type QuickMode = 'service' | 'safe'

type FirestorePlatDoc = Omit<Plat, 'id' | 'name' | 'menus'> & {
  name?: Plat['name']
  nameCa?: string
  nameEs?: string
  nameEn?: string
  menus?: string[]
  onEstanRaw?: string | null
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()

const ALLERGEN_FILTER_OPTIONS: Array<{ value: AllergenFilter; label: string }> = [
  { value: 'ANY', label: 'Qualsevol' },
  { value: 'NO', label: 'No' },
  { value: 'T', label: 'Traces' },
  { value: 'SI', label: 'Sí' },
]

const buildAllergenFilters = (list: readonly AllergenItem[]) =>
  list.reduce<Record<string, AllergenFilter>>((acc, allergen) => {
    acc[allergen.key] = 'ANY'
    return acc
  }, {})

const mapPlatFromFirestore = (id: string, data: FirestorePlatDoc): Plat => {
  const nameEs = data.name?.es?.trim() || data.nameEs?.trim() || ''
  const nameEn = data.name?.en?.trim() || data.nameEn?.trim() || ''
  const menus =
    Array.isArray(data.menus) && data.menus.length > 0
      ? data.menus
      : parseMenus(data.onEstanRaw || '')

  return {
    id,
    code: data.code || id,
    name: {
      ca: data.name?.ca?.trim() || data.nameCa?.trim() || '',
      es: nameEs || undefined,
      en: nameEn || undefined,
    },
    category: data.category ?? null,
    categoryLabel: data.categoryLabel ?? null,
    family: data.family ?? null,
    familyLabel: data.familyLabel ?? null,
    menus,
    onEstanRaw: data.onEstanRaw ?? null,
    allergens: data.allergens,
    consumption: data.consumption,
  }
}

const resolvePlatMenus = (plat: Plat) =>
  plat.menus && plat.menus.length > 0 ? plat.menus : parseMenus(plat.onEstanRaw || '')

const quickAllergenKeys = ['gluten', 'llet', 'ou', 'fruits-secs', 'cacauet', 'soja']

const quickAllergenFallbacks = ['Gluten', 'Llet', 'Ou', 'Fruits secs', 'Cacauet', 'Soja']

function FilterChip({
  active,
  label,
  onClick,
  tone = 'neutral',
}: {
  active: boolean
  label: string
  onClick: () => void
  tone?: 'neutral' | 'safe' | 'warn'
}) {
  const activeStyles =
    tone === 'safe'
      ? 'border-emerald-300 bg-emerald-500 text-white shadow-sm shadow-emerald-200'
      : tone === 'warn'
        ? 'border-amber-300 bg-amber-500 text-white shadow-sm shadow-amber-200'
        : 'border-slate-900 bg-slate-900 text-white shadow-sm shadow-slate-200'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition',
        active
          ? activeStyles
          : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function SectionPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-xs font-semibold transition',
        active
          ? 'border-orange-300 bg-orange-500 text-white'
          : 'border-orange-100 bg-orange-50/80 text-orange-900',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export default function AllergensSearchPage() {
  const { canViewPath, isLoading: uiPermLoading } = useUiPermissions()

  const allowed = useMemo(() => {
    if (uiPermLoading) return true
    return canViewPath('/menu/allergens/buscador')
  }, [canViewPath, uiPermLoading])

  const [plats, setPlats] = useState<Plat[]>([])
  const [categories, setCategories] = useState<OptionItem[]>([])
  const [families, setFamilies] = useState<OptionItem[]>([])
  const [allergensCatalog, setAllergensCatalog] = useState<AllergenItem[]>(() => [...DEFAULT_ALLERGENS])
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [familyFilter, setFamilyFilter] = useState('all')
  const [menuFilters, setMenuFilters] = useState<string[]>([])
  const [allergenFilters, setAllergenFilters] = useState(() =>
    buildAllergenFilters(DEFAULT_ALLERGENS)
  )
  const [inverseMode, setInverseMode] = useState(false)
  const [avoidedAllergens, setAvoidedAllergens] = useState<string[]>([])
  const [consumptionFilters, setConsumptionFilters] = useState({
    vegan: false,
    vegetarian: false,
  })
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const deferredSearchText = useDeferredValue(searchText)

  useEffect(() => {
    const loadData = async () => {
      const [catalog, platsRaw] = await Promise.all([
        fetchAllergensCatalog(),
        fetchAllPlatsForExport(),
      ])

      setPlats(
        platsRaw.map(row =>
          mapPlatFromFirestore(String(row.id), row as FirestorePlatDoc)
        )
      )

      setCategories(catalog.categories)
      setFamilies(catalog.families)
      setAllergensCatalog(catalog.allergens)
    }

    loadData()
      .catch(err => {
        console.error(err)
      })
      .finally(() => setLoading(false))
  }, [])

  const menuOptions = useMemo(() => {
    const set = new Set<string>()
    plats.forEach(plat => resolvePlatMenus(plat).forEach(menu => set.add(menu)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ca'))
  }, [plats])

  const allAllergenItems = useMemo(() => {
    const known = new Set(allergensCatalog.map(item => item.key))
    const combined = [...allergensCatalog]
    const legacyKeys = new Set<string>()

    plats.forEach(plat => {
      Object.keys(plat.allergens || {}).forEach(key => {
        if (!key || !key.trim()) return
        if (!known.has(key)) legacyKeys.add(key)
      })
    })

    Array.from(legacyKeys)
      .sort((a, b) => a.localeCompare(b))
      .forEach(key => {
        combined.push({ key, label: key })
      })

    return combined
  }, [allergensCatalog, plats])

  useEffect(() => {
    setAllergenFilters(prev => {
      const next: Record<string, AllergenFilter> = {}
      allAllergenItems.forEach(item => {
        next[item.key] = prev[item.key] || 'ANY'
      })
      return next
    })
  }, [allAllergenItems])

  const quickAllergens = useMemo(() => {
    const map = new Map(allAllergenItems.map(item => [normalize(item.key), item]))
    const matches = quickAllergenKeys
      .map(key => map.get(normalize(key)))
      .filter((item): item is AllergenItem => Boolean(item))

    if (matches.length > 0) return matches

    return quickAllergenFallbacks
      .map(label => allAllergenItems.find(item => normalize(item.label) === normalize(label)))
      .filter((item): item is AllergenItem => Boolean(item))
      .slice(0, 6)
  }, [allAllergenItems])

  const activeAdvancedCount = useMemo(
    () => Object.values(allergenFilters).filter(value => value !== 'ANY').length,
    [allergenFilters]
  )

  const activeMenuCount = menuFilters.length
  const avoidedCount = avoidedAllergens.length
  const activeBaseCount = [
    categoryFilter !== 'all',
    familyFilter !== 'all',
    consumptionFilters.vegetarian,
    consumptionFilters.vegan,
    inverseMode,
    activeMenuCount > 0,
    avoidedCount > 0,
  ].filter(Boolean).length
  const activeFilterCount = activeBaseCount + activeAdvancedCount
  const quickMode: QuickMode = inverseMode ? 'safe' : 'service'

  const filteredPlats = useMemo(() => {
    const search = normalize(deferredSearchText)

    return plats.filter(plat => {
      if (search) {
        const haystack = [
          plat.code || '',
          plat.name?.ca || '',
          plat.name?.es || '',
          plat.name?.en || '',
          plat.categoryLabel || '',
          plat.familyLabel || '',
          ...resolvePlatMenus(plat),
        ]
          .map(value => normalize(value))
          .join(' ')

        if (!haystack.includes(search)) return false
      }

      if (categoryFilter !== 'all' && plat.category !== categoryFilter) return false
      if (familyFilter !== 'all' && plat.family !== familyFilter) return false

      if (menuFilters.length) {
        const menus = resolvePlatMenus(plat)
        if (!menuFilters.every(menu => menus.includes(menu))) return false
      }

      if (consumptionFilters.vegan && !plat.consumption?.vegan) return false
      if (consumptionFilters.vegetarian && !plat.consumption?.vegetarian) return false

      if (inverseMode && avoidedAllergens.length > 0) {
        for (const key of avoidedAllergens) {
          const value = plat.allergens?.[key]
          if (value !== 'NO') return false
        }
      }

      for (const allergen of allAllergenItems) {
        const filterValue = allergenFilters[allergen.key] || 'ANY'
        if (filterValue === 'ANY') continue
        const value = plat.allergens?.[allergen.key]
        if (value !== filterValue) return false
      }

      return true
    })
  }, [
    plats,
    deferredSearchText,
    categoryFilter,
    familyFilter,
    menuFilters,
    allergenFilters,
    allAllergenItems,
    inverseMode,
    avoidedAllergens,
    consumptionFilters,
  ])

  const topMenus = menuOptions.slice(0, 8)

  const toggleMenuFilter = (menu: string) => {
    setMenuFilters(prev =>
      prev.includes(menu) ? prev.filter(item => item !== menu) : [...prev, menu]
    )
  }

  const toggleAvoidedAllergen = (key: string) => {
    setAvoidedAllergens(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    )
  }

  const resetFilters = () => {
    setSearchText('')
    setCategoryFilter('all')
    setFamilyFilter('all')
    setMenuFilters([])
    setAllergenFilters(buildAllergenFilters(allAllergenItems))
    setInverseMode(false)
    setAvoidedAllergens([])
    setConsumptionFilters({ vegan: false, vegetarian: false })
  }

  const activateQuickMode = (mode: QuickMode) => {
    setInverseMode(mode === 'safe')
    if (mode !== 'safe') {
      setAvoidedAllergens([])
    }
  }

  if (!allowed) {
    return (
      <>
        <ModuleHeader />
        <div className="p-6 text-center text-sm text-gray-500">
          No tens permisos per accedir al buscador d&apos;allèrgens.
        </div>
      </>
    )
  }

  return (
    <>
      <ModuleHeader subtitle="Consulta ràpida pensada per servei, sala i cuina." />

      <section className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.14),_transparent_38%),linear-gradient(180deg,_#fff8f1_0%,_#fffdf8_40%,_#ffffff_100%)] pb-28">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6">
          <div className="overflow-hidden rounded-[28px] border border-orange-100 bg-white/85 shadow-[0_18px_50px_rgba(148,64,14,0.08)] backdrop-blur">
            <div className="border-b border-orange-100 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffedd5_42%,_#fde68a_100%)] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      Mobile servei ràpid
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                      Troba un plat segur en segons
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-700">
                      Dissenyat per respondre al client amb una sola mà, sense perdre temps
                      buscant entre taules o filtres amagats.
                    </p>
                  </div>

                  <div className="hidden rounded-3xl border border-white/70 bg-white/70 px-4 py-3 text-right shadow-sm md:block">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Resultats
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                      {loading ? '...' : filteredPlats.length}
                    </div>
                    <div className="text-xs text-slate-500">
                      {quickMode === 'safe' ? 'Mode apte' : 'Mode servei'}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => activateQuickMode('service')}
                    className={[
                      'rounded-[24px] border p-4 text-left transition',
                      quickMode === 'service'
                        ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-200'
                        : 'border-white/80 bg-white/80 text-slate-800',
                    ].join(' ')}
                  >
                    <div className="mb-2 inline-flex rounded-full bg-white/15 p-2">
                      <Search className="h-5 w-5" />
                    </div>
                    <div className="text-base font-bold">Servei ràpid</div>
                    <p className="mt-1 text-sm leading-5 text-inherit/80">
                      Busca per nom, menú o tipus i resol preguntes al moment.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => activateQuickMode('safe')}
                    className={[
                      'rounded-[24px] border p-4 text-left transition',
                      quickMode === 'safe'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                        : 'border-white/80 bg-white/80 text-slate-800',
                    ].join(' ')}
                  >
                    <div className="mb-2 inline-flex rounded-full bg-white/15 p-2">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="text-base font-bold">Apta per client</div>
                    <p className="mt-1 text-sm leading-5 text-inherit/80">
                      Marca què cal evitar i mostra només plats sense risc directe ni traces.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky top-0 z-20 border-b border-orange-100 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-inner">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" />
                  <Input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Nom, codi, grup, tipus o menú"
                    className="h-auto border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0"
                  />
                  {searchText ? (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"
                      aria-label="Netejar cerca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={consumptionFilters.vegetarian}
                    label="Vegetària"
                    tone="safe"
                    onClick={() =>
                      setConsumptionFilters(prev => ({
                        ...prev,
                        vegetarian: !prev.vegetarian,
                        vegan: prev.vegan && !prev.vegetarian ? false : prev.vegan,
                      }))
                    }
                  />
                  <FilterChip
                    active={consumptionFilters.vegan}
                    label="Vega"
                    tone="safe"
                    onClick={() =>
                      setConsumptionFilters(prev => ({
                        ...prev,
                        vegan: !prev.vegan,
                        vegetarian: !prev.vegan ? true : prev.vegetarian,
                      }))
                    }
                  />
                  <FilterChip
                    active={filtersOpen}
                    label={activeFilterCount > 0 ? `Filtres (${activeFilterCount})` : 'Filtres'}
                    onClick={() => setFiltersOpen(true)}
                  />
                  <FilterChip
                    active={activeFilterCount > 0 || searchText.length > 0}
                    label="Neteja"
                    tone="warn"
                    onClick={resetFilters}
                  />
                </div>

                {quickMode === 'safe' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Evitar ara mateix
                      </p>
                      <span className="text-xs text-slate-500">
                        {avoidedCount > 0 ? `${avoidedCount} actius` : 'Cap actiu'}
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {quickAllergens.map(allergen => (
                        <FilterChip
                          key={allergen.key}
                          active={avoidedAllergens.includes(allergen.key)}
                          label={allergen.label}
                          tone="safe"
                          onClick={() => toggleAvoidedAllergen(allergen.key)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {topMenus.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Menús ràpids
                      </p>
                      {activeMenuCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setMenuFilters([])}
                          className="text-xs font-semibold text-orange-700"
                        >
                          Treure menús
                        </button>
                      ) : null}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {topMenus.map(menu => (
                        <SectionPill
                          key={menu}
                          active={menuFilters.includes(menu)}
                          label={menu}
                          onClick={() => toggleMenuFilter(menu)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Resultats
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {loading ? '...' : filteredPlats.length}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading ? 'Carregant plats...' : 'Llista filtrada en temps real'}
                  </p>
                </div>

                <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Mode actiu
                  </p>
                  <p className="mt-2 text-lg font-black text-slate-900">
                    {quickMode === 'safe' ? 'Només plats aptes' : 'Consulta general'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {quickMode === 'safe'
                      ? 'S’exclou qualsevol plat amb presència o traça dels al·lèrgens marcats.'
                      : 'Ideal per trobar plats, famílies i menús molt ràpid.'}
                  </p>
                </div>

                <div className="rounded-[24px] border border-orange-100 bg-orange-50/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                    Pressió de servei
                  </p>
                  <p className="mt-2 text-lg font-black text-slate-900">
                    Una mà, una pregunta, una resposta
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Xips grans, cerca visible i filtres al polze per reduir passos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredPlats.map(plat => {
                  const name = plat.name?.ca || plat.name?.es || plat.name?.en || plat.code || ''
                  const menus = resolvePlatMenus(plat)
                  const positives = allAllergenItems.filter(
                    allergen => plat.allergens?.[allergen.key] === 'SI'
                  )
                  const traces = allAllergenItems.filter(
                    allergen => plat.allergens?.[allergen.key] === 'T'
                  )
                  const safeAllergens = quickMode === 'safe'
                    ? avoidedAllergens.filter(key => plat.allergens?.[key] === 'NO').length
                    : 0

                  return (
                    <article
                      key={plat.id}
                      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.06)]"
                    >
                      <div className="border-b border-slate-100 bg-[linear-gradient(135deg,_rgba(255,247,237,0.95),_rgba(255,255,255,0.8))] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              {plat.code ? (
                                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                                  {plat.code}
                                </span>
                              ) : null}
                              {quickMode === 'safe' && safeAllergens > 0 ? (
                                <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                                  Apte pels marcats
                                </span>
                              ) : null}
                            </div>
                            <h2 className="text-lg font-black leading-tight text-slate-900">
                              {name}
                            </h2>
                            {plat.name?.es && plat.name.es !== name ? (
                              <p className="mt-1 text-sm text-slate-500">ES: {plat.name.es}</p>
                            ) : null}
                            {plat.name?.en && plat.name.en !== name ? (
                              <p className="text-sm text-slate-500">EN: {plat.name.en}</p>
                            ) : null}
                          </div>

                          <div className="grid shrink-0 grid-cols-2 gap-2 text-center sm:grid-cols-3">
                            <div className="rounded-2xl bg-red-50 px-3 py-2">
                              <div className="text-lg font-black text-red-700">{positives.length}</div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-600">
                                Sí
                              </div>
                            </div>
                            <div className="rounded-2xl bg-amber-50 px-3 py-2">
                              <div className="text-lg font-black text-amber-700">{traces.length}</div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                                Traces
                              </div>
                            </div>
                            <div className="hidden rounded-2xl bg-emerald-50 px-3 py-2 sm:block">
                              <div className="text-lg font-black text-emerald-700">
                                {allAllergenItems.length - positives.length - traces.length}
                              </div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                                Sense risc
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {plat.familyLabel ? <Badge variant="outline">{plat.familyLabel}</Badge> : null}
                          {plat.categoryLabel ? (
                            <Badge variant="secondary">{plat.categoryLabel}</Badge>
                          ) : null}
                          {plat.consumption?.vegan ? (
                            <Badge variant="success" className="gap-1">
                              <Leaf className="h-3 w-3" />
                              Vega
                            </Badge>
                          ) : null}
                          {!plat.consumption?.vegan && plat.consumption?.vegetarian ? (
                            <Badge variant="success" className="gap-1">
                              <Salad className="h-3 w-3" />
                              Vegetària
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="p-4">
                        {menus.length > 0 ? (
                          <div className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Disponible a
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {menus.map(menu => (
                                <Badge key={`${plat.id}-${menu}`} variant="outline" className="rounded-full px-3 py-1">
                                  {menu}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <p className="text-sm font-bold text-slate-900">Conté</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {positives.length > 0 ? (
                                positives.map(allergen => (
                                  <Badge
                                    key={`${plat.id}-${allergen.key}-si`}
                                    variant="destructive"
                                    className="rounded-full px-3 py-1"
                                  >
                                    {allergen.label}
                                  </Badge>
                                ))
                              ) : (
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  No hi ha al·lèrgens marcats com Sí
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-amber-500" />
                              <p className="text-sm font-bold text-slate-900">Traces</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {traces.length > 0 ? (
                                traces.map(allergen => (
                                  <Badge
                                    key={`${plat.id}-${allergen.key}-traces`}
                                    variant="warning"
                                    className="rounded-full px-3 py-1"
                                  >
                                    {allergen.label}
                                  </Badge>
                                ))
                              ) : (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                  Sense traces informades
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}

                {!loading && filteredPlats.length === 0 && (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                      <Search className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900">
                      No hi ha cap plat que encaixi ara mateix
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                      Prova de treure algun filtre o canvia a mode servei ràpid per ampliar
                      la cerca.
                    </p>
                    <Button variant="outline" className="mt-4" onClick={resetFilters}>
                      Reinicia els filtres
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Buscador al·lèrgens
              </p>
              <p className="truncate text-sm font-bold text-slate-900">
                {loading ? 'Carregant...' : `${filteredPlats.length} plats visibles`}
              </p>
            </div>
            <Button
              variant="secondary"
              className="h-12 rounded-full px-4"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filtres
            </Button>
          </div>
        </div>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="bottom"
            className="h-[88vh] rounded-t-[32px] border-0 bg-[#fffaf5] px-0 pb-6 pt-0"
          >
            <SheetHeader className="sticky top-0 z-10 rounded-t-[32px] border-b border-orange-100 bg-[#fffaf5] px-5 py-4 text-left">
              <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-orange-200" />
              <SheetTitle className="text-left text-2xl font-black text-slate-900">
                Filtres de servei
              </SheetTitle>
              <p className="text-sm text-slate-500">
                Configura la cerca per tipus, grup, menús i estat de cada al·lèrgen.
              </p>
            </SheetHeader>

            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Grup</label>
                    <Select value={familyFilter} onValueChange={setFamilyFilter}>
                      <SelectTrigger className="h-12 rounded-2xl bg-white">
                        <SelectValue placeholder="Tots els grups" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tots els grups</SelectItem>
                        {families.map(fam => (
                          <SelectItem key={fam.id} value={fam.id}>
                            {fam.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800">Tipus</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-12 rounded-2xl bg-white">
                        <SelectValue placeholder="Tots els tipus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tots els tipus</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {menuOptions.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-800">Menús</label>
                      <span className="text-xs text-slate-500">{activeMenuCount} seleccionats</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {menuOptions.map(menu => (
                        <SectionPill
                          key={menu}
                          active={menuFilters.includes(menu)}
                          label={menu}
                          onClick={() => toggleMenuFilter(menu)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {quickMode === 'safe' ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-800">
                        Al·lèrgens a evitar
                      </label>
                      <span className="text-xs text-slate-500">{avoidedCount} seleccionats</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {allAllergenItems.map(allergen => (
                        <FilterChip
                          key={allergen.key}
                          active={avoidedAllergens.includes(allergen.key)}
                          label={allergen.label}
                          tone="safe"
                          onClick={() => toggleAvoidedAllergen(allergen.key)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-800">
                      Matriu d&apos;al·lèrgens
                    </label>
                    <span className="text-xs text-slate-500">
                      {activeAdvancedCount > 0
                        ? `${activeAdvancedCount} filtres actius`
                        : 'Cap filtre actiu'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {allAllergenItems.map(allergen => (
                      <div
                        key={allergen.key}
                        className="rounded-[22px] border border-orange-100 bg-white p-3 shadow-sm"
                      >
                        <label className="mb-2 block text-sm font-semibold text-slate-800">
                          {allergen.label}
                        </label>
                        <Select
                          value={allergenFilters[allergen.key]}
                          onValueChange={value =>
                            setAllergenFilters(prev => ({
                              ...prev,
                              [allergen.key]: value as AllergenFilter,
                            }))
                          }
                        >
                          <SelectTrigger className="h-11 rounded-2xl bg-slate-50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALLERGEN_FILTER_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-orange-100 bg-[#fffaf5] px-5 pt-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    className="h-12 flex-1 rounded-full"
                    onClick={resetFilters}
                  >
                    Reinicia
                  </Button>
                  <Button
                    className="h-12 flex-1 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => setFiltersOpen(false)}
                  >
                    Veure {loading ? '...' : filteredPlats.length} resultats
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </section>
    </>
  )
}
