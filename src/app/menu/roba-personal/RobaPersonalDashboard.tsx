'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Trash2 } from 'lucide-react'
import { DEPARTMENTS } from '@/data/departments'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { ClothingSizeField, ClothingSizeReadOnly } from './clothingSize'

type TabId = 'productes' | 'treballadors' | 'estoc' | 'sollicituds' | 'entregues' | 'compres'

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

export default function RobaPersonalDashboard() {
  const [tab, setTab] = useState<TabId>('productes')

  return (
    <div className="space-y-5 px-2 pb-8 sm:px-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {(
          [
            ['productes', 'Productes'],
            ['treballadors', 'Treballadors'],
            ['estoc', 'Estoc'],
            ['sollicituds', 'Sol·licituds'],
            ['entregues', 'Entregues'],
            ['compres', 'Compres'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === id
                ? 'bg-indigo-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'productes' && <ProductesPanel />}
      {tab === 'treballadors' && <TreballadorsPanel />}
      {tab === 'estoc' && <EstocPanel />}
      {tab === 'sollicituds' && <SollicitudsPanel />}
      {tab === 'entregues' && <EntreguesPanel />}
      {tab === 'compres' && <CompresPanel />}
    </div>
  )
}

type ProductRow = {
  id: string
  code: string
  supplier: string
  name: string
  size: string
  quantityOnHand?: number
  minStock?: number | null
  isActive?: boolean
}

function productById(products: ProductRow[], id: string): ProductRow | undefined {
  return products.find((x) => x.id === id)
}

function ProductesPanel() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    code: '',
    supplier: '',
    name: '',
    size: '',
    minStock: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<ProductRow[]>('/api/roba-personal/products')
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

  useEffect(() => {
    void load()
  }, [load])

  const crear = async () => {
    try {
      await api('/api/roba-personal/products', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          supplier: form.supplier.trim(),
          name: form.name.trim(),
          size: form.size.trim(),
          minStock: form.minStock ? Number(form.minStock) : undefined,
        }),
      })
      toast({ title: 'Producte creat' })
      setForm({ code: '', supplier: '', name: '', size: '', minStock: '' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const desactivar = async (id: string) => {
    try {
      await api(`/api/roba-personal/products/${id}`, { method: 'DELETE' })
      toast({ title: 'Producte desactivat' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-xl">
        <h2 className="font-semibold text-sm">Nou producte</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-code">Codi</Label>
            <Input
              id="p-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="p-supplier">Proveïdor</Label>
            <Input
              id="p-supplier"
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-name">Nom</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <ClothingSizeField
              id="p-size"
              value={form.size}
              onChange={(size) => setForm((f) => ({ ...f, size }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-min">Estoc mínim (opcional)</Label>
            <Input
              id="p-min"
              type="number"
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
            />
          </div>
        </div>
        <Button type="button" onClick={() => void crear()}>
          Desar producte
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codi</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead>Proveïdor</TableHead>
              <TableHead className="text-right">Estoc</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Carregant…
                </TableCell>
              </TableRow>
            ) : (
              rows
                .filter((r) => r.isActive !== false)
                .map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="text-sm">{r.supplier}</TableCell>
                    <TableCell className="text-right">{r.quantityOnHand ?? 0}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => void desactivar(r.id)}>
                        Desactivar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type WorkerRow = { id: string; name: string; code: string; department: string; isActive?: boolean }

function TreballadorsPanel() {
  const [rows, setRows] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', code: '', department: DEPARTMENTS[0] })
  const [csvBusy, setCsvBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<WorkerRow[]>('/api/roba-personal/workers')
      setRows(data)
    } catch (e: unknown) {
      toast({
        title: 'Error carregant treballadors',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const crear = async () => {
    try {
      await api('/api/roba-personal/workers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          department: form.department,
        }),
      })
      toast({ title: 'Treballador creat' })
      setForm({ name: '', code: '', department: DEPARTMENTS[0] })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const importCsv = async (file: File | null) => {
    if (!file) return
    setCsvBusy(true)
    try {
      const text = await file.text()
      const res = await fetch('/api/roba-personal/workers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: text,
      })
      const data = (await res.json()) as {
        ok?: boolean
        created?: number
        updated?: number
        skipped?: number
        errors?: string[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast({
        title: 'Import CSV',
        description: `Creats: ${data.created ?? 0}, actualitzats: ${data.updated ?? 0}, omesos: ${data.skipped ?? 0}`,
      })
      if (data.errors?.length) {
        toast({
          title: 'Algunes línies amb errors',
          description: data.errors.slice(0, 3).join(' · '),
          variant: 'destructive',
        })
      }
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error import',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setCsvBusy(false)
    }
  }

  const baixa = async (id: string) => {
    try {
      await api(`/api/roba-personal/workers/${id}`, { method: 'DELETE' })
      toast({ title: 'Treballador marcat com a inactiu' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-xl">
        <h2 className="font-semibold text-sm">Nou treballador</h2>
        <div className="grid gap-2">
          <div>
            <Label>Nom</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Codi</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div>
            <Label>Departament</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="button" onClick={() => void crear()}>
          Desar
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2 max-w-xl">
        <h2 className="font-semibold text-sm">Import CSV</h2>
        <p className="text-xs text-muted-foreground">
          Capçalera amb columnes: nom, codi, departament (o name, code, department).
        </p>
        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={csvBusy}
          onChange={(e) => void importCsv(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codi</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Departament</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4}>Carregant…</TableCell>
              </TableRow>
            ) : (
              rows
                .filter((r) => r.isActive !== false)
                .map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.department}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => void baixa(r.id)}>
                        Baixa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function EstocPanel() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productId, setProductId] = useState('')
  const [delta, setDelta] = useState('1')
  const [ref, setRef] = useState('')
  const [movements, setMovements] = useState<
    { id: string; productId: string; quantityDelta: number; createdAt?: string; reference?: string }[]
  >([])

  const loadProducts = useCallback(async () => {
    try {
      const data = await api<ProductRow[]>('/api/roba-personal/products')
      setProducts(data.filter((p) => p.isActive !== false))
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  const loadMov = useCallback(async () => {
    try {
      const data = await api<typeof movements>('/api/roba-personal/stock-movements')
      setMovements(data)
    } catch {
      setMovements([])
    }
  }, [])

  useEffect(() => {
    void loadProducts()
    void loadMov()
  }, [loadProducts, loadMov])

  const registrar = async () => {
    try {
      await api('/api/roba-personal/stock-movements', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          quantityDelta: Number(delta),
          reference: ref || undefined,
          reason: 'manual',
        }),
      })
      toast({ title: 'Moviment registrat' })
      setRef('')
      void loadProducts()
      void loadMov()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const prodLabel = (id: string) => {
    const p = products.find((x) => x.id === id)
    return p ? `${p.code} — ${p.name} (${p.size})` : id
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-xl">
        <h2 className="font-semibold text-sm">Entrada / ajust d’estoc</h2>
        <div>
          <Label>Producte</Label>
          <div className="mt-1">
            <ProductSearchCombobox
              products={products}
              value={productId}
              onChange={setProductId}
              placeholder="Cercar codi, nom, talla, proveïdor…"
              showStockHint
            />
          </div>
        </div>
        <div>
          <Label>Quantitat (+ entrada, − sortida manual)</Label>
          <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
        </div>
        <div>
          <Label>Referència (opcional)</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <Button type="button" disabled={!productId} onClick={() => void registrar()}>
          Registrar moviment
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Producte</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead>Ref.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {m.createdAt
                    ? new Date(m.createdAt).toLocaleString('ca-ES')
                    : '—'}
                </TableCell>
                <TableCell className="text-sm">{prodLabel(m.productId)}</TableCell>
                <TableCell className="text-right font-mono">{m.quantityDelta}</TableCell>
                <TableCell className="text-xs">{m.reference || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type RequestRow = {
  id: string
  requestingDepartment: string
  status: string
  lines: { productId: string; quantity: number }[]
  createdAt?: string
}

function SollicitudsPanel() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [dept, setDept] = useState(DEPARTMENTS[0])
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        api<RequestRow[]>('/api/roba-personal/requests'),
        api<ProductRow[]>('/api/roba-personal/products'),
      ])
      setRows(r)
      setProducts(p.filter((x) => x.isActive !== false))
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const crear = async () => {
    try {
      await api('/api/roba-personal/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestingDepartment: dept,
          lines: lines
            .filter((l) => l.productId)
            .map((l) => ({ productId: l.productId, quantity: Number(l.qty) })),
        }),
      })
      toast({ title: 'Sol·licitud creada' })
      setLines([{ productId: '', qty: '1' }])
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast({ title: 'Estat actualitzat' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const prodLabel = (id: string) => {
    const p = productById(products, id)
    return p ? `${p.code} ${p.name} · talla ${p.size}` : id
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-2xl">
        <h2 className="font-semibold text-sm">Nova sol·licitud</h2>
        <p className="text-xs text-muted-foreground">
          Al catàleg, cada <strong>talla</strong> és un producte diferent (mateix article, altre línia).
          En triar el producte, la talla queda definida; no cal un camp apart.
        </p>
        <div>
          <Label>Departament sol·licitant</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {lines.map((ln, i) => {
          const sel = ln.productId ? productById(products, ln.productId) : undefined
          return (
            <div
              key={i}
              className="grid gap-2 sm:grid-cols-[1fr_minmax(5rem,6rem)_minmax(4.5rem,5rem)_auto] sm:items-end"
            >
              <div>
                <Label>Producte</Label>
                <div className="mt-1">
                  <ProductSearchCombobox
                    products={products}
                    value={ln.productId}
                    onChange={(v) =>
                      setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                    }
                    placeholder="Cercar i triar…"
                  />
                </div>
              </div>
              <div>
                <Label>Talla</Label>
                <ClothingSizeReadOnly value={sel?.size ?? ''} />
              </div>
              <div>
                <Label>Qty</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={ln.qty}
                  onChange={(e) => {
                    const v = e.target.value
                    setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                  }}
                />
              </div>
              <div className="flex items-end justify-end sm:justify-start pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={lines.length <= 1}
                  title={lines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                  aria-label="Eliminar línia"
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Línia
          </Button>
          <Button type="button" onClick={() => void crear()}>
            Enviar sol·licitud
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Estat</TableHead>
              <TableHead>Línies</TableHead>
              <TableHead className="w-[220px]">Accions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.createdAt ? new Date(r.createdAt).toLocaleString('ca-ES') : '—'}
                </TableCell>
                <TableCell>{r.requestingDepartment}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell className="text-xs">
                  {(r.lines || []).map((l, idx) => (
                    <div key={`${l.productId}-${idx}`}>
                      {prodLabel(l.productId)} × {l.quantity}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {['approved', 'fulfilled', 'cancelled'].map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => void setStatus(r.id, s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type DeliveryRow = {
  id: string
  workerId: string
  lines: { productId: string; quantity: number }[]
  deliveredAt?: string
}

function EntreguesPanel() {
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [workerId, setWorkerId] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])

  const load = useCallback(async () => {
    try {
      const [d, w, p] = await Promise.all([
        api<DeliveryRow[]>('/api/roba-personal/deliveries'),
        api<WorkerRow[]>('/api/roba-personal/workers'),
        api<ProductRow[]>('/api/roba-personal/products'),
      ])
      setRows(d)
      setWorkers(w.filter((x) => x.isActive !== false))
      setProducts(p.filter((x) => x.isActive !== false))
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const registrar = async () => {
    try {
      await api('/api/roba-personal/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          workerId,
          lines: lines
            .filter((l) => l.productId)
            .map((l) => ({ productId: l.productId, quantity: Number(l.qty) })),
        }),
      })
      toast({ title: 'Entrega registrada' })
      setLines([{ productId: '', qty: '1' }])
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const prodLabel = (id: string) => {
    const p = productById(products, id)
    return p ? `${p.code} — ${p.name} · talla ${p.size}` : id
  }
  const workerLabel = (id: string) => {
    const w = workers.find((x) => x.id === id)
    return w ? `${w.name} (${w.code})` : id
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-2xl">
        <h2 className="font-semibold text-sm">Nova entrega</h2>
        <p className="text-xs text-muted-foreground">
          La talla ve determinada pel producte triat (cada talla és un registre al catàleg).
        </p>
        <div>
          <Label>Treballador</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
          >
            <option value="">— Trieu —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.code} ({w.department})
              </option>
            ))}
          </select>
        </div>
        {lines.map((ln, i) => {
          const sel = ln.productId ? productById(products, ln.productId) : undefined
          return (
            <div
              key={i}
              className="grid gap-2 sm:grid-cols-[1fr_minmax(5rem,6rem)_minmax(4.5rem,5rem)_auto] sm:items-end"
            >
              <div>
                <Label>Producte</Label>
                <div className="mt-1">
                  <ProductSearchCombobox
                    products={products}
                    value={ln.productId}
                    onChange={(v) =>
                      setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                    }
                    placeholder="Cercar i triar…"
                    showStockHint
                  />
                </div>
              </div>
              <div>
                <Label>Talla</Label>
                <ClothingSizeReadOnly value={sel?.size ?? ''} />
              </div>
              <div>
                <Label>Qty</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={ln.qty}
                  onChange={(e) => {
                    const v = e.target.value
                    setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                  }}
                />
              </div>
              <div className="flex items-end justify-end sm:justify-start pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={lines.length <= 1}
                  title={lines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                  aria-label="Eliminar línia"
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Línia
          </Button>
          <Button type="button" disabled={!workerId} onClick={() => void registrar()}>
            Registrar entrega
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Treballador</TableHead>
              <TableHead>Articles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {r.deliveredAt
                    ? new Date(r.deliveredAt).toLocaleString('ca-ES')
                    : '—'}
                </TableCell>
                <TableCell>{workerLabel(r.workerId)}</TableCell>
                <TableCell className="text-xs">
                  {(r.lines || []).map((l, idx) => (
                    <div key={`${l.productId}-${idx}`}>
                      {prodLabel(l.productId)} × {l.quantity}
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function CompresPanel() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])
  const [extraEmail, setExtraEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const loadProducts = useCallback(async () => {
    try {
      const data = await api<ProductRow[]>('/api/roba-personal/products')
      setProducts(data.filter((x) => x.isActive !== false))
    } catch {
      setProducts([])
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const enviar = async () => {
    const payloadLines = lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: Number(l.qty) }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)

    if (payloadLines.length === 0) {
      toast({
        title: 'Falten dades',
        description: 'Trieu almenys un producte i una quantitat.',
        variant: 'destructive',
      })
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/roba-personal/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: payloadLines,
          extraEmail: extraEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        emailSent?: boolean
        emailError?: string
      }
      if (!res.ok) {
        throw new Error(data.error || data.message || res.statusText)
      }
      toast({
        title: 'Correu enviat',
        description: data.message || 'S’ha enviat des del vostre Outlook (Microsoft 365).',
      })
      setLines([{ productId: '', qty: '1' }])
      setExtraEmail('')
      setNotes('')
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-6xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-sm">Sol·licitud a Compres</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Enviament per Outlook (com Projectes). A sota del llistat d’articles s’afegeix automàticament
            estoc mínim i sol·licituds obertes.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
          <div className="space-y-4 lg:col-span-7 min-w-0">
            {lines.map((ln, i) => {
              const sel = ln.productId ? productById(products, ln.productId) : undefined
              return (
                <div
                  key={i}
                  className="flex flex-col gap-2 xl:flex-row xl:items-end xl:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <Label className="text-xs">Producte · talla · proveïdor</Label>
                    <div className="mt-1">
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                        }
                        placeholder="Cercar i triar…"
                      />
                    </div>
                  </div>
                  <div className="flex w-full gap-2 xl:w-auto xl:shrink-0">
                    <div className="min-w-[7rem] w-28 shrink-0">
                      <Label className="text-xs">Talla</Label>
                      <ClothingSizeReadOnly
                        value={sel?.size ?? ''}
                        className="mt-1 px-2 text-xs"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Quantitat</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        value={ln.qty}
                        onChange={(e) => {
                          const v = e.target.value
                          setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-end justify-end xl:justify-start pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={lines.length <= 1}
                      title={lines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                      aria-label="Eliminar línia"
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}

            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addLine}>
              + Línia
            </Button>
          </div>

          <div className="space-y-3 lg:col-span-5 min-w-0">
            <div>
              <Label className="text-xs">Correu addicional (CC)</Label>
              <Input
                type="email"
                className="font-mono text-sm mt-1"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="Opcional"
                autoComplete="email"
              />
            </div>
            <div>
              <Label className="text-xs">Anotacions</Label>
              <Textarea
                className="min-h-[120px] text-sm resize-y mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            type="button"
            className="w-full h-12 text-base font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md disabled:opacity-60"
            disabled={busy}
            onClick={() => void enviar()}
          >
            Enviar a Compres (Outlook)
          </Button>
        </div>
      </div>
    </div>
  )
}
