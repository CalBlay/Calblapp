'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import ExportMenu from '@/components/export/ExportMenu'
import { Input } from '@/components/ui/input'
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
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { loadXlsx } from '@/lib/loadXlsx'

type AllergenValue = 'SI' | 'NO' | 'T' | ''

type AllergenItem = {
  key: string
  label: string
}

type NameMeta = {
  es?: { auto?: boolean; reviewed?: boolean }
  en?: { auto?: boolean; reviewed?: boolean }
}

type OptionItem = {
  id: string
  label: string
}

type FormState = {
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

type PlatExport = {
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

type PlatLookupItem = {
  id: string
  code: string
  nameCa: string
  nameEs: string
  nameEn: string
}

const buildAllergensState = (
  source: Record<string, string | null> = {},
  list: readonly AllergenItem[] = DEFAULT_ALLERGENS
): Record<string, AllergenValue> => {
  const state: Record<string, AllergenValue> = {}
  list.forEach(({ key }) => {
    const value = source?.[key]
    state[key] = value === 'SI' || value === 'T' ? value : ''
  })
  return state
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()

const slugify = (value: string) => normalize(value).replace(/\s+/g, '-')

const parseMenus = (value: string) => {
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

const normalizeMenuId = (value: string) =>
  normalize(value).replace(/\s+/g, '').toUpperCase()

const formatMenuLabel = (value: string) => value.trim().toUpperCase()

const toAllergenKey = (value: string) => {
  const parts = normalize(value).split(' ').filter(Boolean)
  return parts
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('')
}

const DEFAULT_ALLERGEN_KEYS = new Set<string>(DEFAULT_ALLERGENS.map(allergen => allergen.key))

const defaultFormState: FormState = {
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

const EMPTY_SELECT = '__none__'

const ALLERGEN_OPTIONS: Array<{ value: AllergenValue | typeof EMPTY_SELECT; label: string }> = [
  { value: EMPTY_SELECT, label: '-' },
  { value: 'T', label: 'Traces' },
  { value: 'SI', label: 'Si' },
]

export default function AllergensBbddPage() {
  const { data: session } = useSession()
  const user = session?.user

  const allowed = useMemo(() => {
    const module = getVisibleModules({
      role: user?.role,
      department: user?.department,
    }).find(mod => mod.path === '/menu/allergens')
    return module?.submodules?.some(sub => sub.path === '/menu/allergens/bbdd')
  }, [user?.role, user?.department])

  const [form, setForm] = useState<FormState>(defaultFormState)
  const [categories, setCategories] = useState<OptionItem[]>([])
  const [families, setFamilies] = useState<OptionItem[]>([])
  const [menusCatalog, setMenusCatalog] = useState<OptionItem[]>([])
  const [allergensCatalog, setAllergensCatalog] = useState<AllergenItem[]>(() => [...DEFAULT_ALLERGENS])
  const [allergensSource, setAllergensSource] = useState<'default' | 'db'>('default')
  const [platsIndex, setPlatsIndex] = useState<PlatLookupItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchField, setActiveSearchField] = useState<'code' | 'nameCa' | null>(null)
  const [, setSelectedLookupCode] = useState('')
  const [, setSelectedLookupName] = useState('')
  const [originalAllergens, setOriginalAllergens] = useState<Record<string, string | null>>({})
  const [extraAllergens, setExtraAllergens] = useState<AllergenItem[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newFamily, setNewFamily] = useState('')
  const [newMenu, setNewMenu] = useState('')
  const [newAllergen, setNewAllergen] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [translating, setTranslating] = useState(false)

  const menuItems = useMemo(() => {
    const known = new Set(menusCatalog.map(item => item.id))
    const combined = [...menusCatalog]
    form.menus.forEach(menuId => {
      if (!known.has(menuId)) combined.push({ id: menuId, label: menuId })
    })
    return combined
  }, [menusCatalog, form.menus])

  const allergenItems = useMemo(() => {
    const known = new Set(allergensCatalog.map(item => item.key))
    const combined = [...allergensCatalog]
    extraAllergens.forEach(item => {
      if (!known.has(item.key)) combined.push(item)
    })
    return combined
  }, [allergensCatalog, extraAllergens])

  const customAllergens = useMemo(
    () => allergensCatalog.filter(item => !DEFAULT_ALLERGEN_KEYS.has(item.key)),
    [allergensCatalog]
  )

  const formatLookupName = (item: Pick<PlatLookupItem, 'nameCa' | 'nameEs' | 'nameEn'>) =>
    item.nameCa || item.nameEs || item.nameEn || ''

  const searchResults = useMemo(() => {
    const q = normalize(searchQuery)
    if (!q || q.length < 2) return []

    const starts: PlatLookupItem[] = []
    const contains: PlatLookupItem[] = []

    platsIndex.forEach(item => {
      const codeNorm = normalize(item.code)
      const nameCaNorm = normalize(item.nameCa)
      const nameEsNorm = normalize(item.nameEs)
      const nameEnNorm = normalize(item.nameEn)
      const haystack = `${codeNorm} ${nameCaNorm} ${nameEsNorm} ${nameEnNorm}`.trim()
      if (!haystack.includes(q)) return

      const startsWith =
        codeNorm.startsWith(q) ||
        nameCaNorm.startsWith(q) ||
        nameEsNorm.startsWith(q) ||
        nameEnNorm.startsWith(q)

      if (startsWith) starts.push(item)
      else contains.push(item)
    })

    return [...starts, ...contains].slice(0, 8)
  }, [platsIndex, searchQuery])

  useEffect(() => {
    const loadOptions = async () => {
      const [categorySnap, familySnap, menuSnap, allergenSnap, platsSnap] = await Promise.all([
        getDocs(query(collection(db, 'categories'), orderBy('label'))),
        getDocs(query(collection(db, 'family'), orderBy('label'))),
        getDocs(query(collection(db, 'menus'), orderBy('label'))),
        getDocs(query(collection(db, 'allergens'), orderBy('label'))),
        getDocs(collection(db, 'plats')),
      ])

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
      setMenusCatalog(
        menuSnap.docs.map(docSnap => ({
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
        setAllergensSource('db')
      } else {
        setAllergensCatalog([...DEFAULT_ALLERGENS])
        setAllergensSource('default')
      }

      setPlatsIndex(
        platsSnap.docs.map(docSnap => {
          const data = docSnap.data() as any
          return {
            id: docSnap.id,
            code: String(data.code || docSnap.id),
            nameCa: String(data.name?.ca || ''),
            nameEs: String(data.name?.es || ''),
            nameEn: String(data.name?.en || ''),
          }
        })
      )
    }

    loadOptions().catch(err => {
      console.error(err)
    })
  }, [])

  useEffect(() => {
    setExtraAllergens(prev => {
      const known = new Set(allergensCatalog.map(item => item.key))
      const next = prev.filter(item => !known.has(item.key))
      if (next.length === prev.length) return prev
      return next
    })
  }, [allergensCatalog])

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleNameChange = (field: 'nameEs' | 'nameEn', value: string) => {
    const trimmed = value.trim()
    const metaKey = field === 'nameEs' ? 'es' : 'en'

    setForm(prev => {
      const nextMeta = { ...prev.nameMeta }
      if (trimmed) {
        nextMeta[metaKey] = { auto: false, reviewed: true }
      } else {
        delete nextMeta[metaKey]
      }

      return {
        ...prev,
        [field]: value,
        nameMeta: nextMeta,
      }
    })
  }

  const handleAllergenChange = (key: string, value: AllergenValue) => {
    setForm(prev => ({
      ...prev,
      allergens: {
        ...prev.allergens,
        [key]: value,
      },
    }))
  }

  const handleVeganToggle = (checked: boolean) => {
    setForm(prev => ({
      ...prev,
      vegan: checked,
      vegetarian: checked ? true : prev.vegetarian,
    }))
  }

  const requestTranslation = async (text: string, target: 'ES' | 'EN') => {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target }),
    })
    if (!res.ok) {
      throw new Error('Translation failed')
    }
    const data = await res.json()
    return (data?.text as string) || ''
  }

  const handleAutoTranslate = async () => {
    const source = form.nameCa.trim()
    if (!source) {
      setStatus('Cal indicar el nom en catala.')
      return
    }

    setTranslating(true)
    setStatus('')

    try {
      const updates: Partial<FormState> = {}
      const metaUpdates: NameMeta = { ...form.nameMeta }

      if (!form.nameEs.trim()) {
        const translated = await requestTranslation(source, 'ES')
        if (translated) {
          updates.nameEs = translated
          metaUpdates.es = { auto: true, reviewed: false }
        }
      }

      if (!form.nameEn.trim()) {
        const translated = await requestTranslation(source, 'EN')
        if (translated) {
          updates.nameEn = translated
          metaUpdates.en = { auto: true, reviewed: false }
        }
      }

      if (Object.keys(updates).length) {
        setForm(prev => ({
          ...prev,
          ...updates,
          nameMeta: {
            ...prev.nameMeta,
            ...metaUpdates,
          },
        }))
      } else {
        setStatus('Les traduccions ja estan informades.')
      }
    } catch (err) {
      console.error(err)
      setStatus('Error en la traduccio automatica.')
    } finally {
      setTranslating(false)
    }
  }

  const seedDefaultAllergens = async () => {
    setLoading(true)
    setStatus('')
    try {
      await Promise.all(
        DEFAULT_ALLERGENS.map(allergen =>
          setDoc(
            doc(db, 'allergens', allergen.key),
            { label: allergen.label, updatedAt: serverTimestamp(), source: 'default' },
            { merge: true }
          )
        )
      )
      setAllergensCatalog([...DEFAULT_ALLERGENS])
      setAllergensSource('db')
      setStatus('Allergens base guardats.')
    } catch (err) {
      console.error(err)
      setStatus('Error guardant els allergens base.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddAllergen = async () => {
    const label = newAllergen.trim()
    if (!label) {
      setStatus("Cal indicar el nom de l'allergen.")
      return
    }

    const key = toAllergenKey(label)
    if (!key) {
      setStatus("No s'ha pogut generar la clau de l'allergen.")
      return
    }

    if (allergensCatalog.some(item => item.key === key)) {
      setStatus('Aquest allergen ja existeix.')
      return
    }

    setLoading(true)
    setStatus('')

    try {
      if (allergensSource === 'default') {
        await seedDefaultAllergens()
      }

      await setDoc(
        doc(db, 'allergens', key),
        { label, updatedAt: serverTimestamp(), source: 'manual' },
        { merge: true }
      )

      setAllergensCatalog(prev => [...prev, { key, label }])
      setExtraAllergens(prev => prev.filter(item => item.key !== key))
      setForm(prev => ({
        ...prev,
        allergens: {
          ...prev.allergens,
          [key]: '',
        },
      }))
      setNewAllergen('')
      setAllergensSource('db')
      setStatus('Allergen afegit.')
    } catch (err) {
      console.error(err)
      setStatus("Error afegint l'allergen.")
    } finally {
      setLoading(false)
    }
  }

  const removeAllergenFromPlats = async (key: string) => {
    const snap = await getDocs(collection(db, 'plats'))
    let batch = writeBatch(db)
    let batchCount = 0

    const commitBatch = async () => {
      if (batchCount === 0) return
      await batch.commit()
      batch = writeBatch(db)
      batchCount = 0
    }

    snap.forEach(docSnap => {
      const data = docSnap.data() as any
      if (!data?.allergens || !(key in data.allergens)) return
      batch.update(docSnap.ref, { [`allergens.${key}`]: deleteField() })
      batchCount++
      if (batchCount >= 450) {
        commitBatch().catch(err => console.error(err))
      }
    })

    await commitBatch()
  }

  const handleDeleteAllergen = async (item: AllergenItem) => {
    if (DEFAULT_ALLERGEN_KEYS.has(item.key)) {
      setStatus('Aquest allergen forma part dels 14 base.')
      return
    }

    const confirmed = window.confirm(
      `Eliminar l'allergen "${item.label}" del cataleg?`
    )
    if (!confirmed) return

    const alsoRemove = window.confirm(
      'Vols eliminar-lo tambe de tots els plats?'
    )

    setLoading(true)
    setStatus('')

    try {
      await deleteDoc(doc(db, 'allergens', item.key))

      setAllergensCatalog(prev => prev.filter(allergen => allergen.key !== item.key))
      setExtraAllergens(prev => prev.filter(allergen => allergen.key !== item.key))
      setForm(prev => {
        const nextAllergens = { ...prev.allergens }
        delete nextAllergens[item.key]
        return { ...prev, allergens: nextAllergens }
      })
      setOriginalAllergens(prev => {
        const next = { ...prev }
        delete next[item.key]
        return next
      })

      if (alsoRemove) {
        await removeAllergenFromPlats(item.key)
      }

      setStatus(
        alsoRemove
          ? 'Allergen eliminat del cataleg i dels plats.'
          : 'Allergen eliminat del cataleg.'
      )
    } catch (err) {
      console.error(err)
      setStatus("Error eliminant l'allergen.")
    } finally {
      setLoading(false)
    }
  }

  const toggleMenu = (menuId: string) => {
    setForm(prev => {
      const exists = prev.menus.includes(menuId)
      const nextMenus = exists
        ? prev.menus.filter(item => item !== menuId)
        : [...prev.menus, menuId]
      return {
        ...prev,
        menus: nextMenus,
      }
    })
  }

  const loadPlatByCode = async (codeToLoad: string) => {
    const code = codeToLoad.trim()
    if (!code) {
      setStatus('Cal indicar el codi per carregar.')
      return
    }

    setLoading(true)
    setStatus('')

    try {
      const snap = await getDoc(doc(db, 'plats', code))
      if (!snap.exists()) {
        setStatus("No s'ha trobat cap plat amb aquest codi.")
        return
      }

      const data = snap.data() as any
      const loadedMenus = Array.isArray(data.menus) && data.menus.length
        ? data.menus
        : parseMenus(data.onEstanRaw || '')

      const loadedAllergens = data.allergens || {}
      setOriginalAllergens(loadedAllergens)

      const known = new Set(allergensCatalog.map(item => item.key))
      const extra = Object.keys(loadedAllergens)
        .filter(key => !known.has(key))
        .map(key => ({ key, label: key }))
      setExtraAllergens(extra)

      const loadedCode = String(data.code || code)

      setForm({
        code: loadedCode,
        nameCa: data.name?.ca || '',
        nameEs: data.name?.es || '',
        nameEn: data.name?.en || '',
        nameMeta: data.nameMeta || {},
        categoryId: data.category || '',
        familyId: data.family || '',
        menus: loadedMenus,
        menusRaw: data.onEstanRaw || '',
        vegan: Boolean(data.consumption?.vegan),
        vegetarian: Boolean(data.consumption?.vegetarian),
        allergens: buildAllergensState(loadedAllergens, [
          ...allergensCatalog,
          ...extra,
        ]),
      })
      setSelectedLookupCode(loadedCode)
      const lookupName = String(data.name?.ca || data.name?.es || data.name?.en || '')
      setSelectedLookupName(lookupName)
      setSearchQuery('')
      setStatus('Plat carregat.')
    } catch (err) {
      console.error(err)
      setStatus('Error carregant el plat.')
    } finally {
      setLoading(false)
    }
  }

  const handleLoad = async () => {
    await loadPlatByCode(form.code)
  }

  const handleSearchSelect = async (item: PlatLookupItem) => {
    await loadPlatByCode(item.code)
  }

  const handleReset = () => {
    setForm(defaultFormState)
    setSearchQuery('')
    setActiveSearchField(null)
    setSelectedLookupCode('')
    setSelectedLookupName('')
    setNewCategory('')
    setNewFamily('')
    setNewMenu('')
    setNewAllergen('')
    setOriginalAllergens({})
    setStatus('')
  }

  const handleDelete = async () => {
    const code = form.code.trim()
    if (!code) {
      setStatus('Cal indicar el codi per eliminar.')
      return
    }

    const confirmed = window.confirm(
      `Segur que vols eliminar el plat ${code}? Aquesta accio no es pot desfer.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatus('')

    try {
      await deleteDoc(doc(db, 'plats', code))
      handleReset()
      setStatus('Plat eliminat.')
    } catch (err) {
      console.error(err)
      setStatus('Error eliminant el plat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!allergenItems.length) return
    setForm(prev => {
      const next = { ...prev.allergens }
      allergenItems.forEach(item => {
        if (!(item.key in next)) next[item.key] = ''
      })
      return {
        ...prev,
        allergens: next,
      }
    })
  }, [allergenItems])

  const handleSave = async () => {
    if (!form.code.trim() || !form.nameCa.trim()) {
      setStatus('El codi i el nom en catala son obligatoris.')
      return
    }

    setLoading(true)
    setStatus('')

    const categoryLabel = newCategory.trim() || categories.find(c => c.id === form.categoryId)?.label || ''
    const familyLabel = newFamily.trim() || families.find(f => f.id === form.familyId)?.label || ''
    const categoryId = categoryLabel ? slugify(categoryLabel) : ''
    const familyId = familyLabel ? slugify(familyLabel) : ''
    const menuIds = Array.from(new Set(form.menus))
    const newMenuId = newMenu.trim() ? normalizeMenuId(newMenu) : ''
    const newMenuLabel = newMenu.trim() ? formatMenuLabel(newMenu) : ''

    if (newMenuId) {
      if (!menuIds.includes(newMenuId)) menuIds.push(newMenuId)
    }

    const allergensPayload = { ...originalAllergens }
    allergenItems.forEach(({ key }) => {
      allergensPayload[key] = form.allergens[key] ? form.allergens[key] : null
    })

    const payload = {
      code: form.code.trim(),
      name: {
        ca: form.nameCa.trim(),
        es: form.nameEs.trim() || null,
        en: form.nameEn.trim() || null,
      },
      nameMeta: form.nameMeta,
      category: categoryId || null,
      categoryLabel: categoryLabel || null,
      family: familyId || null,
      familyLabel: familyLabel || null,
      menus: menuIds,
      onEstanRaw: menuIds.length ? menuIds.join(' ') : form.menusRaw.trim() || null,
      allergens: allergensPayload,
      consumption: {
        vegan: Boolean(form.vegan),
        vegetarian: form.vegan ? true : Boolean(form.vegetarian),
      },
      updatedAt: serverTimestamp(),
    }

    try {
      const docRef = doc(db, 'plats', payload.code)
      await setDoc(docRef, payload, { merge: true })

      if (categoryId) {
        await setDoc(
          doc(db, 'categories', categoryId),
          { label: categoryLabel, updatedAt: serverTimestamp(), source: 'manual' },
          { merge: true }
        )
      }

      if (familyId) {
        await setDoc(
          doc(db, 'family', familyId),
          { label: familyLabel, updatedAt: serverTimestamp(), source: 'manual' },
          { merge: true }
        )
      }

      if (newMenuId) {
        await setDoc(
          doc(db, 'menus', newMenuId),
          { label: newMenuLabel || newMenuId, updatedAt: serverTimestamp(), source: 'manual' },
          { merge: true }
        )
      }

      if (newCategory.trim() && categoryId) {
        setCategories(prev =>
          prev.some(item => item.id === categoryId)
            ? prev
            : [...prev, { id: categoryId, label: categoryLabel }]
        )
        setForm(prev => ({ ...prev, categoryId }))
        setNewCategory('')
      }

      if (newFamily.trim() && familyId) {
        setFamilies(prev =>
          prev.some(item => item.id === familyId)
            ? prev
            : [...prev, { id: familyId, label: familyLabel }]
        )
        setForm(prev => ({ ...prev, familyId }))
        setNewFamily('')
      }

      if (newMenuId) {
        setMenusCatalog(prev =>
          prev.some(item => item.id === newMenuId)
            ? prev
            : [...prev, { id: newMenuId, label: newMenuLabel || newMenuId }]
        )
        setForm(prev => ({ ...prev, menus: menuIds }))
        setNewMenu('')
      }

      const savedCode = payload.code
      const savedNameCa = payload.name.ca
      const savedNameEs = payload.name.es || ''
      const savedNameEn = payload.name.en || ''
      const savedNameMeta = payload.nameMeta || {}

      setPlatsIndex(prev => {
        const nextItem: PlatLookupItem = {
          id: savedCode,
          code: savedCode,
          nameCa: payload.name.ca || '',
          nameEs: payload.name.es || '',
          nameEn: payload.name.en || '',
        }
        const idx = prev.findIndex(item => item.id === savedCode || item.code === savedCode)
        if (idx === -1) return [...prev, nextItem]
        const clone = [...prev]
        clone[idx] = nextItem
        return clone
      })

      setOriginalAllergens(allergensPayload)
      handleReset()
      setStatus('Plat guardat correctament.')

      if (!savedNameEs || !savedNameEn) {
        void (async () => {
          try {
            const updates: Record<string, any> = {}
            const metaUpdates: NameMeta = { ...savedNameMeta }

            if (!savedNameEs) {
              const translated = await requestTranslation(savedNameCa, 'ES')
              if (translated) {
                updates['name.es'] = translated
                metaUpdates.es = { auto: true, reviewed: false }
              }
            }

            if (!savedNameEn) {
              const translated = await requestTranslation(savedNameCa, 'EN')
              if (translated) {
                updates['name.en'] = translated
                metaUpdates.en = { auto: true, reviewed: false }
              }
            }

            if (Object.keys(updates).length) {
              updates.nameMeta = metaUpdates
              updates.updatedAt = serverTimestamp()
              await updateDoc(doc(db, 'plats', savedCode), updates)
            }
          } catch (err) {
            console.error(err)
          }
        })()
      }
    } catch (err) {
      console.error(err)
      setStatus('Error guardant el plat.')
    } finally {
      setLoading(false)
    }
  }

  const loadAllPlatsForExport = async (): Promise<PlatExport[]> => {
    const snap = await getDocs(collection(db, 'plats'))
    return snap.docs.map(docSnap => {
      const data = docSnap.data() as Omit<PlatExport, 'id'>
      return {
        id: docSnap.id,
        ...data,
        code: data.code || docSnap.id,
      }
    })
  }

  const buildExportRows = (plats: PlatExport[]) =>
    plats
      .map(plat => {
        const row: Record<string, string> = {
          Codi: plat.code || plat.id,
          Nom_CAT: plat.name?.ca || '',
          Nom_ES: plat.name?.es || '',
          Nom_EN: plat.name?.en || '',
          Categoria: plat.categoryLabel || '',
          Familia: plat.familyLabel || '',
          Menus: (plat.menus || []).join(', '),
          Vega: plat.consumption?.vegan ? 'SI' : 'NO',
          Vegetaria: plat.consumption?.vegetarian ? 'SI' : 'NO',
        }

        allergenItems.forEach(allergen => {
          const value = plat.allergens?.[allergen.key]
          row[`ALL_${allergen.label}`] =
            value === 'SI' || value === 'NO' || value === 'T' ? value : ''
        })

        return row
      })
      .sort((a, b) => (a.Codi || '').localeCompare(b.Codi || ''))

  const handleExportXlsx = async () => {
    setLoading(true)
    setStatus('')
    try {
      const plats = await loadAllPlatsForExport()
      const rows = buildExportRows(plats)
      if (!rows.length) {
        setStatus('No hi ha plats per exportar.')
        return
      }

      const XLSX = await loadXlsx()
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, 'Allergens_BBDD')
      const stamp = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `allergens-bbdd-${stamp}.xlsx`)
      setStatus('Exportacio XLSX completada.')
    } catch (err) {
      console.error(err)
      setStatus('Error exportant XLSX.')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPdf = async () => {
    setLoading(true)
    setStatus('')
    try {
      const plats = await loadAllPlatsForExport()
      const rows = buildExportRows(plats)
      if (!rows.length) {
        setStatus('No hi ha plats per exportar.')
        return
      }

      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 36
      const lineHeight = 12
      let y = margin

      pdf.setFontSize(12)
      pdf.text('BBDD Allergens', margin, y)
      y += lineHeight + 6
      pdf.setFontSize(9)
      pdf.text(`Plats: ${rows.length}`, margin, y)
      y += lineHeight + 8

      for (const row of rows) {
        const positives = allergenItems
          .map(allergen => {
            const value = row[`ALL_${allergen.label}`]
            if (value !== 'SI' && value !== 'T') return null
            return value === 'T' ? `${allergen.label} (T)` : allergen.label
          })
          .filter(Boolean)
          .join(', ')

        const line = `${row.Codi} | ${row.Nom_CAT || '-'} | Menus: ${
          row.Menus || '-'
        } | Allergens: ${positives || 'cap'}`
        const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2)

        if (y + wrapped.length * lineHeight > pageHeight - margin) {
          pdf.addPage()
          y = margin
        }

        pdf.text(wrapped, margin, y)
        y += wrapped.length * lineHeight + 4
      }

      const stamp = new Date().toISOString().slice(0, 10)
      pdf.save(`allergens-bbdd-${stamp}.pdf`)
      setStatus('Exportacio PDF completada.')
    } catch (err) {
      console.error(err)
      setStatus('Error exportant PDF.')
    } finally {
      setLoading(false)
    }
  }

  if (!allowed) {
    return (
      <>
        <ModuleHeader />
        <div className="p-6 text-center text-sm text-gray-500">
          No tens permisos per editar plats.
        </div>
      </>
    )
  }

  return (
    <>
      <ModuleHeader subtitle="Alta i edicio de plats per allergens i menus." />

      <section className="w-full max-w-5xl mx-auto p-6 flex flex-col gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Dades basiques</h2>
            <div className="flex items-center gap-2">
              <ExportMenu
                ariaLabel="Exportar base d'allergens"
                items={[
                  {
                    label: 'Exportar PDF',
                    onClick: handleExportPdf,
                    disabled: loading,
                  },
                  {
                    label: 'Exportar XLSX',
                    onClick: handleExportXlsx,
                    disabled: loading,
                  },
                ]}
              />
              <Button
                variant="secondary"
                onClick={handleAutoTranslate}
                disabled={loading || translating || !form.nameCa.trim()}
              >
                Autotraduir
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Codi *</label>
              <Input
                className="mt-1"
                value={form.code}
                onFocus={() => setActiveSearchField('code')}
                onChange={e => {
                  const value = e.target.value
                  handleChange('code', value)
                  setSearchQuery(value)
                  setActiveSearchField('code')
                  setSelectedLookupCode('')
                  setSelectedLookupName('')
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (searchResults.length > 0) {
                    void handleSearchSelect(searchResults[0])
                    return
                  }
                  void handleLoad()
                }}
                placeholder="Ex: C0530100001"
              />

              {activeSearchField === 'code' &&
                searchQuery.trim().length >= 2 &&
                searchResults.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white max-h-52 overflow-y-auto">
                  {searchResults.map(item => {
                    const displayName = formatLookupName(item)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b last:border-b-0"
                        onClick={() => void handleSearchSelect(item)}
                      >
                        <span className="font-medium text-slate-800">{item.code}</span>
                        {displayName ? (
                          <span className="text-slate-600"> - {displayName}</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Nom (CAT) *</label>
              <Input
                className="mt-1"
                value={form.nameCa}
                onFocus={() => setActiveSearchField('nameCa')}
                onChange={e => {
                  const value = e.target.value
                  handleChange('nameCa', value)
                  setSearchQuery(value)
                  setActiveSearchField('nameCa')
                  setSelectedLookupCode('')
                  setSelectedLookupName('')
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (searchResults.length > 0) {
                    void handleSearchSelect(searchResults[0])
                  }
                }}
                placeholder="Nom del plat en catala"
              />

              {activeSearchField === 'nameCa' &&
                searchQuery.trim().length >= 2 &&
                searchResults.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white max-h-52 overflow-y-auto">
                  {searchResults.map(item => {
                    const displayName = formatLookupName(item)
                    return (
                      <button
                        key={`${item.id}-name`}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b last:border-b-0"
                        onClick={() => void handleSearchSelect(item)}
                      >
                        <span className="font-medium text-slate-800">{item.code}</span>
                        {displayName ? (
                          <span className="text-slate-600"> - {displayName}</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Nom (ESP)</label>
              <Input
                className="mt-1"
                value={form.nameEs}
                onChange={e => handleNameChange('nameEs', e.target.value)}
                placeholder="Nom del plat en castella"
              />
              {form.nameMeta.es?.reviewed && (
                <p className="text-xs text-emerald-600 mt-1">Revisat</p>
              )}
              {!form.nameMeta.es?.reviewed && form.nameMeta.es?.auto && (
                <p className="text-xs text-amber-600 mt-1">Autogenerat</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Nom (ENG)</label>
              <Input
                className="mt-1"
                value={form.nameEn}
                onChange={e => handleNameChange('nameEn', e.target.value)}
                placeholder="Nom del plat en angles"
              />
              {form.nameMeta.en?.reviewed && (
                <p className="text-xs text-emerald-600 mt-1">Revisat</p>
              )}
              {!form.nameMeta.en?.reviewed && form.nameMeta.en?.auto && (
                <p className="text-xs text-amber-600 mt-1">Autogenerat</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Classificacio</h2>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Categoria</label>
                <Select
                  value={form.categoryId || ''}
                  onValueChange={value =>
                    handleChange('categoryId', value === EMPTY_SELECT ? '' : value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecciona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT}>Sense categoria</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Familia</label>
                <Select
                  value={form.familyId || ''}
                  onValueChange={value =>
                    handleChange('familyId', value === EMPTY_SELECT ? '' : value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecciona familia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT}>Sense familia</SelectItem>
                    {families.map(fam => (
                      <SelectItem key={fam.id} value={fam.id}>
                        {fam.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Nova familia</label>
                <Input
                  className="mt-1"
                  value={newFamily}
                  onChange={e => setNewFamily(e.target.value)}
                  placeholder="Nova familia"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Nova categoria</label>
                <Input
                  className="mt-1"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Nova categoria"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Menus</label>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {menuItems.length > 0 ? (
                  menuItems.map(menu => (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => toggleMenu(menu.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        form.menus.includes(menu.id)
                          ? 'bg-amber-100 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {menu.label}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">Encara no hi ha menus registrats.</p>
                )}

                <Input
                  className="min-w-[240px] flex-1 max-w-md"
                  value={newMenu}
                  onChange={e => setNewMenu(e.target.value)}
                  placeholder="Nou menu (C1, CH2, CELIAC)"
                />
              </div>

              <p className="text-xs text-slate-500 mt-1">
                Selecciona els menus on apareix el plat.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Al.lergens</h2>

          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm font-medium text-slate-700">Model de consum</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.vegan}
                  onChange={e => handleVeganToggle(e.target.checked)}
                />
                Vega (activa vegetaria)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.vegetarian}
                  disabled={form.vegan}
                  onChange={e => handleChange('vegetarian', e.target.checked)}
                />
                Vegetaria
              </label>
            </div>
          </div>

          {allergensSource === 'default' && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Llista base carregada. Pots guardar-la a Firestore per poder editar-la.
              <button
                type="button"
                className="ml-2 underline"
                onClick={seedDefaultAllergens}
                disabled={loading}
              >
                Guardar allergens base
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            {allergenItems.map(allergen => (
              <div key={allergen.key}>
                <label className="text-sm font-medium text-slate-700">{allergen.label}</label>
                <Select
                  value={form.allergens[allergen.key] || EMPTY_SELECT}
                  onValueChange={value =>
                    handleAllergenChange(
                      allergen.key,
                      (value === EMPTY_SELECT ? '' : value) as AllergenValue
                    )
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLERGEN_OPTIONS.map(option => (
                    <SelectItem key={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              value={newAllergen}
              onChange={e => setNewAllergen(e.target.value)}
              placeholder="Nou allergen"
            />
            <Button variant="secondary" onClick={handleAddAllergen} disabled={loading}>
              Afegir allergen
            </Button>
          </div>

          {customAllergens.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Allergens personalitzats
              </p>
              <div className="flex flex-wrap gap-2">
                {customAllergens.map(item => (
                  <Button
                    key={item.key}
                    variant="destructive"
                    className="h-7 px-3 text-xs"
                    onClick={() => handleDeleteAllergen(item)}
                    disabled={loading}
                  >
                    Elimina {item.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Button
            variant="primary"
            className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-300"
            onClick={handleSave}
            disabled={loading}
          >
            Guardar plat
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading || !form.code.trim()}
          >
            Eliminar plat
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            Neteja formulari
          </Button>
          {status && <p className="text-sm text-slate-600">{status}</p>}
        </div>
      </section>
    </>
  )
}
