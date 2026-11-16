'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ROBA_PRODUCT_DEPARTMENTS } from '@/data/departments'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { ChevronDown, Pencil, Search, Trash2, X } from 'lucide-react'
import {
  defaultRobaSizeOptions,
  robaSizesForFamily,
  type RobaSizeType,
} from '@/lib/roba-personal/sizeProfiles'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  return data as T
}

type SupplierOption = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  notes?: string
  active?: boolean
  supplierDepartments?: string[]
}

type SupplierForm = {
  name: string
  email: string
  phone: string
  specialty: string
  notes: string
  active: boolean
}

const emptySupplierForm = (): SupplierForm => ({
  name: '',
  email: '',
  phone: '',
  specialty: '',
  notes: '',
  active: true,
})

type TaxonomyTerm = {
  id: string
  kind: string
  label: string
  parentKey?: string
  sizeType?: RobaSizeType
  sizeOptions?: string[]
  sizeProfileId?: string | null
}

type SizeProfile = {
  id: string
  name: string
  sizeType: RobaSizeType
  sizeOptions: string[]
  isActive?: boolean
}

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ca', { sensitivity: 'base' })
  )
}

function foldProductSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ca')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function ProductesPanel() {
  const [rows, setRows] = useState<
    {
      id: string
      code: string
      supplier: string
      supplierId?: string | null
      supplierSku?: string | null
      name: string
      size?: string
      sizeProfileId?: string | null
      grup?: string | null
      familia?: string | null
      subfamilia?: string | null
      departments?: string[] | null
      magatzem?: string
      quantityOnHand?: number
      minStock?: number | null
      isActive?: boolean
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [terms, setTerms] = useState<TaxonomyTerm[]>([])
  const [sizeProfiles, setSizeProfiles] = useState<SizeProfile[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplier, setNewSupplier] = useState<SupplierForm>(emptySupplierForm)
  const [supplierEditOpen, setSupplierEditOpen] = useState(false)
  const [supplierEditId, setSupplierEditId] = useState('')
  const [supplierEditForm, setSupplierEditForm] = useState<SupplierForm>(emptySupplierForm)
  const [supplierBusy, setSupplierBusy] = useState(false)
  const [supplierDeleteBusyId, setSupplierDeleteBusyId] = useState<string | null>(null)
  const [form, setForm] = useState({
    code: '',
    supplierSku: '',
    name: '',
    grup: 'Roba',
    familia: '',
    subfamilia: '',
    minStock: '',
    departments: [] as string[],
    sizeProfileId: '',
  })
  const [productActiveBusyId, setProductActiveBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [newProductOpen, setNewProductOpen] = useState(true)
  const [activeProductsOpen, setActiveProductsOpen] = useState(true)
  const [productSearch, setProductSearch] = useState('')
  const [sizeSettingsOpen, setSizeSettingsOpen] = useState(true)
  const [sizeFamilyId, setSizeFamilyId] = useState('')
  const [familyDefaultProfileId, setFamilyDefaultProfileId] = useState('')
  const [newSizeFamilyGroup, setNewSizeFamilyGroup] = useState('Roba')
  const [newSizeFamilyName, setNewSizeFamilyName] = useState('')
  const [newSizeFamilyProfileId, setNewSizeFamilyProfileId] = useState('')
  const [editingSizeProfileId, setEditingSizeProfileId] = useState('')
  const [sizeProfileName, setSizeProfileName] = useState('')
  const [sizeType, setSizeType] = useState<RobaSizeType>('none')
  const [sizeOptionsText, setSizeOptionsText] = useState('')
  const [sizeSettingsBusy, setSizeSettingsBusy] = useState(false)
  const [editForm, setEditForm] = useState({
    code: '',
    name: '',
    size: '',
    supplierId: '',
    supplierSku: '',
    grup: 'Roba',
    familia: '',
    subfamilia: '',
    minStock: '',
    departments: [] as string[],
    magatzem: '',
    sizeProfileId: '',
  })

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<typeof rows>('/api/roba-personal/products')
      setRows(data)
    } catch (e: unknown) {
      toast({
        title: 'Error carregant productes',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api<{ suppliers: SupplierOption[] }>('/api/roba-personal/suppliers')
      setSuppliers(Array.isArray(data.suppliers) ? data.suppliers : [])
    } catch {
      setSuppliers([])
    }
  }, [])

  const loadTaxonomy = useCallback(async () => {
    try {
      const data = await api<{ terms: TaxonomyTerm[] }>('/api/roba-personal/taxonomy')
      setTerms(Array.isArray(data.terms) ? data.terms : [])
    } catch {
      setTerms([])
    }
  }, [])

  const loadSizeProfiles = useCallback(async () => {
    try {
      const data = await api<{ profiles: SizeProfile[] }>('/api/roba-personal/size-profiles')
      setSizeProfiles(Array.isArray(data.profiles) ? data.profiles : [])
    } catch {
      setSizeProfiles([])
    }
  }, [])

  useEffect(() => {
    void loadProducts()
    void loadSuppliers()
    void loadTaxonomy()
    void loadSizeProfiles()
  }, [loadProducts, loadSuppliers, loadTaxonomy, loadSizeProfiles])

  const grupOptions = useMemo(() => {
    const fromT = terms.filter((t) => t.kind === 'grup').map((t) => t.label)
    return uniqSorted([...fromT, 'Roba', form.grup])
  }, [terms, form.grup])

  const familiaOptions = useMemo(() => {
    const g = form.grup.trim() || 'Roba'
    return uniqSorted(
      terms
        .filter((t) => t.kind === 'familia' && (t.parentKey || '') === g)
        .map((t) => t.label)
        .concat(form.familia ? [form.familia] : [])
    )
  }, [terms, form.grup, form.familia])

  const subfamiliaOptions = useMemo(() => {
    const g = form.grup.trim() || 'Roba'
    const f = form.familia.trim()
    const pk = f ? `${g}|${f}` : ''
    return uniqSorted(
      terms
        .filter((t) => t.kind === 'subfamilia' && (t.parentKey || '') === pk)
        .map((t) => t.label)
        .concat(form.subfamilia ? [form.subfamilia] : [])
    )
  }, [terms, form.grup, form.familia, form.subfamilia])

  const editGrupOptions = useMemo(() => {
    const fromT = terms.filter((t) => t.kind === 'grup').map((t) => t.label)
    return uniqSorted([...fromT, 'Roba', editForm.grup])
  }, [terms, editForm.grup])

  const editFamiliaOptions = useMemo(() => {
    const g = editForm.grup.trim() || 'Roba'
    return uniqSorted(
      terms
        .filter((t) => t.kind === 'familia' && (t.parentKey || '') === g)
        .map((t) => t.label)
        .concat(editForm.familia ? [editForm.familia] : [])
    )
  }, [terms, editForm.grup, editForm.familia])

  const editSubfamiliaOptions = useMemo(() => {
    const g = editForm.grup.trim() || 'Roba'
    const f = editForm.familia.trim()
    const pk = f ? `${g}|${f}` : ''
    return uniqSorted(
      terms
        .filter((t) => t.kind === 'subfamilia' && (t.parentKey || '') === pk)
        .map((t) => t.label)
        .concat(editForm.subfamilia ? [editForm.subfamilia] : [])
    )
  }, [terms, editForm.grup, editForm.familia, editForm.subfamilia])

  const familyTerms = useMemo(
    () =>
      terms
        .filter((term) => term.kind === 'familia')
        .sort((a, b) =>
          `${a.parentKey || ''}|${a.label}`.localeCompare(
            `${b.parentKey || ''}|${b.label}`,
            'ca',
            { sensitivity: 'base' }
          )
        ),
    [terms]
  )

  const sizeProfileNameById = useMemo(
    () => new Map(sizeProfiles.map((profile) => [profile.id, profile.name])),
    [sizeProfiles]
  )

  const selectedNewProductFamily = useMemo(() => {
    const group = form.grup.trim() || 'Roba'
    const family = form.familia.trim()
    return terms.find(
      (term) =>
        term.kind === 'familia' &&
        (term.parentKey || '') === group &&
        term.label.trim().toLocaleLowerCase('ca') === family.toLocaleLowerCase('ca')
    )
  }, [terms, form.grup, form.familia])

  const selectedNewProductProfile = useMemo(() => {
    const profileId = form.sizeProfileId || selectedNewProductFamily?.sizeProfileId || ''
    return sizeProfiles.find((profile) => profile.id === profileId)
  }, [sizeProfiles, form.sizeProfileId, selectedNewProductFamily])

  const newProductSizes = useMemo(() => {
    if (selectedNewProductProfile) return selectedNewProductProfile.sizeOptions
    return selectedNewProductFamily
      ? robaSizesForFamily(
          selectedNewProductFamily.sizeType,
          selectedNewProductFamily.sizeOptions
        )
      : []
  }, [selectedNewProductFamily, selectedNewProductProfile])

  const selectedEditFamily = useMemo(() => {
    const group = editForm.grup.trim() || 'Roba'
    const family = editForm.familia.trim()
    return terms.find(
      (item) =>
        item.kind === 'familia' &&
        (item.parentKey || '') === group &&
        item.label.trim().toLocaleLowerCase('ca') === family.toLocaleLowerCase('ca')
    )
  }, [terms, editForm.grup, editForm.familia])

  const configuredEditFamilySizes = useMemo(() => {
    const profileId = editForm.sizeProfileId || selectedEditFamily?.sizeProfileId || ''
    const profile = sizeProfiles.find((item) => item.id === profileId)
    return profile
      ? profile.sizeOptions
      : selectedEditFamily
        ? robaSizesForFamily(selectedEditFamily.sizeType, selectedEditFamily.sizeOptions)
        : []
  }, [sizeProfiles, editForm.sizeProfileId, selectedEditFamily])

  const editFamilySizeOptions = useMemo(() => {
    const current = editForm.size.trim()
    return current && !configuredEditFamilySizes.includes(current)
      ? [...configuredEditFamilySizes, current]
      : configuredEditFamilySizes
  }, [configuredEditFamilySizes, editForm.size])

  const selectSizeFamily = (id: string) => {
    setSizeFamilyId(id)
    const family = familyTerms.find((term) => term.id === id)
    setFamilyDefaultProfileId(family?.sizeProfileId || '')
  }

  const selectSizeProfile = (id: string) => {
    setEditingSizeProfileId(id)
    const profile = sizeProfiles.find((item) => item.id === id)
    setSizeProfileName(profile?.name || '')
    const nextType = profile?.sizeType || 'none'
    setSizeType(nextType)
    setSizeOptionsText(profile?.sizeOptions?.join(', ') || '')
  }

  const changeSizeType = (nextType: RobaSizeType) => {
    setSizeType(nextType)
    if (nextType === 'none') setSizeOptionsText('')
    else if (nextType !== 'custom') setSizeOptionsText(defaultRobaSizeOptions(nextType).join(', '))
  }

  const saveSizeProfile = async () => {
    if (!sizeProfileName.trim()) {
      toast({ title: 'Indiqueu el nom del perfil', variant: 'destructive' })
      return
    }
    const sizeOptions = sizeOptionsText
      .split(/[,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (sizeType !== 'none' && sizeOptions.length === 0) {
      toast({ title: 'Afegiu almenys una talla', variant: 'destructive' })
      return
    }
    setSizeSettingsBusy(true)
    try {
      await api<SizeProfile>('/api/roba-personal/size-profiles', {
        method: 'POST',
        body: JSON.stringify({
          id: editingSizeProfileId || undefined,
          name: sizeProfileName.trim(),
          sizeType,
          sizeOptions,
        }),
      })
      await loadSizeProfiles()
      const wasEditing = Boolean(editingSizeProfileId)
      setEditingSizeProfileId('')
      setSizeProfileName('')
      setSizeType('none')
      setSizeOptionsText('')
      toast({ title: wasEditing ? 'Perfil de talles actualitzat' : 'Perfil de talles creat' })
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut desar el perfil',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setSizeSettingsBusy(false)
    }
  }

  const saveFamilyDefaultProfile = async () => {
    if (!sizeFamilyId) {
      toast({ title: 'Trieu una família', variant: 'destructive' })
      return
    }
    setSizeSettingsBusy(true)
    try {
      await api('/api/roba-personal/taxonomy', {
        method: 'PATCH',
        body: JSON.stringify({ id: sizeFamilyId, sizeProfileId: familyDefaultProfileId }),
      })
      await loadTaxonomy()
      toast({ title: 'Perfil predeterminat assignat' })
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut assignar el perfil',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setSizeSettingsBusy(false)
    }
  }

  const createSizeFamily = async () => {
    const group = newSizeFamilyGroup.trim() || 'Roba'
    const family = newSizeFamilyName.trim()
    if (!family) {
      toast({ title: 'Indiqueu el nom de la família', variant: 'destructive' })
      return
    }
    setSizeSettingsBusy(true)
    try {
      await api('/api/roba-personal/taxonomy', {
        method: 'POST',
        body: JSON.stringify({ kind: 'grup', label: group, parentKey: '' }),
      })
      const created = await api<TaxonomyTerm>('/api/roba-personal/taxonomy', {
        method: 'POST',
        body: JSON.stringify({ kind: 'familia', label: family, parentKey: group }),
      })
      if (newSizeFamilyProfileId) {
        await api('/api/roba-personal/taxonomy', {
          method: 'PATCH',
          body: JSON.stringify({ id: created.id, sizeProfileId: newSizeFamilyProfileId }),
        })
      }
      await loadTaxonomy()
      setSizeFamilyId(created.id)
      setFamilyDefaultProfileId(newSizeFamilyProfileId)
      setNewSizeFamilyName('')
      toast({
        title: newSizeFamilyProfileId
          ? 'Família creada i perfil assignat'
          : 'Família creada',
      })
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut crear la família',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setSizeSettingsBusy(false)
    }
  }

  const postTaxonomyIfNeeded = async (kind: 'grup' | 'familia' | 'subfamilia', label: string, parentKey: string) => {
    const v = label.trim()
    if (!v) return
    try {
      await api('/api/roba-personal/taxonomy', {
        method: 'POST',
        body: JSON.stringify({ kind, label: v, parentKey }),
      })
    } catch {
      /* duplicat o error no bloqueja el producte */
    }
    void loadTaxonomy()
  }

  const crearProveidor = async (): Promise<string | null> => {
    const name = newSupplier.name.trim()
    if (!name) {
      toast({ title: 'Cal el nom del proveïdor', variant: 'destructive' })
      return null
    }
    const res = await api<{ ok?: boolean; id?: string }>('/api/roba-personal/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email: newSupplier.email.trim(),
        phone: newSupplier.phone.trim(),
        specialty: newSupplier.specialty.trim(),
        notes: newSupplier.notes.trim(),
        active: newSupplier.active,
      }),
    })
    if (!res.id) throw new Error('Sense id de proveïdor')
    toast({ title: 'Proveïdor creat' })
    await loadSuppliers()
    return res.id
  }

  const openSupplierEdit = () => {
    const supplier = suppliers.find((item) => item.id === supplierId)
    if (!supplier) return
    setSupplierEditId(supplier.id)
    setSupplierEditForm({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      specialty: supplier.specialty || '',
      notes: supplier.notes || '',
      active: supplier.active !== false,
    })
    setSupplierEditOpen(true)
  }

  const saveSupplierEdit = async () => {
    if (!supplierEditId) return
    if (!supplierEditForm.name.trim()) {
      toast({ title: 'Cal el nom del proveïdor', variant: 'destructive' })
      return
    }
    setSupplierBusy(true)
    try {
      await api(`/api/roba-personal/suppliers/${encodeURIComponent(supplierEditId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...supplierEditForm,
          name: supplierEditForm.name.trim(),
          email: supplierEditForm.email.trim(),
          phone: supplierEditForm.phone.trim(),
          specialty: supplierEditForm.specialty.trim(),
          notes: supplierEditForm.notes.trim(),
        }),
      })
      await Promise.all([loadSuppliers(), loadProducts()])
      setSupplierEditOpen(false)
      toast({ title: 'Proveïdor actualitzat' })
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut actualitzar el proveïdor',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setSupplierBusy(false)
    }
  }

  const deleteSupplier = async () => {
    const supplier = suppliers.find((item) => item.id === supplierId)
    if (!supplier) return
    if (!window.confirm(`Voleu eliminar el proveïdor «${supplier.name}»?`)) return

    setSupplierDeleteBusyId(supplier.id)
    try {
      await api(`/api/roba-personal/suppliers/${encodeURIComponent(supplier.id)}`, {
        method: 'DELETE',
      })
      setSupplierId('')
      await loadSuppliers()
      toast({ title: 'Proveïdor eliminat de Roba personal' })
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut eliminar el proveïdor',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setSupplierDeleteBusyId(null)
    }
  }

  const crear = async () => {
    try {
      let sid = supplierId.trim()
      if (showNewSupplier) {
        const id = await crearProveidor()
        if (!id) return
        sid = id
        setShowNewSupplier(false)
        setNewSupplier(emptySupplierForm())
      }
      if (!sid) {
        toast({ title: 'Trieu o creeu un proveïdor', variant: 'destructive' })
        return
      }
      const g = form.grup.trim() || 'Roba'
      const f = form.familia.trim()
      const s = form.subfamilia.trim()
      await postTaxonomyIfNeeded('grup', g, '')
      if (f) await postTaxonomyIfNeeded('familia', f, g)
      if (s && f) await postTaxonomyIfNeeded('subfamilia', s, `${g}|${f}`)

      const created = await api<{ createdCount?: number }>('/api/roba-personal/products', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          supplierId: sid,
          supplierSku: form.supplierSku.trim() || undefined,
          name: form.name.trim(),
          grup: g,
          familia: f || undefined,
          subfamilia: s || undefined,
          departments: form.departments,
          minStock: form.minStock ? Number(form.minStock) : undefined,
          sizes: newProductSizes,
          sizeProfileId: form.sizeProfileId || null,
        }),
      })
      toast({
        title:
          (created.createdCount || 0) > 1
            ? `${created.createdCount} variants de talla creades`
            : 'Producte creat',
      })
      setForm({
        code: '',
        supplierSku: '',
        name: '',
        grup: 'Roba',
        familia: '',
        subfamilia: '',
        minStock: '',
        departments: [],
        sizeProfileId: '',
      })
      setSupplierId('')
      void loadProducts()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const setProducteActiu = async (id: string, actiu: boolean) => {
    setProductActiveBusyId(id)
    try {
      await api(`/api/roba-personal/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: actiu }),
      })
      toast({ title: actiu ? 'Article actiu' : 'Article desactivat' })
      void loadProducts()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setProductActiveBusyId(null)
    }
  }

  const openEdit = (r: (typeof rows)[number]) => {
    let sid = String(r.supplierId || '').trim()
    if (!sid && r.supplier) {
      const want = r.supplier.trim().toLowerCase()
      const hit = suppliers.find((s) => s.name.trim().toLowerCase() === want)
      if (hit) sid = hit.id
    }
    setEditId(r.id)
    setEditForm({
      code: r.code,
      name: r.name,
      size: (r.size ?? '').trim(),
      supplierId: sid,
      supplierSku: r.supplierSku ?? '',
      grup: (r.grup ?? 'Roba').trim() || 'Roba',
      familia: (r.familia ?? '').trim(),
      subfamilia: (r.subfamilia ?? '').trim(),
      minStock: r.minStock != null && !Number.isNaN(Number(r.minStock)) ? String(r.minStock) : '',
      departments: Array.isArray(r.departments) ? [...r.departments] : [],
      magatzem: r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM,
      sizeProfileId: r.sizeProfileId || '',
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editId) return
    if (configuredEditFamilySizes.length > 0 && !editForm.size.trim()) {
      toast({
        title: 'Trieu la talla de la variant actual',
        description: 'Les altres variants del perfil es crearan automàticament amb estoc zero.',
        variant: 'destructive',
      })
      return
    }
    const sid = editForm.supplierId.trim()
    if (!sid) {
      toast({
        title: 'Trieu un proveïdor',
        description: 'Seleccioneu el proveïdor del catàleg per desar els canvis.',
        variant: 'destructive',
      })
      return
    }
    try {
      const g = editForm.grup.trim() || 'Roba'
      const f = editForm.familia.trim()
      const s = editForm.subfamilia.trim()
      await postTaxonomyIfNeeded('grup', g, '')
      if (f) await postTaxonomyIfNeeded('familia', f, g)
      if (s && f) await postTaxonomyIfNeeded('subfamilia', s, `${g}|${f}`)

      await api(`/api/roba-personal/products/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code: editForm.code.trim(),
          supplierId: sid,
          name: editForm.name.trim(),
          size: editForm.size.trim(),
          grup: g,
          familia: f || null,
          subfamilia: s || null,
          departments: editForm.departments,
          supplierSku: editForm.supplierSku.trim() || null,
          minStock: editForm.minStock.trim()
            ? Number(editForm.minStock)
            : null,
          magatzem: editForm.magatzem.trim() || DEFAULT_DOTACIO_MAGATZEM,
          sizeProfileId: editForm.sizeProfileId || null,
          applySizeProfileToVariants: true,
        }),
      })
      let createdVariants = 0
      if (configuredEditFamilySizes.length > 0) {
        const variantResult = await api<{ createdCount: number }>(
          `/api/roba-personal/products/${editId}`,
          {
            method: 'POST',
            body: JSON.stringify({
              sizes: configuredEditFamilySizes,
              sizeProfileId: editForm.sizeProfileId || null,
            }),
          }
        )
        createdVariants = variantResult.createdCount
      }
      toast({
        title:
          createdVariants > 0
            ? `Producte actualitzat · ${createdVariants} variants creades`
            : 'Producte actualitzat',
      })
      setEditOpen(false)
      setEditId('')
      void loadProducts()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const createMissingSizeVariants = async () => {
    if (!editId || configuredEditFamilySizes.length === 0) return
    try {
      const result = await api<{ createdCount: number }>(
        `/api/roba-personal/products/${editId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            sizes: configuredEditFamilySizes,
            sizeProfileId: editForm.sizeProfileId || null,
          }),
        }
      )
      await loadProducts()
      toast({
        title:
          result.createdCount > 0
            ? `${result.createdCount} variants creades`
            : 'Aquest article ja té totes les variants',
      })
    } catch (e: unknown) {
      toast({
        title: 'No s’han pogut crear les variants',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const deleteProducte = async (row: (typeof rows)[number]) => {
    const label = `${row.code} · ${row.name}`.trim()
    const confirmed = window.confirm(
      `Voleu eliminar definitivament aquest producte?\n\n${label}\n\nAquesta acció no es pot desfer.`
    )
    if (!confirmed) return

    setDeleteBusyId(row.id)
    try {
      await api(`/api/roba-personal/products/${row.id}`, {
        method: 'DELETE',
      })
      toast({ title: 'Producte eliminat' })
      if (editId === row.id) {
        setEditOpen(false)
        setEditId('')
      }
      void loadProducts()
    } catch (e: unknown) {
      toast({
        title: 'No s’ha pogut eliminar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setDeleteBusyId(null)
    }
  }

  const toggleDept = (dept: string) => {
    setForm((prev) => {
      const set = new Set(prev.departments)
      if (set.has(dept)) set.delete(dept)
      else set.add(dept)
      return { ...prev, departments: Array.from(set) }
    })
  }

  const toggleEditDept = (dept: string) => {
    setEditForm((prev) => {
      const set = new Set(prev.departments)
      if (set.has(dept)) set.delete(dept)
      else set.add(dept)
      return { ...prev, departments: Array.from(set) }
    })
  }

  const productesActius = useMemo(() => rows.filter((r) => r.isActive !== false), [rows])

  /** Tots els articles (actius primer), per la taula amb interruptor com a auditoria. */
  const productesTaula = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      const ai = a.isActive === false ? 1 : 0
      const bi = b.isActive === false ? 1 : 0
      if (ai !== bi) return ai - bi
      return String(a.code).localeCompare(String(b.code), 'ca', { sensitivity: 'base' })
    })
    return list
  }, [rows])

  const filteredProductesTaula = useMemo(() => {
    const tokens = foldProductSearch(productSearch).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return productesTaula

    return productesTaula.filter((product) => {
      const profile = sizeProfileNameById.get(product.sizeProfileId || '') || 'heretat'
      const activeLabel = product.isActive === false ? 'inactiu desactivat' : 'actiu'
      const searchable = foldProductSearch(
        [
          product.code,
          product.name,
          product.size,
          profile,
          product.grup,
          product.familia,
          product.subfamilia,
          ...(product.departments || []),
          product.supplier,
          product.supplierSku,
          product.magatzem,
          product.quantityOnHand,
          product.minStock,
          activeLabel,
        ].join(' ')
      )
      return tokens.every((token) => searchable.includes(token))
    })
  }, [productSearch, productesTaula, sizeProfileNameById])

  const buildProductExportRows = useCallback(
    () =>
      productesActius.map((r) => ({
        Codi: r.code,
        Nom: r.name,
        Talla: r.size ?? '',
        PerfilTalles: sizeProfileNameById.get(r.sizeProfileId || '') ?? '',
        Grup: r.grup ?? '',
        Familia: r.familia ?? '',
        Subfamilia: r.subfamilia ?? '',
        Departaments: (r.departments || []).join(', '),
        Proveidor: r.supplier,
        CodiProveidor: r.supplierSku ?? '',
        Magatzem: r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM,
        Estoc: r.quantityOnHand ?? 0,
        Minim: r.minStock ?? '',
      })),
    [productesActius, sizeProfileNameById]
  )

  const handleExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-productes')
      await exportRowsToXlsx([{ name: 'Productes', rows: buildProductExportRows() }], base)
      toast({ title: 'Exportació XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildProductExportRows])

  const handleExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-productes')
      await exportRowsToPdf(buildProductExportRows(), 'Roba personal · Productes', base)
      toast({ title: 'Exportació PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildProductExportRows])

  const exportMenuItems = useMemo(
    () => [
      { label: 'Exportar PDF', onClick: handleExportPdf },
      { label: 'Exportar XLSX', onClick: handleExportXlsx },
    ],
    [handleExportPdf, handleExportXlsx]
  )
  useRegisterModuleExportMenu(exportMenuItems)

  return (
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setSizeSettingsOpen((open) => !open)}
          aria-expanded={sizeSettingsOpen}
        >
          <div>
            <h2 className="font-semibold text-base">Perfils de talles</h2>
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              Crea tallatges reutilitzables i assigna&apos;ls per defecte a una família.
            </p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              sizeSettingsOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {sizeSettingsOpen ? (
          <div className="space-y-3">
          <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs leading-relaxed text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-100">
            <strong>Perfil</strong> és l’escala de talles (p. ex. «Lletres proveïdor A»).
            <strong className="ml-1">Família</strong> és el tipus de peça (p. ex. «Pantalons»).
            Primer crea el perfil i després crea o selecciona la família per assignar-l’hi.
          </div>
          <div className="grid gap-3 rounded-lg border border-indigo-200/60 bg-indigo-50/40 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 sm:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(9rem,12rem)_minmax(14rem,2fr)_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="size-profile" className="text-xs text-muted-foreground">
                Perfil
              </Label>
              <select
                id="size-profile"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={editingSizeProfileId}
                onChange={(event) => selectSizeProfile(event.target.value)}
              >
                <option value="">+ Nou perfil</option>
                {sizeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="size-profile-name" className="text-xs text-muted-foreground">
                Nom del perfil
              </Label>
              <Input
                id="size-profile-name"
                className="h-9 text-sm"
                value={sizeProfileName}
                onChange={(event) => setSizeProfileName(event.target.value)}
                placeholder="Pantalons · Proveïdor A"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="size-type" className="text-xs text-muted-foreground">
                Format
              </Label>
              <select
                id="size-type"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={sizeType}
                onChange={(event) => changeSizeType(event.target.value as RobaSizeType)}
              >
                <option value="none">Sense talla</option>
                <option value="letters">Lletres</option>
                <option value="numeric">Números</option>
                <option value="custom">Personalitzat</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="size-options" className="text-xs text-muted-foreground">
                Talles (separades per comes)
              </Label>
              <Input
                id="size-options"
                className="h-9 text-sm"
                value={sizeOptionsText}
                disabled={sizeType === 'none'}
                onChange={(event) => setSizeOptionsText(event.target.value)}
                placeholder="XS, S, M, L, XL"
              />
            </div>
            <Button
              type="button"
              className="h-9"
              disabled={!sizeProfileName.trim() || sizeSettingsBusy}
              onClick={() => void saveSizeProfile()}
            >
              {sizeSettingsBusy
                ? 'Desant…'
                : editingSizeProfileId
                  ? 'Actualitzar perfil'
                  : 'Crear perfil'}
            </Button>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs font-medium text-foreground">
              Perfils disponibles ({sizeProfiles.length})
            </p>
            {sizeProfiles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sizeProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted"
                    onClick={() => selectSizeProfile(profile.id)}
                    title={`Editar ${profile.name}`}
                  >
                    {profile.name} · {profile.sizeOptions.length > 0 ? profile.sizeOptions.join(', ') : 'sense talla'}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Encara no hi ha cap perfil desat.</p>
            )}
          </div>
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-muted/20 p-3 dark:border-slate-700 sm:grid-cols-[minmax(13rem,1fr)_minmax(13rem,1fr)_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="size-family" className="text-xs text-muted-foreground">
                Família
              </Label>
              <select
                id="size-family"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={sizeFamilyId}
                onChange={(event) => selectSizeFamily(event.target.value)}
              >
                <option value="">— Trieu —</option>
                {familyTerms.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.parentKey} · {family.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="family-size-profile" className="text-xs text-muted-foreground">
                Perfil predeterminat
              </Label>
              <select
                id="family-size-profile"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={familyDefaultProfileId}
                disabled={!sizeFamilyId}
                onChange={(event) => setFamilyDefaultProfileId(event.target.value)}
              >
                <option value="">Sense perfil</option>
                {sizeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              className="h-9"
              disabled={!sizeFamilyId || sizeSettingsBusy}
              onClick={() => void saveFamilyDefaultProfile()}
            >
              Assignar a la família
            </Button>
          </div>
          <div className="grid gap-3 rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20 sm:grid-cols-[minmax(9rem,12rem)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="new-size-family-group" className="text-xs text-muted-foreground">
                Grup de la nova família
              </Label>
              <Input
                id="new-size-family-group"
                className="h-9 text-sm"
                value={newSizeFamilyGroup}
                onChange={(event) => setNewSizeFamilyGroup(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-size-family-profile" className="text-xs text-muted-foreground">
                Perfil predeterminat
              </Label>
              <select
                id="new-size-family-profile"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={newSizeFamilyProfileId}
                onChange={(event) => setNewSizeFamilyProfileId(event.target.value)}
              >
                <option value="">Sense perfil</option>
                {sizeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-size-family-name" className="text-xs text-muted-foreground">
                Nova família
              </Label>
              <Input
                id="new-size-family-name"
                className="h-9 text-sm"
                value={newSizeFamilyName}
                onChange={(event) => setNewSizeFamilyName(event.target.value)}
                placeholder="Pantalons, Samarretes, Calçat…"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={!newSizeFamilyName.trim() || sizeSettingsBusy}
              onClick={() => void createSizeFamily()}
            >
              Crear família
              {newSizeFamilyProfileId ? ' i assignar perfil' : ''}
            </Button>
          </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setNewProductOpen((open) => !open)}
          aria-expanded={newProductOpen}
        >
          <h2 className="font-semibold text-base">Nou producte</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              newProductOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {newProductOpen ? (
          <>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6 min-w-0">
            <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/80 dark:text-indigo-200/90 mb-2">
              Article
            </p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(6rem,8.5rem)_minmax(0,1fr)] sm:gap-4 sm:items-end">
              <div className="space-y-1 w-full max-w-[8.5rem] sm:max-w-none">
                <Label htmlFor="p-code" className="text-xs text-muted-foreground">
                  Codi d’article
                </Label>
                <Input
                  id="p-code"
                  className="h-9 text-sm font-mono"
                  maxLength={12}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.slice(0, 12) }))
                  }
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-name" className="text-xs text-muted-foreground">
                  Nom / descripció de l’article
                </Label>
                <Input
                  id="p-name"
                  className="h-9 text-sm w-full min-w-0"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Inclou talla o variant aquí si cal"
                />
              </div>
            </div>
            </div>

            <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/45 bg-amber-50/35 dark:bg-amber-950/15 px-3 py-3 sm:px-4 min-w-0 flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-950/80 dark:text-amber-100/85 mb-2">
              Proveïdor
            </p>
            <label className="mb-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showNewSupplier}
                onChange={(e) => {
                  setShowNewSupplier(e.target.checked)
                  if (e.target.checked) setSupplierId('')
                }}
              />
              Alta nova de proveïdor
            </label>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(7.5rem,12rem)] gap-2 sm:gap-3 items-end">
              <div className="space-y-1 min-w-0">
                {!showNewSupplier ? (
                  <>
                    <Label htmlFor="p-supplier-id" className="text-xs text-muted-foreground">
                      Nom
                    </Label>
                    <select
                      id="p-supplier-id"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">— Trieu —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.active === false ? ' (inactiu)' : ''}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <Label htmlFor="p-new-supplier-name" className="text-xs text-muted-foreground">
                      Nom
                    </Label>
                    <Input
                      id="p-new-supplier-name"
                      className="h-9 text-sm"
                      value={newSupplier.name}
                      onChange={(e) => setNewSupplier((x) => ({ ...x, name: e.target.value }))}
                      placeholder="Raó social o nom"
                    />
                  </>
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-supplier-sku" className="text-xs text-muted-foreground">
                  Codi proveïdor
                </Label>
                <Input
                  id="p-supplier-sku"
                  className="h-9 text-sm font-mono"
                  value={form.supplierSku}
                  onChange={(e) => setForm((f) => ({ ...f, supplierSku: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
            {!showNewSupplier ? (
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!supplierId || supplierDeleteBusyId === supplierId}
                  onClick={openSupplierEdit}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar proveïdor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={!supplierId || supplierDeleteBusyId === supplierId}
                  onClick={() => void deleteSupplier()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {supplierDeleteBusyId === supplierId ? 'Eliminant…' : 'Eliminar proveïdor'}
                </Button>
              </div>
            ) : null}
            {showNewSupplier ? (
              <div className="mt-3 grid w-full gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    className="h-9 text-sm"
                    type="email"
                    value={newSupplier.email}
                    onChange={(e) => setNewSupplier((x) => ({ ...x, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Telèfon</Label>
                  <Input
                    className="h-9 text-sm"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Especialitat</Label>
                  <Input
                    className="h-9 text-sm"
                    value={newSupplier.specialty}
                    onChange={(e) => setNewSupplier((x) => ({ ...x, specialty: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Input
                    className="h-9 text-sm"
                    value={newSupplier.notes}
                    onChange={(e) => setNewSupplier((x) => ({ ...x, notes: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={newSupplier.active}
                    onChange={(e) => setNewSupplier((x) => ({ ...x, active: e.target.checked }))}
                  />
                  Actiu
                </label>
              </div>
            ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-muted/20 px-3 py-3 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Classificació
            </p>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:items-end lg:gap-4">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-grup" className="text-xs text-muted-foreground">
                  Grup
                </Label>
                <Input
                  id="p-grup"
                  className="h-9 text-sm"
                  list="roba-grup-list"
                  value={form.grup}
                  onChange={(e) => setForm((f) => ({ ...f, grup: e.target.value }))}
                />
                <datalist id="roba-grup-list">
                  {grupOptions.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-fam" className="text-xs text-muted-foreground">
                  Família
                </Label>
                <select
                  id="p-fam"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={form.familia}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      familia: e.target.value,
                      subfamilia: '',
                    }))
                  }
                >
                  <option value="">— Sense família —</option>
                  {familiaOptions.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-sub" className="text-xs text-muted-foreground">
                  Subfamília
                </Label>
                <Input
                  id="p-sub"
                  className="h-9 text-sm"
                  list="roba-sub-list"
                  value={form.subfamilia}
                  onChange={(e) => setForm((f) => ({ ...f, subfamilia: e.target.value }))}
                  placeholder="Opcional"
                />
                <datalist id="roba-sub-list">
                  {subfamiliaOptions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="p-min" className="text-xs text-muted-foreground">
                  Estoc mínim
                </Label>
                <Input
                  id="p-min"
                  type="number"
                  className="h-9 text-sm"
                  value={form.minStock}
                  onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                />
              </div>
              <div className="space-y-1 min-w-0 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="p-magatzem" className="text-xs text-muted-foreground">
                  Magatzem
                </Label>
                <Input
                  id="p-magatzem"
                  readOnly
                  disabled
                  className="h-9 text-sm bg-muted"
                  value={DEFAULT_DOTACIO_MAGATZEM}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-1 sm:max-w-md">
              <Label htmlFor="p-size-profile" className="text-xs text-muted-foreground">
                Perfil de talles
              </Label>
              <select
                id="p-size-profile"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.sizeProfileId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sizeProfileId: event.target.value }))
                }
              >
                <option value="">
                  Hereta de la família
                  {selectedNewProductProfile ? ` · ${selectedNewProductProfile.name}` : ''}
                </option>
                {sizeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Trieu un perfil específic quan el proveïdor utilitzi un tallatge diferent.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Departaments</Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background p-2">
                {ROBA_PRODUCT_DEPARTMENTS.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={form.departments.includes(d)}
                      onChange={() => toggleDept(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            {form.familia.trim() || form.sizeProfileId ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {newProductSizes.length > 0
                  ? `Perfil ${selectedNewProductProfile?.name || 'heretat'}: es crearan ${newProductSizes.length} variants (${newProductSizes.join(', ')}).`
                  : selectedNewProductFamily
                    ? 'Aquesta família està configurada sense talla.'
                    : 'La família encara no té un format de talles configurat.'}
              </p>
            ) : null}
          </div>
        </div>

        <Button type="button" className="mt-1" onClick={() => void crear()}>
          Desar producte
        </Button>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setActiveProductsOpen((open) => !open)}
          aria-expanded={activeProductsOpen}
        >
          <h2 className="font-semibold text-base">Productes actius</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              activeProductsOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {activeProductsOpen ? (
          <>
      <div className="space-y-2 w-full">
        <p className="text-xs text-muted-foreground">
          Feu clic a una fila per <strong className="font-medium text-foreground">editar</strong> l’article.
          L’interruptor <strong className="font-medium text-foreground">Actiu</strong> el mostra o amaga del catàleg
          (mateix patró que auditoria).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              className="h-10 pl-9 pr-10"
              placeholder="Cerca intel·ligent: nom, codi, talla, família, departament, proveïdor…"
              aria-label="Cercar productes actius"
              autoComplete="off"
            />
            {productSearch ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setProductSearch('')}
                aria-label="Netejar cerca de productes"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {filteredProductesTaula.length} de {productesTaula.length} productes
          </p>
        </div>
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(taulaThText, 'whitespace-nowrap')}>Codi</TableHead>
                <TableHead className={taulaThText}>Nom</TableHead>
                <TableHead className={taulaThText}>Talla</TableHead>
                <TableHead className={taulaThText}>Perfil talles</TableHead>
                <TableHead className={taulaThText}>Grup</TableHead>
                <TableHead className={taulaThText}>Família</TableHead>
                <TableHead className={taulaThText}>Subfam.</TableHead>
                <TableHead className={cn(taulaThText, 'min-w-[140px]')}>Dept.</TableHead>
                <TableHead className={taulaThText}>Proveïdor</TableHead>
                <TableHead className={cn(taulaThText, 'whitespace-nowrap')}>Codi proveïdor</TableHead>
                <TableHead className={taulaThText}>Magatzem</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Estoc</TableHead>
                <TableHead className={cn(taulaThText, 'text-center w-[4.5rem]')}>Actiu</TableHead>
                <TableHead className={cn(taulaThText, 'text-center w-[5rem]')}>Accions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground">
                    Carregant…
                  </TableCell>
                </TableRow>
              ) : productesTaula.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground text-center py-8 text-sm">
                    Encara no hi ha cap article. Creeu-ne un amb el formulari de dalt.
                  </TableCell>
                </TableRow>
              ) : filteredProductesTaula.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="py-10 text-center text-sm text-muted-foreground">
                    Cap producte coincideix amb «{productSearch.trim()}».
                  </TableCell>
                </TableRow>
              ) : (
                filteredProductesTaula.map((r) => {
                  const actiu = r.isActive !== false
                  return (
                    <TableRow
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-muted/60',
                        !actiu && 'opacity-55 bg-muted/20'
                      )}
                      onClick={() => openEdit(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEdit(r)
                        }
                      }}
                    >
                      <TableCell className="font-mono text-xs whitespace-nowrap">{r.code}</TableCell>
                      <TableCell className="text-sm max-w-[220px]">{r.name}</TableCell>
                      <TableCell className="text-sm font-medium">{r.size?.trim() || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sizeProfileNameById.get(r.sizeProfileId || '') || 'Heretat'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.grup || '—'}</TableCell>
                      <TableCell className="text-xs">{r.familia || '—'}</TableCell>
                      <TableCell className="text-xs">{r.subfamilia || '—'}</TableCell>
                      <TableCell className="text-[11px] leading-tight">
                        {(r.departments || []).length
                          ? (r.departments || []).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{r.supplier}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.supplierSku?.trim() ? r.supplierSku : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.magatzem?.trim() || DEFAULT_DOTACIO_MAGATZEM}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantityOnHand ?? 0}</TableCell>
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex justify-center">
                          <Switch
                            checked={actiu}
                            disabled={productActiveBusyId === r.id}
                            aria-label={actiu ? 'Desactivar article' : 'Activar article'}
                            onCheckedChange={(v) => void setProducteActiu(r.id, v)}
                          />
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteBusyId === r.id}
                          aria-label="Eliminar producte"
                          onClick={() => void deleteProducte(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
          </>
        ) : null}
      </div>

      <Dialog
        open={supplierEditOpen}
        onOpenChange={(open) => {
          if (supplierBusy) return
          setSupplierEditOpen(open)
          if (!open) setSupplierEditId('')
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar proveïdor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="supplier-edit-name">Nom</Label>
              <Input
                id="supplier-edit-name"
                value={supplierEditForm.name}
                onChange={(event) =>
                  setSupplierEditForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-edit-email">Email</Label>
              <Input
                id="supplier-edit-email"
                type="email"
                value={supplierEditForm.email}
                onChange={(event) =>
                  setSupplierEditForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-edit-phone">Telèfon</Label>
              <Input
                id="supplier-edit-phone"
                value={supplierEditForm.phone}
                onChange={(event) =>
                  setSupplierEditForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="supplier-edit-specialty">Especialitat</Label>
              <Input
                id="supplier-edit-specialty"
                value={supplierEditForm.specialty}
                onChange={(event) =>
                  setSupplierEditForm((current) => ({
                    ...current,
                    specialty: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="supplier-edit-notes">Notes</Label>
              <Input
                id="supplier-edit-notes"
                value={supplierEditForm.notes}
                onChange={(event) =>
                  setSupplierEditForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <Label htmlFor="supplier-edit-active">Proveïdor actiu</Label>
              <Switch
                id="supplier-edit-active"
                checked={supplierEditForm.active}
                onCheckedChange={(active) =>
                  setSupplierEditForm((current) => ({ ...current, active }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={supplierBusy}
              onClick={() => setSupplierEditOpen(false)}
            >
              Cancel·lar
            </Button>
            <Button type="button" disabled={supplierBusy} onClick={() => void saveSupplierEdit()}>
              {supplierBusy ? 'Desant…' : 'Desar canvis'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setEditId('')
        }}
      >
        <DialogContent className="max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar article</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label htmlFor="e-size-profile" className="text-xs text-muted-foreground">
                Perfil de talles
              </Label>
              <select
                id="e-size-profile"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={editForm.sizeProfileId}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    sizeProfileId: event.target.value,
                    size: '',
                  }))
                }
              >
                <option value="">Hereta de la família</option>
                {sizeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="e-code" className="text-xs text-muted-foreground">
                  Codi
                </Label>
                <Input
                  id="e-code"
                  className="h-9 font-mono text-sm"
                  maxLength={12}
                  value={editForm.code}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, code: e.target.value.slice(0, 12) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-size" className="text-xs text-muted-foreground">
                  Talla / variant
                </Label>
                {configuredEditFamilySizes.length > 0 ? (
                  <select
                    id="e-size"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={editForm.size}
                    onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                  >
                    <option value="">— Trieu —</option>
                    {editFamilySizeOptions.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="e-size"
                    className="h-9 text-sm"
                    value={editForm.size}
                    onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                    placeholder="Opcional"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-name" className="text-xs text-muted-foreground">
                Nom / descripció
              </Label>
              <Input
                id="e-name"
                className="h-9 text-sm"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="e-supplier" className="text-xs text-muted-foreground">
                  Proveïdor
                </Label>
                <select
                  id="e-supplier"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={editForm.supplierId}
                  onChange={(e) => setEditForm((f) => ({ ...f, supplierId: e.target.value }))}
                >
                  <option value="">— Trieu —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.active === false ? ' (inactiu)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-sku" className="text-xs text-muted-foreground">
                  Codi proveïdor
                </Label>
                <Input
                  id="e-sku"
                  className="h-9 font-mono text-sm"
                  value={editForm.supplierSku}
                  onChange={(e) => setEditForm((f) => ({ ...f, supplierSku: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="e-grup" className="text-xs text-muted-foreground">
                  Grup
                </Label>
                <Input
                  id="e-grup"
                  className="h-9 text-sm"
                  list="roba-edit-grup-list"
                  value={editForm.grup}
                  onChange={(e) => setEditForm((f) => ({ ...f, grup: e.target.value }))}
                />
                <datalist id="roba-edit-grup-list">
                  {editGrupOptions.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-fam" className="text-xs text-muted-foreground">
                  Família
                </Label>
                <select
                  id="e-fam"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={editForm.familia}
                  onChange={(e) =>
                    setEditForm((current) => ({
                      ...current,
                      familia: e.target.value,
                      subfamilia: '',
                    }))
                  }
                >
                  <option value="">— Sense família —</option>
                  {editFamiliaOptions.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-sub" className="text-xs text-muted-foreground">
                  Subfamília
                </Label>
                <Input
                  id="e-sub"
                  className="h-9 text-sm"
                  list="roba-edit-sub-list"
                  value={editForm.subfamilia}
                  onChange={(e) => setEditForm((f) => ({ ...f, subfamilia: e.target.value }))}
                />
                <datalist id="roba-edit-sub-list">
                  {editSubfamiliaOptions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-min" className="text-xs text-muted-foreground">
                  Estoc mín.
                </Label>
                <Input
                  id="e-min"
                  type="number"
                  className="h-9 text-sm"
                  value={editForm.minStock}
                  onChange={(e) => setEditForm((f) => ({ ...f, minStock: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-mag" className="text-xs text-muted-foreground">
                Magatzem
              </Label>
              <Input
                id="e-mag"
                className="h-9 text-sm"
                value={editForm.magatzem}
                onChange={(e) => setEditForm((f) => ({ ...f, magatzem: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Departaments</Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background p-2">
                {ROBA_PRODUCT_DEPARTMENTS.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={editForm.departments.includes(d)}
                      onChange={() => toggleEditDept(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            {configuredEditFamilySizes.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Variants de la família: {configuredEditFamilySizes.join(', ')}.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void createMissingSizeVariants()}
                >
                  Crear variants que falten
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              disabled={!editId || deleteBusyId === editId}
              onClick={() => {
                const row = rows.find((r) => r.id === editId)
                if (row) void deleteProducte(row)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteBusyId === editId ? 'Eliminant…' : 'Eliminar producte'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel·lar
            </Button>
            <Button type="button" onClick={() => void saveEdit()}>
              Desar canvis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
