'use client'

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Leaf, Salad, Search, SlidersHorizontal, X } from 'lucide-react'
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
import ModuleHeader from '@/components/layout/ModuleHeader'

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

function PlatTranslations({ plat, displayName }: { plat: Plat; displayName: string }) {
  const translations = [
    { language: 'ES', value: plat.name?.es?.trim() },
    { language: 'EN', value: plat.name?.en?.trim() },
  ].filter(
    (item): item is { language: string; value: string } =>
      Boolean(item.value && item.value !== displayName)
  )

  if (translations.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5 text-xs leading-4 text-slate-500">
      {translations.map(item => (
        <p key={item.language} className="line-clamp-2">
          <span className="font-semibold text-slate-600">{item.language}:</span>{' '}
          {item.value}
        </p>
      ))}
    </div>
  )
}

function Chip({
  active,
  children,
  onClick,
}: React.PropsWithChildren<{ active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function CompactAllergenPreview({
  title,
  items,
  variant,
}: {
  title: string
  items: AllergenItem[]
  variant: 'destructive' | 'warning'
}) {
  if (items.length === 0) return null

  const visible = items.slice(0, 3)
  const extra = items.length - visible.length

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {visible.map(item => (
          <Badge key={`${title}-${item.key}`} variant={variant}>
            {item.label}
          </Badge>
        ))}
        {extra > 0 ? <Badge variant="outline">+{extra}</Badge> : null}
      </div>
    </div>
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
        platsRaw.map(row => mapPlatFromFirestore(String(row.id), row as FirestorePlatDoc))
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
        if (!menuFilters.some(menu => menus.includes(menu))) return false
      }

      if (inverseMode && consumptionFilters.vegan && !plat.consumption?.vegan) return false
      if (inverseMode && consumptionFilters.vegetarian && !plat.consumption?.vegetarian) return false

      if (inverseMode) {
        for (const key of avoidedAllergens) {
          const value = plat.allergens?.[key]
          if (value !== 'NO') return false
        }
      }

      return true
    })
  }, [
    plats,
    deferredSearchText,
    categoryFilter,
    familyFilter,
    menuFilters,
    inverseMode,
    avoidedAllergens,
    consumptionFilters,
  ])

  const activeFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (familyFilter !== 'all' ? 1 : 0) +
    (menuFilters.length ? 1 : 0) +
    (consumptionFilters.vegetarian ? 1 : 0) +
    (consumptionFilters.vegan ? 1 : 0) +
    avoidedAllergens.length

  const moreFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (familyFilter !== 'all' ? 1 : 0)

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
    setAvoidedAllergens([])
    setConsumptionFilters({ vegan: false, vegetarian: false })
  }

  const switchSearchMode = (nextMode: 'lookup' | 'suitable') => {
    setInverseMode(nextMode === 'suitable')
    resetFilters()
  }

  if (!allowed) {
    return (
      <>
        <ModuleHeader />
        <div className="p-6 text-center text-sm text-gray-500">
          No tens permisos per accedir al buscador d&apos;allergens.
        </div>
      </>
    )
  }

  return (
    <>
      <ModuleHeader />

      <section className="flex w-full flex-col gap-2 py-2 pb-24 sm:gap-3 sm:py-3">
        <div className="z-20 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-4 lg:sticky lg:top-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
          <div className="grid w-full shrink-0 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 lg:w-auto">
            <button
              type="button"
              onClick={() => switchSearchMode('lookup')}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left transition ${
                !inverseMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
              aria-pressed={!inverseMode}
            >
              <span className="block text-sm font-semibold">Consultar un plat</span>
            </button>
            <button
              type="button"
              onClick={() => switchSearchMode('suitable')}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left transition ${
                inverseMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
              aria-pressed={inverseMode}
            >
              <span className="block text-sm font-semibold">Trobar plats aptes</span>
            </button>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:w-[260px] sm:flex-none">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder={inverseMode ? 'Cercar dins dels resultats' : 'Nom del plat o codi'}
                className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
              />
              {searchText ? (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-500"
                  aria-label="Netejar cerca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {inverseMode ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Chip
                  active={consumptionFilters.vegetarian}
                  onClick={() =>
                    setConsumptionFilters(prev => {
                      const vegetarian = !prev.vegetarian
                      return {
                        vegetarian,
                        vegan: vegetarian ? prev.vegan : false,
                      }
                    })
                  }
                >
                  Vegetarià
                </Chip>
                <Chip
                  active={consumptionFilters.vegan}
                  onClick={() =>
                    setConsumptionFilters(prev => ({
                      ...prev,
                      vegan: !prev.vegan,
                      vegetarian: !prev.vegan ? true : prev.vegetarian,
                    }))
                  }
                >
                  Vegà
                </Chip>
                <Chip active={moreFilterCount > 0} onClick={() => setFiltersOpen(true)}>
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {moreFilterCount > 0 ? `Acotar · ${moreFilterCount}` : 'Acotar resultats'}
                  </span>
                </Chip>
                {activeFilterCount > 0 ? (
                  <Chip active={false} onClick={resetFilters}>Neteja</Chip>
                ) : null}
              </div>
            ) : null}
          </div>
          </div>

          {inverseMode ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Què ha d’evitar el plat?</p>
                {avoidedAllergens.length > 0 ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    {avoidedAllergens.length} exclusions actives
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {allAllergenItems.map(allergen => (
                  <Chip
                    key={allergen.key}
                    active={avoidedAllergens.includes(allergen.key)}
                    onClick={() => toggleAvoidedAllergen(allergen.key)}
                  >
                    Sense {allergen.label.toLocaleLowerCase('ca')}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {menuOptions.length > 0 ? (
            <div className="mt-3 hidden border-t border-slate-100 pt-3 lg:block">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Menús</p>
                {menuFilters.length > 0 ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    {menuFilters.length} seleccionats
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {menuOptions.map(menu => (
                  <Chip
                    key={menu}
                    active={menuFilters.includes(menu)}
                    onClick={() => toggleMenuFilter(menu)}
                  >
                    {menu}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {menuOptions.length > 0 ? (
            <details className="mt-3 border-t border-slate-100 pt-3 lg:hidden">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Menús{menuFilters.length > 0 ? ` · ${menuFilters.length} seleccionats` : ''}
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {menuOptions.map(menu => (
                  <Chip
                    key={`mobile-${menu}`}
                    active={menuFilters.includes(menu)}
                    onClick={() => toggleMenuFilter(menu)}
                  >
                    {menu}
                  </Chip>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <span>{loading ? 'Carregant...' : `${filteredPlats.length} plats`}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredPlats.map(plat => {
            const name = plat.name?.ca || plat.name?.es || plat.name?.en || plat.code || ''
            const menus = resolvePlatMenus(plat)
            const positives = allAllergenItems.filter(
              allergen => plat.allergens?.[allergen.key] === 'SI'
            )
            const traces = allAllergenItems.filter(
              allergen => plat.allergens?.[allergen.key] === 'T'
            )
            const metaParts = [plat.code, plat.familyLabel, plat.categoryLabel].filter(Boolean)
            const visibleMenus = menus.slice(0, 3)

            return (
              <article
                key={plat.id}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm lg:px-4 lg:py-4"
              >
                <div className="md:hidden">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold leading-5 text-slate-900">
                      {name}
                    </h2>

                    {metaParts.length > 0 ? (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {metaParts.join(' · ')}
                      </p>
                    ) : null}

                    <PlatTranslations plat={plat} displayName={name} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={positives.length > 0 ? 'destructive' : 'outline'}>
                      {positives.length} si
                    </Badge>
                    <Badge variant={traces.length > 0 ? 'warning' : 'outline'}>
                      {traces.length} traces
                    </Badge>
                    {plat.consumption?.vegan ? (
                      <Badge variant="success" className="gap-1">
                        <Leaf className="h-3 w-3" />
                        Vega
                      </Badge>
                    ) : null}
                    {!plat.consumption?.vegan && plat.consumption?.vegetarian ? (
                      <Badge variant="success" className="gap-1">
                        <Salad className="h-3 w-3" />
                        Vegetaria
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-2">
                    <CompactAllergenPreview
                      title="Conte"
                      items={positives}
                      variant="destructive"
                    />
                    <CompactAllergenPreview
                      title="Traces"
                      items={traces}
                      variant="warning"
                    />
                  </div>
                </div>

                <div className="hidden h-full md:block">
                <div className="grid h-full grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold leading-5 text-slate-900 lg:text-lg lg:leading-6">
                      {name}
                    </h2>

                    {metaParts.length > 0 ? (
                      <p className="mt-1 truncate text-[11px] text-slate-500 lg:text-xs">
                        {metaParts.join(' · ')}
                      </p>
                    ) : null}

                    <PlatTranslations plat={plat} displayName={name} />

                    <div className="mt-2 flex flex-wrap gap-1.5 lg:mt-3 lg:gap-2">
                      <Badge variant={positives.length > 0 ? 'destructive' : 'outline'}>
                        {positives.length} si
                      </Badge>
                      <Badge variant={traces.length > 0 ? 'warning' : 'outline'}>
                        {traces.length} traces
                      </Badge>
                      {plat.consumption?.vegan ? (
                        <Badge variant="success" className="gap-1">
                          <Leaf className="h-3 w-3" />
                          Vega
                        </Badge>
                      ) : null}
                      {!plat.consumption?.vegan && plat.consumption?.vegetarian ? (
                        <Badge variant="success" className="gap-1">
                          <Salad className="h-3 w-3" />
                          Vegetaria
                        </Badge>
                      ) : null}
                      {visibleMenus.map(menu => (
                        <Badge key={`${plat.id}-${menu}`} variant="outline">
                          {menu}
                        </Badge>
                      ))}
                    </div>

                    {menus.length > 3 && (
                      <div className="mt-2 hidden flex-wrap gap-2 lg:flex">
                        {menus.slice(3).map(menu => (
                          <Badge key={`${plat.id}-${menu}-extra`} variant="outline">
                            {menu}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 border-l border-slate-100 pl-4">
                    {positives.length > 0 ? (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Conte
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {positives.map(allergen => (
                            <Badge
                              key={`${plat.id}-${allergen.key}-si`}
                              variant="destructive"
                            >
                              {allergen.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {traces.length > 0 ? (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Traces
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {traces.map(allergen => (
                            <Badge
                              key={`${plat.id}-${allergen.key}-traces`}
                              variant="warning"
                            >
                              {allergen.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                </div>
              </article>
            )
          })}

          {!loading && filteredPlats.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No hi ha plats que compleixin els filtres actuals.
            </div>
          )}
        </div>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="bottom"
            className="h-[85vh] rounded-t-3xl border-0 bg-white px-0 pb-4 pt-0"
          >
            <SheetHeader className="border-b border-slate-200 px-4 py-4 text-left">
              <SheetTitle className="text-left text-lg font-semibold">Acotar resultats</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 overflow-y-auto px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Grup</label>
                  <Select value={familyFilter} onValueChange={setFamilyFilter}>
                    <SelectTrigger className="bg-white">
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
                  <label className="text-sm font-medium text-slate-700">Tipus</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="bg-white">
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

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={resetFilters}>
                  Reinicia
                </Button>
                <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                  Veure resultats
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

      </section>
    </>
  )
}
