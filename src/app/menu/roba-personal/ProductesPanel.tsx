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

type TaxonomyTerm = {
  id: string
  kind: string
  label: string
  parentKey?: string
}

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ca', { sensitivity: 'base' })
  )
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
  const [supplierId, setSupplierId] = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    notes: '',
    active: true,
  })
  const [form, setForm] = useState({
    code: '',
    supplierSku: '',
    name: '',
    grup: 'Roba',
    familia: '',
    subfamilia: '',
    minStock: '',
    departments: [] as string[],
  })
  const [productActiveBusyId, setProductActiveBusyId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
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

  useEffect(() => {
    void loadProducts()
    void loadSuppliers()
    void loadTaxonomy()
  }, [loadProducts, loadSuppliers, loadTaxonomy])

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
        supplierDepartments: ['Recursos Humans'],
      }),
    })
    if (!res.id) throw new Error('Sense id de proveïdor')
    toast({ title: 'Proveïdor creat' })
    await loadSuppliers()
    return res.id
  }

  const crear = async () => {
    try {
      let sid = supplierId.trim()
      if (showNewSupplier) {
        const id = await crearProveidor()
        if (!id) return
        sid = id
        setShowNewSupplier(false)
        setNewSupplier({ name: '', email: '', phone: '', specialty: '', notes: '', active: true })
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

      await api('/api/roba-personal/products', {
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
        }),
      })
      toast({ title: 'Producte creat' })
      setForm({
        code: '',
        supplierSku: '',
        name: '',
        grup: 'Roba',
        familia: '',
        subfamilia: '',
        minStock: '',
        departments: [],
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
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editId) return
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
        }),
      })
      toast({ title: 'Producte actualitzat' })
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

  const buildProductExportRows = useCallback(
    () =>
      productesActius.map((r) => ({
        Codi: r.code,
        Nom: r.name,
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
    [productesActius]
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
        <h2 className="font-semibold text-base">Nou producte</h2>

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
                <Input
                  id="p-fam"
                  className="h-9 text-sm"
                  list="roba-fam-list"
                  value={form.familia}
                  onChange={(e) => setForm((f) => ({ ...f, familia: e.target.value }))}
                  placeholder="p. ex. Calçat, Pantalons…"
                />
                <datalist id="roba-fam-list">
                  {familiaOptions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
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
          </div>
        </div>

        <Button type="button" className="mt-1" onClick={() => void crear()}>
          Desar producte
        </Button>
      </div>

      <div className="space-y-2 w-full">
        <p className="text-xs text-muted-foreground">
          Feu clic a una fila per <strong className="font-medium text-foreground">editar</strong> l’article.
          L’interruptor <strong className="font-medium text-foreground">Actiu</strong> el mostra o amaga del catàleg
          (mateix patró que auditoria).
        </p>
        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(taulaThText, 'whitespace-nowrap')}>Codi</TableHead>
                <TableHead className={taulaThText}>Nom</TableHead>
                <TableHead className={taulaThText}>Grup</TableHead>
                <TableHead className={taulaThText}>Família</TableHead>
                <TableHead className={taulaThText}>Subfam.</TableHead>
                <TableHead className={cn(taulaThText, 'min-w-[140px]')}>Dept.</TableHead>
                <TableHead className={taulaThText}>Proveïdor</TableHead>
                <TableHead className={cn(taulaThText, 'whitespace-nowrap')}>Codi proveïdor</TableHead>
                <TableHead className={taulaThText}>Magatzem</TableHead>
                <TableHead className={cn(taulaThText, 'text-right')}>Estoc</TableHead>
                <TableHead className={cn(taulaThText, 'text-center w-[4.5rem]')}>Actiu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">
                    Carregant…
                  </TableCell>
                </TableRow>
              ) : productesTaula.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground text-center py-8 text-sm">
                    Encara no hi ha cap article. Creeu-ne un amb el formulari de dalt.
                  </TableCell>
                </TableRow>
              ) : (
                productesTaula.map((r) => {
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
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
                <Input
                  id="e-size"
                  className="h-9 text-sm"
                  value={editForm.size}
                  onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="Opcional"
                />
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
                <Input
                  id="e-fam"
                  className="h-9 text-sm"
                  list="roba-edit-fam-list"
                  value={editForm.familia}
                  onChange={(e) => setEditForm((f) => ({ ...f, familia: e.target.value }))}
                />
                <datalist id="roba-edit-fam-list">
                  {editFamiliaOptions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
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
