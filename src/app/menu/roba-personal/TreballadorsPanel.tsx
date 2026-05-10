'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronDown, Paperclip, Search } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ROBA_PRODUCT_DEPARTMENTS, type RobaProductDepartmentId } from '@/data/departments'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { buildWorkerCodeFromName } from '@/lib/roba-personal/workerCodeFormat'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { WorkerRow } from './robaPersonalTypes'
import { foldTreballadorCerca } from './robaWorkerSearch'

export function TreballadorsPanel() {
  const csvInputId = useId()
  const [csvInputKey, setCsvInputKey] = useState(0)
  const [rows, setRows] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ name: string; department: RobaProductDepartmentId }>({
    name: '',
    department: ROBA_PRODUCT_DEPARTMENTS[0],
  })
  const [csvBusy, setCsvBusy] = useState(false)
  const [workerListQuery, setWorkerListQuery] = useState('')
  const [newWorkerOpen, setNewWorkerOpen] = useState(true)
  const [activeWorkersOpen, setActiveWorkersOpen] = useState(true)

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
    const name = form.name.trim()
    if (!name) {
      toast({ title: 'Cal el nom del treballador', variant: 'destructive' })
      return
    }
    try {
      const created = await api<WorkerRow>('/api/roba-personal/workers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          department: form.department,
        }),
      })
      toast({
        title: 'Treballador creat',
        description: created.code ? `Codi assignat: ${created.code}` : undefined,
      })
      setForm({ name: '', department: ROBA_PRODUCT_DEPARTMENTS[0] })
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
      setCsvInputKey((k) => k + 1)
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

  const setWorkerAppUser = async (id: string, hasAppUser: boolean) => {
    try {
      await api(`/api/roba-personal/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ hasAppUser }),
      })
      toast({
        title: hasAppUser ? 'Usuari de l’app: actiu' : 'Usuari de l’app: inactiu',
      })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const treballadorsActius = useMemo(
    () => rows.filter((r) => r.isActive !== false),
    [rows]
  )

  const treballadorsFiltrats = useMemo(() => {
    const q = workerListQuery.trim()
    if (!q) return treballadorsActius
    const fq = foldTreballadorCerca(q)
    return treballadorsActius.filter(
      (r) =>
        foldTreballadorCerca(r.name).includes(fq) ||
        foldTreballadorCerca(r.department).includes(fq)
    )
  }, [treballadorsActius, workerListQuery])

  const buildTreballadorsExportRows = useCallback(
    () =>
      treballadorsFiltrats.map((r) => ({
        Nom: r.name,
        Codi: r.code,
        Departament: r.department,
        UsuariApp: r.hasAppUser !== false ? 'Sí' : 'No',
      })),
    [treballadorsFiltrats]
  )

  const handleTreballadorsExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-treballadors')
      await exportRowsToXlsx([{ name: 'Treballadors', rows: buildTreballadorsExportRows() }], base)
      toast({ title: 'Exportació XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildTreballadorsExportRows])

  const handleTreballadorsExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-treballadors')
      await exportRowsToPdf(
        buildTreballadorsExportRows(),
        'Roba personal · Treballadors (resultat filtrat)',
        base
      )
      toast({ title: 'Exportació PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildTreballadorsExportRows])

  const treballadorsExportMenuItems = useMemo(
    () => [
      { label: 'Exportar PDF', onClick: handleTreballadorsExportPdf },
      { label: 'Exportar XLSX', onClick: handleTreballadorsExportXlsx },
    ],
    [handleTreballadorsExportPdf, handleTreballadorsExportXlsx]
  )
  useRegisterModuleExportMenu(treballadorsExportMenuItems)

  const codiPrevisualitzacio = useMemo(() => {
    const n = form.name.trim()
    if (!n) return ''
    return buildWorkerCodeFromName(n)
  }, [form.name])

  return (
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setNewWorkerOpen((open) => !open)}
          aria-expanded={newWorkerOpen}
        >
          <h2 className="font-semibold text-base">Nou treballador</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              newWorkerOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {newWorkerOpen ? (
          <>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-12 lg:items-end lg:gap-4 min-w-0">
            <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0 lg:col-span-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(6rem,8.5rem)_minmax(0,1fr)] sm:gap-4 sm:items-end min-w-0">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="w-code-preview" className="text-xs text-muted-foreground">
                    Codi
                  </Label>
                  <Input
                    id="w-code-preview"
                    readOnly
                    tabIndex={-1}
                    className="h-9 text-sm w-full min-w-0 font-mono bg-background/80 dark:bg-background/40"
                    value={codiPrevisualitzacio}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="w-name" className="text-xs text-muted-foreground">
                    Nom
                  </Label>
                  <Input
                    id="w-name"
                    className="h-9 text-sm w-full min-w-0"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-muted/20 px-3 py-3 sm:px-4 min-w-0 lg:col-span-4">
              <div className="space-y-1">
                <Label htmlFor="w-dept" className="text-xs text-muted-foreground">
                  Departament
                </Label>
                <select
                  id="w-dept"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.department}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      department: e.target.value as RobaProductDepartmentId,
                    }))
                  }
                >
                  {ROBA_PRODUCT_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex min-w-0 flex-col justify-end gap-2 lg:col-span-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={csvInputId}
                  className={cn(
                    'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-background text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:hover:bg-indigo-950/40',
                    csvBusy && 'pointer-events-none opacity-50'
                  )}
                  title="Import CSV (capçalera: nom, codi, departament o name, code, department)"
                >
                  <Paperclip className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Adjuntar fitxer CSV</span>
                </label>
                <Input
                  key={csvInputKey}
                  id={csvInputId}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={csvBusy}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.target.value = ''
                    void importCsv(f)
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <Button type="button" onClick={() => void crear()}>
          Desar treballador
        </Button>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setActiveWorkersOpen((open) => !open)}
          aria-expanded={activeWorkersOpen}
        >
          <h2 className="font-semibold text-base">Treballadors actius</h2>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              activeWorkersOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
        {activeWorkersOpen ? (
          <>
        <div className="space-y-3">
          <div className="relative w-full max-w-2xl">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-11 pl-11 text-base shadow-sm border-border/80 focus-visible:ring-2 focus-visible:ring-indigo-500/30"
              value={workerListQuery}
              onChange={(e) => setWorkerListQuery(e.target.value)}
              aria-label="Cercar treballador"
            />
          </div>
        </div>

        <div className={taulaContentidorScroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={taulaThText}>Nom</TableHead>
                <TableHead className={cn(taulaThText, 'w-[40%]')}>Departament</TableHead>
                <TableHead className={cn(taulaThText, 'whitespace-nowrap text-center w-[1%]')}>
                  App
                </TableHead>
                <TableHead className={cn(taulaThText, 'w-[1%] whitespace-nowrap text-right')}>
                  Accions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-8 text-center text-sm">
                    Carregant…
                  </TableCell>
                </TableRow>
              ) : treballadorsFiltrats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {treballadorsActius.length === 0
                        ? 'Encara no hi ha cap treballador actiu. Ompliu el formulari de dalt o importeu un CSV.'
                        : 'Cap treballador coincideix amb la cerca. Reviseu el text o creeu un registre nou.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                treballadorsFiltrats.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground">
                        {r.department}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-2 justify-center">
                        <Switch
                          checked={r.hasAppUser !== false}
                          onCheckedChange={(v) => void setWorkerAppUser(r.id, v)}
                          aria-label={`Usuari app: ${r.name}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void baixa(r.id)}
                      >
                        Desactivar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
