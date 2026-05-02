'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { useSession } from 'next-auth/react'
import { DEPARTMENTS, type DepartmentId } from '@/data/departments'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { normalizeRole } from '@/lib/roles'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { formatDateOnly, formatDateTimeValue } from '@/lib/date-format'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { DeliveryRow, ProductRow, RequestRow, WorkerRow } from './robaPersonalTypes'
import { deliveredQtyByProductForRequestId, totalDeliveredUnitsForRequest } from './robaDeliveryHelpers'
import { ROBA_REQUEST_STATUS_LABEL, SOLIC_TABLE_COLS } from './robaPersonalConstants'
import {
  robaRequestCalendarDay,
  robaSollicitudsWeekRange,
  formatRobaDayGroupLabel,
} from './robaPersonalDates'
import { productById } from './robaProductHelpers'

export function SollicitudsPanel({ highlightRequestId = '' }: { highlightRequestId?: string }) {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [dept, setDept] = useState<DepartmentId>(DEPARTMENTS[0])
  const [workerId, setWorkerId] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])

  const { data: session } = useSession()
  const sessionUserId = String((session?.user as { id?: string })?.id || '').trim()
  const sessionRoleNorm = normalizeRole((session?.user as { role?: string })?.role)
  const sessionDeptNorm = String((session?.user as { department?: string })?.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const isRobaAdminOrRrhh =
    sessionRoleNorm === 'admin' || sessionDeptNorm === 'recursos humans'
  const isDeptLeadLimited =
    Boolean((session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead) &&
    !isRobaAdminOrRrhh
  const robaLinkedPersonnelId = String(
    (session?.user as { robaLinkedPersonnelId?: string | null })?.robaLinkedPersonnelId || ''
  ).trim()
  const robaWorkerDeptNorm = String(
    (session?.user as { robaWorkerDeptNorm?: string | null })?.robaWorkerDeptNorm || ''
  ).trim()
  const isRobaWorkerSelf = Boolean(robaLinkedPersonnelId) && !isRobaAdminOrRrhh && !isDeptLeadLimited
  const sessionDeptLabel = String(
    (session?.user as { department?: string })?.department || ''
  ).trim()
  const lockedDept = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, sessionDeptLabel)),
    [sessionDeptLabel]
  )
  const lockedDeptWorkerSelf = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, robaWorkerDeptNorm)),
    [robaWorkerDeptNorm]
  )

  const workersForDept = useMemo(() => {
    const active = workers.filter((w) => w.isActive !== false)
    if (isRobaWorkerSelf) {
      return active.filter((w) => w.id === robaLinkedPersonnelId)
    }
    if (isDeptLeadLimited) {
      return active
    }
    return active.filter((w) =>
      departmentsInSameRobaScope(String(w.department || ''), dept)
    )
  }, [workers, dept, isDeptLeadLimited, isRobaWorkerSelf, robaLinkedPersonnelId])

  useEffect(() => {
    setWorkerId((id) => {
      if (!id) return id
      return workersForDept.some((w) => w.id === id) ? id : ''
    })
  }, [dept, workersForDept])

  useEffect(() => {
    if (!isDeptLeadLimited) return
    if (lockedDept) {
      setDept(lockedDept)
    } else if (sessionDeptLabel) {
      setDept(sessionDeptLabel as DepartmentId)
    }
  }, [isDeptLeadLimited, lockedDept, sessionDeptLabel])

  useEffect(() => {
    if (!isRobaWorkerSelf) return
    if (lockedDeptWorkerSelf) {
      setDept(lockedDeptWorkerSelf)
    }
  }, [isRobaWorkerSelf, lockedDeptWorkerSelf])

  useEffect(() => {
    if (!isRobaWorkerSelf || !robaLinkedPersonnelId) return
    setWorkerId(robaLinkedPersonnelId)
  }, [isRobaWorkerSelf, robaLinkedPersonnelId])

  useEffect(() => {
    const id = highlightRequestId.trim()
    if (!id) return
    document.getElementById(`roba-req-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightRequestId, rows])

  const [prepareOpen, setPrepareOpen] = useState(false)
  const [prepareRequestId, setPrepareRequestId] = useState('')
  const [prepareSummary, setPrepareSummary] = useState<RequestRow | null>(null)
  const [prepareLines, setPrepareLines] = useState<{ productId: string; qty: string }[]>([])
  const [pickupDate, setPickupDate] = useState('')
  const [prepareMessage, setPrepareMessage] = useState('')
  const [prepareWithoutStock, setPrepareWithoutStock] = useState(false)

  const [listRangeStart, setListRangeStart] = useState(() => robaSollicitudsWeekRange().start)
  const [listRangeEnd, setListRangeEnd] = useState(() => robaSollicitudsWeekRange().end)
  const [listFilterDept, setListFilterDept] = useState('')
  const [listFilterStatus, setListFilterStatus] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [listFiltersResetSignal, setListFiltersResetSignal] = useState(0)

  const { setContent, open: filtersSlideOpen } = useFilters()

  const deptFilterOptions = useMemo(() => {
    if (isDeptLeadLimited) {
      const d = (lockedDept ?? sessionDeptLabel) as string | undefined
      return d ? [d] : [...DEPARTMENTS]
    }
    return [...DEPARTMENTS]
  }, [isDeptLeadLimited, lockedDept, sessionDeptLabel])

  const handleSmartDateChange = useCallback((f: SmartFiltersChange) => {
    if (f.start && f.end) {
      setListRangeStart(f.start)
      setListRangeEnd(f.end)
    }
  }, [])

  const robaFiltersSlidePanel = useMemo(
    () => (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Departament</label>
          <select
            className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            value={listFilterDept}
            onChange={(e) => setListFilterDept(e.target.value)}
          >
            <option value="">Tots</option>
            {deptFilterOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Estat</label>
          <select
            className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            value={listFilterStatus}
            onChange={(e) => setListFilterStatus(e.target.value)}
          >
            <option value="">Tots</option>
            {Object.entries(ROBA_REQUEST_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <ResetFilterButton
            onClick={() => {
              setListFilterDept('')
              setListFilterStatus('')
              setListFiltersResetSignal((n) => n + 1)
            }}
          />
          <span className="text-xs text-gray-500">Restableir filtres d&apos;aquest panell</span>
        </div>
      </div>
    ),
    [listFilterDept, listFilterStatus, deptFilterOptions]
  )

  useEffect(() => {
    if (!filtersSlideOpen) return
    setContent(robaFiltersSlidePanel)
  }, [filtersSlideOpen, robaFiltersSlidePanel, setContent])

  const openPrepare = (r: RequestRow) => {
    setPrepareRequestId(r.id)
    setPrepareSummary(r)
    setPrepareLines(
      (r.lines || []).map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
    )
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setPickupDate(tomorrow.toISOString().slice(0, 10))
    setPrepareMessage('')
    setPrepareWithoutStock(false)
    setPrepareOpen(true)
  }

  const prepareTotalUnits = useMemo(
    () =>
      prepareLines.reduce((acc, l) => {
        const q = Number(String(l.qty ?? '').replace(',', '.').trim())
        return acc + (Number.isFinite(q) && q > 0 ? q : 0)
      }, 0),
    [prepareLines]
  )

  const confirmPrepare = async () => {
    if (!pickupDate.trim() || !prepareRequestId) return
    const payloadLines = prepareLines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies',
        description: 'Cal almenys un producte amb quantitat vàlida.',
        variant: 'destructive',
      })
      return
    }
    try {
      await api(`/api/roba-personal/requests/${prepareRequestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'prepared',
          pickupDate: pickupDate.trim(),
          pickupAvailabilityMessage: prepareMessage.trim() || undefined,
          prepareWithoutStockReservation: prepareWithoutStock || undefined,
          lines: payloadLines,
        }),
      })
      toast({
        title: 'Estat: preparada',
        description:
          'Avisos enviats al sol·licitant i als responsables de roba del departament; calendari Outlook si hi ha correu.',
      })
      setPrepareOpen(false)
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const markPickedUp = async (id: string) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'picked_up' }),
      })
      toast({ title: 'Recollida registrada' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const cancelRequest = async (id: string) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      toast({ title: 'Sol·licitud cancel·lada' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const canMarkPickedUpClient = (r: RequestRow) => {
    if (r.status !== 'prepared') return false
    if (sessionRoleNorm === 'admin') return true
    if (sessionUserId && String(r.createdByUserId || '').trim() === sessionUserId) return true
    if (
      robaLinkedPersonnelId &&
      String(r.requestedByWorkerId || '').trim() === robaLinkedPersonnelId
    ) {
      return true
    }
    const sessionRobaLead = Boolean(
      (session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead
    )
    if (!sessionRobaLead) return false
    return departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
  }

  const canCancelRequestClient = (r: RequestRow) => {
    if (isRobaAdminOrRrhh) {
      return ['submitted', 'prepared', 'picked_up'].includes(r.status)
    }
    if (isDeptLeadLimited) {
      return (
        ['submitted', 'prepared', 'picked_up'].includes(r.status) &&
        departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
      )
    }
    if (isRobaWorkerSelf) {
      if (r.status !== 'submitted') return false
      return (
        (sessionUserId && String(r.createdByUserId || '').trim() === sessionUserId) ||
        (robaLinkedPersonnelId &&
          String(r.requestedByWorkerId || '').trim() === robaLinkedPersonnelId)
      )
    }
    return false
  }

  const load = useCallback(async () => {
    try {
      const [r, p, w, d] = await Promise.all([
        api<RequestRow[]>('/api/roba-personal/requests'),
        api<ProductRow[]>('/api/roba-personal/products'),
        api<WorkerRow[]>('/api/roba-personal/workers'),
        api<DeliveryRow[]>('/api/roba-personal/deliveries'),
      ])
      setRows(r)
      setDeliveries(d)
      setProducts(p.filter((x) => x.isActive !== false))
      setWorkers(w.filter((x) => x.isActive !== false))
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
    if (!workerId.trim()) {
      toast({
        title: 'Trieu el treballador',
        description: 'Cal indicar per a qui és la sol·licitud.',
        variant: 'destructive',
      })
      return
    }
    const payloadLines = lines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies vàlides',
        description:
          'Per cada línia cal triar un producte i una quantitat numèrica més gran que zero.',
        variant: 'destructive',
      })
      return
    }
    try {
      await api('/api/roba-personal/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestingDepartment: dept,
          requestedByWorkerId: workerId.trim(),
          lines: payloadLines,
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

  const prodLabel = useCallback((id: string) => {
    const p = productById(products, id)
    if (!p) return id
    const t = (p.size ?? '').trim()
    return t ? `${p.code} ${p.name} · talla ${t}` : `${p.code} ${p.name}`
  }, [products])

  const normalizeSolicFilter = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

  const filteredListRows = useMemo(() => {
    return rows.filter((r) => {
      const day = robaRequestCalendarDay(r.createdAt)
      if (day) {
        if (day < listRangeStart || day > listRangeEnd) return false
      }
      if (listFilterDept && r.requestingDepartment !== listFilterDept) return false
      if (listFilterStatus && r.status !== listFilterStatus) return false
      const q = normalizeSolicFilter(listSearch)
      if (q) {
        const wname =
          r.requestedByWorkerName?.trim() ||
          (r.requestedByWorkerId ? workers.find((w) => w.id === r.requestedByWorkerId)?.name : '') ||
          ''
        const hay = [
          r.reference,
          r.id,
          r.requestingDepartment,
          String(r.createdByUserName || ''),
          wname,
          ...(r.lines || []).map((l) => prodLabel(l.productId)),
        ]
          .filter(Boolean)
          .join(' ')
        if (!normalizeSolicFilter(hay).includes(q)) return false
      }
      return true
    })
  }, [
    rows,
    listRangeStart,
    listRangeEnd,
    listFilterDept,
    listFilterStatus,
    listSearch,
    workers,
    prodLabel,
  ])

  const groupedListRows = useMemo(() => {
    const map = new Map<string, RequestRow[]>()
    for (const r of filteredListRows) {
      const dk = robaRequestCalendarDay(r.createdAt) ?? 'sense-data'
      if (!map.has(dk)) map.set(dk, [])
      map.get(dk)!.push(r)
    }
    const entries = [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
    for (const [, list] of entries) {
      list.sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')))
    }
    return entries
  }, [filteredListRows])

  const buildSollicitudsExportRows = useCallback(
    () =>
      filteredListRows.map((r) => {
        const deliveredByProduct = deliveredQtyByProductForRequestId(deliveries, r.id)
        const deliveredTotal = totalDeliveredUnitsForRequest(deliveries, r.id)
        const hasDelivered = deliveredTotal > 0
        const Linies = (r.lines || [])
          .map((l) => {
            const reqQ = Number(l.quantity) || 0
            const delQ = deliveredByProduct.get(l.productId) ?? 0
            const q = hasDelivered ? delQ : reqQ
            const base = `${prodLabel(l.productId)} × ${q}`
            if (hasDelivered && delQ !== reqQ) return `${base} (sol. ${reqQ})`
            return base
          })
          .join('; ')
        return {
          Data: formatDateTimeValue(r.createdAt),
          Referencia: r.reference ?? `S-${r.id}`,
          Sol·licitant: String(r.createdByUserName || '').trim(),
          Departament: r.requestingDepartment,
          Treballador:
            r.requestedByWorkerName?.trim() ||
            (r.requestedByWorkerId
              ? workers.find((w) => w.id === r.requestedByWorkerId)?.name ?? ''
              : ''),
          Estat: ROBA_REQUEST_STATUS_LABEL[r.status] || r.status,
          Linies,
        }
      }),
    [filteredListRows, workers, prodLabel, deliveries]
  )

  const handleSollicitudsExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-sollicituds')
      await exportRowsToXlsx([{ name: 'Sollicituds', rows: buildSollicitudsExportRows() }], base)
      toast({ title: 'Exportació XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildSollicitudsExportRows])

  const handleSollicitudsExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-sollicituds')
      await exportRowsToPdf(buildSollicitudsExportRows(), 'Roba personal · Sol·licituds', base)
      toast({ title: 'Exportació PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildSollicitudsExportRows])

  const sollicitudsExportMenuItems = useMemo(
    () => [
      { label: 'Exportar PDF', onClick: handleSollicitudsExportPdf },
      { label: 'Exportar XLSX', onClick: handleSollicitudsExportXlsx },
    ],
    [handleSollicitudsExportPdf, handleSollicitudsExportXlsx]
  )
  useRegisterModuleExportMenu(sollicitudsExportMenuItems)

  return (
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Nova sol·licitud</h2>
        <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0">
          {lines.map((ln, i) => (
            <div
              key={i}
              className={cn(
                'grid gap-2 grid-cols-1 md:grid-cols-[minmax(6.5rem,9.5rem)_minmax(9rem,14rem)_minmax(0,1fr)_minmax(4.25rem,5.5rem)_auto] md:items-end md:gap-3',
                i > 0 && 'pt-3 mt-2 border-t border-indigo-200/40 dark:border-indigo-900/40'
              )}
            >
              {i === 0 ? (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sol-dept" className="text-xs text-muted-foreground">
                    Departament sol·licitant
                  </Label>
                  {isDeptLeadLimited || isRobaWorkerSelf ? (
                    <div
                      id="sol-dept"
                      className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground"
                    >
                      {(isRobaWorkerSelf
                        ? lockedDeptWorkerSelf ?? dept
                        : lockedDept ?? sessionDeptLabel) || dept}
                    </div>
                  ) : (
                    <select
                      id="sol-dept"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={dept}
                      onChange={(e) => setDept(e.target.value as DepartmentId)}
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="hidden md:block min-w-[1px]" aria-hidden />
              )}
              {i === 0 ? (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sol-worker" className="text-xs text-muted-foreground">
                    Treballador
                  </Label>
                  <select
                    id="sol-worker"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm min-w-0"
                    value={workerId}
                    onChange={(e) => setWorkerId(e.target.value)}
                    disabled={isRobaWorkerSelf}
                  >
                    <option value="">— Trieu —</option>
                    {workersForDept.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name.trim() || '—'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="hidden md:block min-w-[1px]" aria-hidden />
              )}
              <div className="space-y-1 min-w-0">
                <Label className="text-xs text-muted-foreground">Producte</Label>
                <div className="mt-0.5">
                  <ProductSearchCombobox
                    products={products}
                    value={ln.productId}
                    onChange={(v) =>
                      setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                    }
                    placeholder="Cercar i triar…"
                    showStockHint
                    variant="list"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={ln.qty}
                  onChange={(e) => {
                    const v = e.target.value
                    setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                  }}
                />
              </div>
              <div className="flex items-end justify-end md:justify-start pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={lines.length <= 1}
                  title={lines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                  aria-label="Eliminar línia"
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Línia
          </Button>
          <Button type="button" onClick={() => void crear()}>
            Enviar sol·licitud
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Sol·licituds</h2>
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <SmartFilters
            modeDefault="week"
            modeOptions={['week', 'day', 'range']}
            role="Treballador"
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showAdvanced={false}
            compact
            onChange={handleSmartDateChange}
            resetSignal={listFiltersResetSignal}
            initialStart={listRangeStart}
            initialEnd={listRangeEnd}
          />
          <div className="relative flex min-w-[12rem] flex-1 basis-[14rem] max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-10 rounded-xl border-gray-300 bg-white pl-9 dark:bg-background"
              placeholder="Cercar ref., nom, producte…"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              aria-label="Cercar sol·licituds"
            />
          </div>
          <FilterButton
            onClick={() => {
              setContent(robaFiltersSlidePanel)
            }}
          />
        </div>

        {filteredListRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-10 text-sm">
            Cap sol·licitud en aquest període o amb aquests filtres.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/30 text-emerald-900 dark:text-emerald-100 text-sm">
                  <TableHead
                    className={cn(
                      taulaThText,
                      'py-2 sticky left-0 z-30 bg-emerald-50 dark:bg-emerald-950/50 max-w-[9rem]'
                    )}
                  >
                    Sol·licitant
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2')}>Dept</TableHead>
                  <TableHead className={cn(taulaThText, 'py-2 min-w-[8rem]')}>Treballador</TableHead>
                  <TableHead className={cn(taulaThText, 'min-w-[10rem] py-2')}>Producte</TableHead>
                  <TableHead
                    className={cn(taulaThText, 'text-right whitespace-nowrap py-2')}
                    title="Si hi ha entrega vinculada: unitats lliurades; si no, total sol·licitat."
                  >
                    Total
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2')}>Estat</TableHead>
                  <TableHead className={cn(taulaThText, 'whitespace-nowrap w-[1%] py-2')}>Ref.</TableHead>
                  <TableHead className={cn(taulaThText, 'w-[200px] py-2')}>Accions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedListRows.map(([dayKey, dayRows]) => (
                  <Fragment key={dayKey}>
                    <TableRow className="bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold">
                      <TableCell colSpan={SOLIC_TABLE_COLS} className="py-2 text-sm">
                        {formatRobaDayGroupLabel(dayKey)}
                      </TableCell>
                    </TableRow>
                    {dayRows.map((r) => {
                      const deliveredByProduct = deliveredQtyByProductForRequestId(deliveries, r.id)
                      const deliveredTotal = totalDeliveredUnitsForRequest(deliveries, r.id)
                      const hasDelivered = deliveredTotal > 0
                      const requestedTotal = (r.lines || []).reduce(
                        (a, l) => a + (Number(l.quantity) || 0),
                        0
                      )
                      const totalUnits = hasDelivered ? deliveredTotal : requestedTotal
                      const requester = String(r.createdByUserName || '').trim() || '—'
                      const hid = highlightRequestId.trim() === r.id
                      return (
                        <TableRow
                          key={r.id}
                          id={`roba-req-${r.id}`}
                          className={cn(
                            'text-xs sm:text-sm hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25 transition-colors',
                            hid ? 'bg-indigo-500/10 ring-1 ring-indigo-400/40' : undefined
                          )}
                        >
                          <TableCell
                            className={cn(
                              'text-sm align-top max-w-[9rem] sticky left-0 z-20 bg-card',
                              hid ? 'bg-indigo-500/10' : 'bg-card'
                            )}
                          >
                            <span className="line-clamp-2" title={requester}>
                              {requester}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm align-top">{r.requestingDepartment}</TableCell>
                          <TableCell className="text-sm align-top max-w-[10rem]">
                            <span className="line-clamp-2">
                              {r.requestedByWorkerName?.trim() ||
                                (r.requestedByWorkerId
                                  ? workers.find((w) => w.id === r.requestedByWorkerId)?.name ?? '—'
                                  : '—')}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs align-top max-w-[16rem]">
                            <ul className="space-y-1 list-none pl-0 m-0">
                              {(r.lines || []).map((l, idx) => {
                                const reqQ = Number(l.quantity) || 0
                                const delQ = deliveredByProduct.get(l.productId) ?? 0
                                const showQ = hasDelivered ? delQ : reqQ
                                return (
                                  <li key={`${l.productId}-${idx}`} className="leading-snug">
                                    <span className="text-foreground">{prodLabel(l.productId)}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                      {' '}
                                      × {showQ}
                                      {hasDelivered && delQ !== reqQ ? (
                                        <span className="text-[10px] font-normal opacity-80">
                                          {' '}
                                          (sol. {reqQ})
                                        </span>
                                      ) : null}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </TableCell>
                          <TableCell className="text-sm align-top text-right font-medium tabular-nums whitespace-nowrap">
                            {totalUnits}
                            {hasDelivered && deliveredTotal !== requestedTotal ? (
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                sol. {requestedTotal}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm align-top min-w-[7rem]">
                            <span className="font-medium">
                              {ROBA_REQUEST_STATUS_LABEL[r.status] || r.status}
                            </span>
                            {r.pickupDate && r.status === 'prepared' ? (
                              <span className="block text-[10px] text-muted-foreground">
                                Recollida: {formatDateOnly(r.pickupDate)}
                                {r.preparedWithStockReservation === false ? (
                                  <span className="ml-1 rounded bg-amber-500/20 px-1 text-amber-950 dark:text-amber-100">
                                    sense reserva
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            {r.pickupAvailabilityMessage && r.status === 'prepared' ? (
                              <span className="block text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                {r.pickupAvailabilityMessage}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-[10px] text-muted-foreground font-mono whitespace-nowrap pt-2.5">
                            {r.reference ?? `S-${r.id}`}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1">
                              {r.status === 'submitted' && isRobaAdminOrRrhh ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => openPrepare(r)}
                                >
                                  Preparat (RRHH)
                                </Button>
                              ) : null}
                              {canMarkPickedUpClient(r) ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => void markPickedUp(r.id)}
                                >
                                  Recollit
                                </Button>
                              ) : null}
                              {canCancelRequestClient(r) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 text-destructive border-destructive/40"
                                  onClick={() => void cancelRequest(r.id)}
                                >
                                  Cancel·lar
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={prepareOpen} onOpenChange={setPrepareOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
            <DialogTitle>Marca com a preparat (RRHH)</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Ajusteu les quantitats si cal; es reservarà estoc segons el que confirmeu. Avisos i calendari segons la
              data i nota de sota.
            </p>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {prepareSummary ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-between items-baseline">
                  <span>
                    <span className="text-muted-foreground text-xs">Dept</span>{' '}
                    <span className="font-medium">{prepareSummary.requestingDepartment}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {prepareSummary.reference ?? prepareSummary.id}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground text-xs">Sol·licitant</span>{' '}
                  <span className="font-medium">
                    {String(prepareSummary.createdByUserName || '').trim() || '—'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground text-xs">Treballador</span>{' '}
                  <span className="font-medium">
                    {prepareSummary.requestedByWorkerName?.trim() ||
                      (prepareSummary.requestedByWorkerId
                        ? workers.find((w) => w.id === prepareSummary.requestedByWorkerId)?.name ?? '—'
                        : '—')}
                  </span>
                </p>
                <p className="text-sm pt-0.5 border-t border-border/60 mt-1">
                  <span className="text-muted-foreground text-xs">Total unitats a preparar</span>{' '}
                  <span className="font-semibold tabular-nums text-base">{prepareTotalUnits}</span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Línies</Label>
              <div className="space-y-2">
                {prepareLines.map((ln, i) => (
                  <div
                    key={`prep-${i}-${ln.productId}`}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-border/80 bg-background/50 p-2"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Producte</span>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                        }
                        placeholder="Cercar…"
                        showStockHint
                        variant="list"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 items-end shrink-0">
                      <div className="space-y-0.5 w-[4.5rem]">
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          className="h-9 tabular-nums"
                          type="number"
                          min={1}
                          value={ln.qty}
                          onChange={(e) => {
                            const v = e.target.value
                            setPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                        disabled={prepareLines.length <= 1}
                        title={prepareLines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                        aria-label="Eliminar línia"
                        onClick={() =>
                          setPrepareLines((L) =>
                            L.length <= 1 ? L : L.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setPrepareLines((L) => [...L, { productId: '', qty: '1' }])}
              >
                + Línia
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pickup-date">Dia de recollida</Label>
              <Input
                id="pickup-date"
                type="date"
                className="h-9"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pickup-msg" className="text-xs text-muted-foreground">
                Missatge (opcional)
              </Label>
              <Textarea
                id="pickup-msg"
                className="min-h-[64px] text-sm"
                placeholder="Ex.: material disponible a partir de…"
                value={prepareMessage}
                onChange={(e) => setPrepareMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Switch
                id="prep-no-stock"
                checked={prepareWithoutStock}
                onCheckedChange={(v) => setPrepareWithoutStock(Boolean(v))}
              />
              <Label htmlFor="prep-no-stock" className="text-sm font-normal cursor-pointer leading-snug">
                Sense reserva d’estoc (material pendent o sense estoc ara)
              </Label>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPrepareOpen(false)}>
              Tanca
            </Button>
            <Button type="button" onClick={() => void confirmPrepare()}>
              Confirmar preparació
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
