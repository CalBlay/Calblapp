'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
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
import { DEFAULT_ALLERGENS, sortAllergensByStandardOrder } from '@/data/allergens'
import { getVisibleModules } from '@/lib/accessControl'
import { db } from '@/lib/firebaseClient'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'

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

export default function AllergensSearchPage() {
  const { data: session } = useSession()
  const user = session?.user

  const allowed = useMemo(() => {
    const module = getVisibleModules({
      role: user?.role,
      department: user?.department,
    }).find(mod => mod.path === '/menu/allergens')
    return module?.submodules?.some(sub => sub.path === '/menu/allergens/buscador')
  }, [user?.role, user?.department])

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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const [platsSnap, categorySnap, familySnap, allergenSnap] = await Promise.all([
        getDocs(collection(db, 'plats')),
        getDocs(query(collection(db, 'categories'), orderBy('label'))),
        getDocs(query(collection(db, 'family'), orderBy('label'))),
        getDocs(query(collection(db, 'allergens'), orderBy('label'))),
      ])

      setPlats(
        platsSnap.docs.map(docSnap => {
          const data = docSnap.data() as Omit<Plat, 'id'>
          return {
            id: docSnap.id,
            ...data,
            code: data.code || docSnap.id,
          }
        })
      )

      setCategories(
        categorySnap.docs.map(docSnap => ({
          id: docSnap.id,
          label: (docSnap.data().label as string) || docSnap.id,
        }))
      )

      setFamilies(
        familySnap.docs.map(docSnap => ({
          id: docSnap.id,
          label: (docSnap.data().label as string) || docSnap.id,
        }))
      )

      const dbAllergens = allergenSnap.docs.map(docSnap => ({
        key: docSnap.id,
        label: (docSnap.data().label as string) || docSnap.id,
      }))

      if (dbAllergens.length) {
        setAllergensCatalog(sortAllergensByStandardOrder(dbAllergens))
      } else {
        setAllergensCatalog([...DEFAULT_ALLERGENS])
      }
    }

    loadData()
      .catch(err => {
        console.error(err)
      })
      .finally(() => setLoading(false))
  }, [])

  const menuOptions = useMemo(() => {
    const set = new Set<string>()
    plats.forEach(plat => plat.menus?.forEach(menu => set.add(menu)))
    return Array.from(set).sort()
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

  const activeAdvancedCount = useMemo(
    () =>
      Object.values(allergenFilters).filter(value => value !== 'ANY')
        .length,
    [allergenFilters]
  )

  const avoidedCount = avoidedAllergens.length

  useEffect(() => {
    setAllergenFilters(prev => {
      const next: Record<string, AllergenFilter> = {}
      allAllergenItems.forEach(item => {
        next[item.key] = prev[item.key] || 'ANY'
      })
      return next
    })
  }, [allAllergenItems])

  const filteredPlats = useMemo(() => {
    const search = normalize(searchText)
    return plats.filter(plat => {
      if (search) {
        const haystack = [
          plat.code || '',
          plat.name?.ca || '',
          plat.name?.es || '',
          plat.name?.en || '',
        ]
          .map(value => normalize(value))
          .join(' ')
        if (!haystack.includes(search)) return false
      }

      if (categoryFilter !== 'all') {
        if (plat.category !== categoryFilter) return false
      }

      if (familyFilter !== 'all') {
        if (plat.family !== familyFilter) return false
      }

      if (menuFilters.length) {
        const menus = plat.menus || []
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
    searchText,
    categoryFilter,
    familyFilter,
    menuFilters,
    allergenFilters,
    allAllergenItems,
    inverseMode,
    avoidedAllergens,
    consumptionFilters,
  ])

  const toggleMenuFilter = (menu: string) => {
    setMenuFilters(prev =>
      prev.includes(menu) ? prev.filter(item => item !== menu) : [...prev, menu]
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
    setShowAdvanced(false)
    setConsumptionFilters({ vegan: false, vegetarian: false })
  }

  const toggleAvoidedAllergen = (key: string) => {
    setAvoidedAllergens(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    )
  }

  if (!allowed) {
    return (
      <>
        <ModuleHeader />
        <div className="p-6 text-center text-sm text-gray-500">
          No tens permisos per accedir al buscador d'al·lèrgens.
        </div>
      </>
    )
  }

  return (
    <>
      <ModuleHeader subtitle="Filtra plats per al·lèrgens, menús i models de consum." />

      <section className="w-full max-w-6xl mx-auto p-6 flex flex-col gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Cercar per nom o codi"
              />

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Totes les categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={familyFilter} onValueChange={setFamilyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Família" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Totes les famílies</SelectItem>
                  {families.map(fam => (
                    <SelectItem key={fam.id} value={fam.id}>
                      {fam.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consumptionFilters.vegetarian}
                  disabled={consumptionFilters.vegan}
                  onChange={e =>
                    setConsumptionFilters(prev => ({
                      ...prev,
                      vegetarian: e.target.checked,
                    }))
                  }
                />
                Vegetarià
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consumptionFilters.vegan}
                  onChange={e =>
                    setConsumptionFilters(prev => ({
                      ...prev,
                      vegan: e.target.checked,
                      vegetarian: e.target.checked ? true : prev.vegetarian,
                    }))
                  }
                />
                Vegà
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={inverseMode}
                  onChange={e => setInverseMode(e.target.checked)}
                />
                Cerca inversa (apta per al·lèrgics)
              </label>

              <Button variant="outline" onClick={resetFilters}>
                Neteja filtres
              </Button>

              <Button
                variant="secondary"
                onClick={() => setShowAdvanced(prev => !prev)}
              >
                {showAdvanced ? 'Amaga avançat' : 'Avançat'}
                {activeAdvancedCount > 0 && ` (${activeAdvancedCount})`}
              </Button>
            </div>

            {inverseMode && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Al·lèrgens a evitar (NO, sense traces)
                  {avoidedCount > 0 && ` · ${avoidedCount}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {allAllergenItems.map(allergen => (
                    <button
                      key={allergen.key}
                      type="button"
                      onClick={() => toggleAvoidedAllergen(allergen.key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        avoidedAllergens.includes(allergen.key)
                          ? 'bg-red-100 border-red-300 text-red-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {allergen.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuOptions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Menús</p>
                <div className="flex flex-wrap gap-2">
                  {menuOptions.map(menu => (
                    <button
                      key={menu}
                      type="button"
                      onClick={() => toggleMenuFilter(menu)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        menuFilters.includes(menu)
                          ? 'bg-amber-100 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {menu}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Filtres d'al·lèrgens
              </h2>
              <p className="text-xs text-slate-500">
                {activeAdvancedCount > 0
                  ? `${activeAdvancedCount} seleccionats`
                  : 'Cap filtre actiu'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto pr-2">
              {allAllergenItems.map(allergen => (
                <div key={allergen.key}>
                  <label className="text-sm font-medium text-slate-700">
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
                    <SelectTrigger className="mt-1">
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
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {loading ? 'Carregant plats…' : `${filteredPlats.length} plats trobats`}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredPlats.map(plat => {
            const name = plat.name?.ca || plat.name?.es || plat.name?.en || plat.code || ''
            const allergenBadges = allAllergenItems.map(allergen => {
              const value = plat.allergens?.[allergen.key]
              if (value !== 'SI' && value !== 'T') return null
              const label = value === 'T' ? `${allergen.label} (Traces)` : allergen.label
              return (
                <Badge
                  key={`${plat.id}-${allergen.key}`}
                  variant={value === 'SI' ? 'destructive' : 'warning'}
                >
                  {label}
                </Badge>
              )
            }).filter(Boolean)

            return (
              <div key={plat.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{name}</h3>
                    <p className="text-xs text-slate-500">{plat.code}</p>
                    {plat.name?.es && (
                      <p className="text-xs text-slate-500">ESP: {plat.name.es}</p>
                    )}
                    {plat.name?.en && (
                      <p className="text-xs text-slate-500">ENG: {plat.name.en}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {plat.categoryLabel && <Badge variant="secondary">{plat.categoryLabel}</Badge>}
                    {plat.familyLabel && <Badge variant="outline">{plat.familyLabel}</Badge>}
                    {plat.consumption?.vegan && <Badge variant="success">Vegà</Badge>}
                    {!plat.consumption?.vegan && plat.consumption?.vegetarian && (
                      <Badge variant="success">Vegetarià</Badge>
                    )}
                  </div>
                </div>

                {plat.menus && plat.menus.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {plat.menus.map(menu => (
                      <Badge key={`${plat.id}-${menu}`} variant="outline">
                        {menu}
                      </Badge>
                    ))}
                  </div>
                )}

                {allergenBadges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">{allergenBadges}</div>
                )}
              </div>
            )
          })}

          {!loading && filteredPlats.length === 0 && (
            <div className="text-center text-sm text-slate-500">
              No hi ha plats que compleixin els filtres actuals.
            </div>
          )}
        </div>
      </section>
    </>
  )
}
