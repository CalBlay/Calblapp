'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { useFilters } from '@/context/FiltersContext'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { normalizeRole } from '@/lib/roles'
import { Switch } from '@/components/ui/switch'

type ExecutionRow = {
  id: string
  eventId: string
  eventSummary?: string
  department: string
  templateName: string
  status: string
  completedAt: number
  completedByName: string
}

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

type DepartmentBonusConfig = {
  minAuditoriesMes: number
  maxBonusMensualEur: number
  bonusMode: 'total_month' | 'per_event'
  enabled: boolean
}

type ValuationConfigResponse = {
  config: Record<Department, DepartmentBonusConfig>
  allowedDepartments: Department[]
}

type ValuationSummaryRow = {
  department: Department
  responsible: string
  fetes: number
  validades: number
}

type ValuationRow = {
  department: Department
  responsible: string
  fetes: number
  validades: number
  percentValidacio: number
  factorMinim: number
  maxBonusEur: number
  bonusEur: number
}

const DEPARTMENTS: Array<{ id: Department; label: string }> = [
  { id: 'comercial', label: 'Comercial' },
  { id: 'serveis', label: 'Serveis' },
  { id: 'cuina', label: 'Cuina' },
  { id: 'logistica', label: 'Logistica' },
  { id: 'deco', label: 'Deco' },
]

const DEFAULT_BONUS_CONFIG: DepartmentBonusConfig = {
  minAuditoriesMes: 6,
  maxBonusMensualEur: 200,
  bonusMode: 'total_month',
  enabled: true,
}

const toStartTs = (dateIso: string) => {
  const d = new Date(`${dateIso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const toEndTs = (dateIso: string) => {
  const d = new Date(`${dateIso}T23:59:59`)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const formatDate = (ts?: number) => {
  const d = new Date(Number(ts || 0))
  if (Number.isNaN(d.getTime()) || ts === 0) return '-'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

const formatPct = (value: number) => `${Math.round(value * 100)}%`
const formatEur = (value: number) =>
  new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0
  )

const statusLabel = (status?: string) => {
  const s = String(status || '').toLowerCase()
  if (s === 'validated') return 'validada'
  if (s === 'rejected') return 'no validada'
  return 'pendent'
}

const statusClass = (status?: string) => {
  const s = String(status || '').toLowerCase()
  if (s === 'validated') return 'bg-emerald-100 text-emerald-700'
  if (s === 'rejected') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}

const toIsoDay = (d: Date) => format(d, 'yyyy-MM-dd')
const monthLabel = (d: Date) =>
  d.toLocaleDateString('ca-ES', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase())

const VALUATION_NAV_STORAGE_KEY = 'auditoria-valoracio-nav-ids'
const VALIDATION_PAGE_SIZE = 100

export default function AuditoriaValoracioPage() {
  const { data: session } = useSession()
  const { setContent, setOpen } = useFilters()

  const [activeTab, setActiveTab] = useState<'validacio' | 'valoracio'>('validacio')

  const now = new Date()
  const [fromDate, setFromDate] = useState(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))

  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'validated' | 'rejected'>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [query, setQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ExecutionRow[]>([])
  const [hasMoreRows, setHasMoreRows] = useState(false)
  const [nextRowsCursorTs, setNextRowsCursorTs] = useState<number | null>(null)
  const [loadingMoreRows, setLoadingMoreRows] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const userDepartment = String((session?.user as any)?.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const isAdmin = userRole === 'admin'
  const isGlobalViewer = userRole === 'admin' || userRole === 'direccio'
  const canSeeValoracio = isGlobalViewer || userDepartment === 'cuina' || userDepartment === 'logistica'

  const [valuationMonthAnchor, setValuationMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [valuationDepartment, setValuationDepartment] = useState<Department | 'all'>('serveis')
  const [valuationResponsible, setValuationResponsible] = useState('all')
  const [valuationSummaryRows, setValuationSummaryRows] = useState<ValuationSummaryRow[]>([])
  const [valuationLoading, setValuationLoading] = useState(false)
  const [valuationError, setValuationError] = useState('')

  const [configMap, setConfigMap] = useState<Record<Department, DepartmentBonusConfig>>({
    comercial: DEFAULT_BONUS_CONFIG,
    serveis: DEFAULT_BONUS_CONFIG,
    cuina: DEFAULT_BONUS_CONFIG,
    logistica: DEFAULT_BONUS_CONFIG,
    deco: DEFAULT_BONUS_CONFIG,
  })
  const [allowedDepartments, setAllowedDepartments] = useState<Department[]>(['serveis'])
  const [savingConfig, setSavingConfig] = useState(false)
  const [configDirty, setConfigDirty] = useState(false)
  const valuationStartDate = useMemo(() => toIsoDay(startOfMonth(valuationMonthAnchor)), [valuationMonthAnchor])
  const valuationEndDate = useMemo(() => toIsoDay(endOfMonth(valuationMonthAnchor)), [valuationMonthAnchor])
  const valuationMonthTitle = useMemo(() => monthLabel(valuationMonthAnchor), [valuationMonthAnchor])
  const currentConfig: DepartmentBonusConfig =
    valuationDepartment === 'all'
      ? DEFAULT_BONUS_CONFIG
      : {
          ...(configMap[valuationDepartment] || DEFAULT_BONUS_CONFIG),
          enabled: true,
        }

  const parseStatus = (value: string): 'all' | 'completed' | 'validated' | 'rejected' => {
    if (value === 'completed' || value === 'validated' || value === 'rejected') return value
    return 'all'
  }

  const fromTs = useMemo(() => toStartTs(fromDate), [fromDate])
  const toTs = useMemo(() => toEndTs(toDate), [toDate])

  const load = async (opts?: { fromTs?: number; toTs?: number; append?: boolean; cursorTs?: number }) => {
    const append = Boolean(opts?.append)
    if (append) setLoadingMoreRows(true)
    else setLoading(true)
    setError('')
    try {
      let start = typeof opts?.fromTs === 'number' ? opts.fromTs : fromTs
      let end = typeof opts?.toTs === 'number' ? opts.toTs : toTs
      if (start > 0 && end > 0 && start > end) {
        const tmp = start
        start = end
        end = tmp
      }

      const qs = new URLSearchParams({ limit: String(VALIDATION_PAGE_SIZE) })
      if (statusFilter !== 'all') qs.set('status', statusFilter)
      if (departmentFilter !== 'all') qs.set('department', departmentFilter)
      if (query.trim()) qs.set('q', query.trim())
      if (start > 0) qs.set('fromTs', String(start))
      if (end > 0) qs.set('toTs', String(end))
      if (typeof opts?.cursorTs === 'number' && opts.cursorTs > 0) qs.set('cursorTs', String(opts.cursorTs))

      const res = await fetch(`/api/auditoria/executions/list?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar validacio'))
      const nextRows = Array.isArray(json?.executions) ? (json.executions as ExecutionRow[]) : []
      setRows((prev) => (append ? [...prev, ...nextRows] : nextRows))
      setHasMoreRows(Boolean(json?.hasMore))
      setNextRowsCursorTs(typeof json?.nextCursorTs === 'number' && json.nextCursorTs > 0 ? json.nextCursorTs : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant validacio')
      if (!append) setRows([])
      setHasMoreRows(false)
      setNextRowsCursorTs(null)
    } finally {
      if (append) setLoadingMoreRows(false)
      else setLoading(false)
    }
  }

  const loadValuationConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/auditoria/valuation-config', { cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as Partial<ValuationConfigResponse> & {
        error?: string
      }
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar configuracio'))

      if (json.config) {
        setConfigMap((prev) => ({ ...prev, ...(json.config as Record<Department, DepartmentBonusConfig>) }))
      }
      if (Array.isArray(json.allowedDepartments) && json.allowedDepartments.length > 0) {
        const allowed = json.allowedDepartments as Department[]
        setAllowedDepartments(allowed)
        if (valuationDepartment !== 'all' && !allowed.includes(valuationDepartment)) {
          setValuationDepartment(allowed[0])
        }
      }
    } catch {
      // silent fallback to defaults
      const dept = (userDepartment as Department) || 'serveis'
      const safeDept = DEPARTMENTS.some((d) => d.id === dept) ? dept : 'serveis'
      setAllowedDepartments([safeDept])
      setValuationDepartment(safeDept)
    }
  }, [userDepartment, valuationDepartment])

  const loadValuationSummary = useCallback(async () => {
    setValuationLoading(true)
    setValuationError('')
    try {
      const monthFrom = toStartTs(valuationStartDate)
      const monthTo = toEndTs(valuationEndDate)
      const qs = new URLSearchParams({
        limit: '3000',
        fromTs: String(monthFrom),
        toTs: String(monthTo),
      })
      if (valuationDepartment !== 'all') qs.set('department', valuationDepartment)
      const res = await fetch(`/api/auditoria/valuation-summary?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar auditories del mes'))
      setValuationSummaryRows(Array.isArray(json?.rows) ? (json.rows as ValuationSummaryRow[]) : [])
    } catch (err) {
      setValuationError(err instanceof Error ? err.message : 'Error carregant valoracio')
      setValuationSummaryRows([])
    } finally {
      setValuationLoading(false)
    }
  }, [valuationStartDate, valuationEndDate, valuationDepartment])

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    loadValuationConfig()
  }, [loadValuationConfig])

  useEffect(() => {
    if (activeTab !== 'valoracio') return
    loadValuationSummary()
  }, [activeTab, loadValuationSummary])

  useEffect(() => {
    if (!canSeeValoracio && activeTab === 'valoracio') {
      setActiveTab('validacio')
    }
  }, [canSeeValoracio, activeTab])

  const saveDepartmentConfig = useCallback(
    async (department: Department, cfg: DepartmentBonusConfig) => {
      setSavingConfig(true)
      try {
        const res = await fetch('/api/auditoria/valuation-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department,
            minAuditoriesMes: Number(cfg.minAuditoriesMes || 0),
            maxBonusMensualEur: Number(cfg.maxBonusMensualEur || 0),
            bonusMode: cfg.bonusMode === 'per_event' ? 'per_event' : 'total_month',
            enabled: true,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String((json as any)?.error || 'No s ha pogut desar configuracio'))
        return true
      } catch (err) {
        setValuationError(err instanceof Error ? err.message : 'Error desant configuracio')
        return false
      } finally {
        setSavingConfig(false)
      }
    },
    []
  )

  const openAdvancedFilters = useCallback(() => {
    setContent(
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Buscar</label>
          <input
            defaultValue={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 rounded-xl border bg-white px-3 text-sm"
            placeholder="Event, plantilla, responsable"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Estat</label>
          <select
            defaultValue={statusFilter}
            onChange={(e) => setStatusFilter(parseStatus(e.target.value))}
            className="h-10 rounded-xl border bg-white px-3 text-sm"
          >
            <option value="all">Tots</option>
            <option value="completed">Pendents</option>
            <option value="validated">Validades</option>
            <option value="rejected">No validades</option>
          </select>
        </div>

        {isGlobalViewer ? (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Departament</label>
            <select
              defaultValue={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-10 rounded-xl border bg-white px-3 text-sm"
            >
              <option value="all">Tots</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          <ResetFilterButton
            onClick={() => {
              setQuery('')
              setStatusFilter('all')
              setDepartmentFilter('all')
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              load()
              setOpen(false)
            }}
          >
            Aplicar
          </Button>
        </div>
      </div>
    )
  }, [query, statusFilter, departmentFilter, isGlobalViewer, setContent, setOpen])

  const onDatesChange = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    setFromDate(f.start)
    setToDate(f.end)
    load({ fromTs: toStartTs(f.start), toTs: toEndTs(f.end) })
  }

  useEffect(() => {
    setConfigDirty(false)
  }, [valuationDepartment, activeTab])

  const deleteExecution = async (id: string) => {
    if (!isAdmin || !id || deletingId) return
    const ok = window.confirm('Vols eliminar aquesta auditoria? Aquesta accio no es pot desfer.')
    if (!ok) return
    setDeletingId(id)
    setError('')
    try {
      const res = await fetch(`/api/auditoria/executions/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut eliminar auditoria'))
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminant auditoria')
    } finally {
      setDeletingId('')
    }
  }

  const valuationRows = useMemo<ValuationRow[]>(() => {
    const grouped = new Map<string, { department: Department; responsible: string; fetes: number; validades: number }>()
    valuationSummaryRows.forEach((row) => {
      const department = String(row.department || '').trim() as Department
      if (!DEPARTMENTS.some((d) => d.id === department)) return
      const responsible = String(row.responsible || '').trim() || 'Sense nom'
      const key = valuationDepartment === 'all' ? `${department}__${responsible}` : responsible
      const base = grouped.get(key) || { department, responsible, fetes: 0, validades: 0 }
      base.fetes += Number(row.fetes || 0)
      base.validades += Number(row.validades || 0)
      grouped.set(key, base)
    })

    const allRows = Array.from(grouped.values()).map((v) => {
      const cfg = {
        ...(configMap[v.department] || DEFAULT_BONUS_CONFIG),
        enabled: true,
      }
      const min = Math.max(0, Number(cfg.minAuditoriesMes || 0))
      const max = Math.max(0, Number(cfg.maxBonusMensualEur || 0))
      const percent = v.fetes > 0 ? v.validades / v.fetes : 0
      const factorMinim = min > 0 ? (v.fetes >= min ? 1 : 0) : 1
      const bonusBase = cfg.bonusMode === 'per_event' ? max * v.fetes : max
      const bonus = bonusBase * percent * factorMinim
      return {
        department: v.department,
        responsible: v.responsible,
        fetes: v.fetes,
        validades: v.validades,
        percentValidacio: percent,
        factorMinim,
        maxBonusEur: bonusBase,
        bonusEur: Math.round(bonus * 100) / 100,
      }
    })

    const filtered =
      valuationResponsible === 'all'
        ? allRows
        : allRows.filter((r) => r.responsible === valuationResponsible)

    return filtered.sort((a, b) => b.bonusEur - a.bonusEur)
  }, [valuationSummaryRows, configMap, valuationDepartment, valuationResponsible])

  const responsibleOptions = useMemo(
    () => Array.from(new Set(valuationSummaryRows.map((r) => String(r.responsible || '').trim()).filter(Boolean))).sort(),
    [valuationSummaryRows]
  )

  const valuationTotals = useMemo(() => {
    const base = valuationRows.reduce(
      (acc, row) => {
        acc.auditories += row.fetes
        acc.responsables += 1
        acc.bonus += row.bonusEur
        acc.maxBonus += row.maxBonusEur
        return acc
      },
      { auditories: 0, responsables: 0, bonus: 0, maxBonus: 0 }
    )
    const maxPossible = base.maxBonus
    const percentOfMax = maxPossible > 0 ? base.bonus / maxPossible : 0
    return { ...base, maxPossible, percentOfMax }
  }, [valuationRows])

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <div className="w-full bg-gradient-to-r from-cyan-100 to-teal-100 border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-800">
            <a href="/menu/auditoria" className="hover:underline">Auditoria</a>
            <span className="mx-1 text-gray-500">/</span>
            <a href="/menu/auditoria/valoracio" className="hover:underline">Valoracio</a>
          </div>
          <div className="text-xs italic text-gray-600">Valoracio mensual</div>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('validacio')}
              className={[
                'h-9 rounded-md px-3 text-sm border',
                activeTab === 'validacio'
                  ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                  : 'border-gray-300 bg-white text-gray-700',
              ].join(' ')}
            >
              Validacio
            </button>
            {canSeeValoracio ? (
              <button
                type="button"
                onClick={() => setActiveTab('valoracio')}
                className={[
                  'h-9 rounded-md px-3 text-sm border',
                  activeTab === 'valoracio'
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                    : 'border-gray-300 bg-white text-gray-700',
                ].join(' ')}
              >
                Valoracio
              </button>
            ) : null}
          </div>

          {activeTab === 'validacio' || !canSeeValoracio ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <div className="text-base font-semibold text-gray-900">Validacio d'auditories</div>
                  <div className="text-sm text-gray-700">
                    Mostrant: {rows.length}{hasMoreRows ? '+' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                  <SmartFilters
                    modeDefault="week"
                    role="Admin"
                    showDepartment={false}
                    showWorker={false}
                    showLocation={false}
                    showStatus={false}
                    showCommercial={false}
                    showImportance={false}
                    compact
                    showAdvanced={false}
                    initialStart={fromDate}
                    initialEnd={toDate}
                    onChange={onDatesChange}
                  />
                  <FilterButton onClick={openAdvancedFilters} />
                </div>
              </div>

              {loading ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">Carregant auditories...</div>
              ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
              ) : rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">No hi ha auditories amb aquests filtres.</div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-xl border bg-white p-3 flex items-center justify-between gap-3">
                      <Link
                        href={`/menu/auditoria/valoracio/${r.id}?${new URLSearchParams({
                          fromTs: String(fromTs),
                          toTs: String(toTs),
                          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
                          ...(departmentFilter !== 'all' ? { department: departmentFilter } : {}),
                          ...(query.trim() ? { q: query.trim() } : {}),
                        }).toString()}`}
                        className="min-w-0 flex-1"
                        onClick={() => {
                          if (typeof window === 'undefined') return
                          const orderedIds = rows.map((row) => row.id).filter(Boolean)
                          window.sessionStorage.setItem(VALUATION_NAV_STORAGE_KEY, JSON.stringify(orderedIds))
                        }}
                      >
                        <div className="text-sm font-semibold text-gray-900 truncate">{r.eventSummary || `Event ${r.eventId}`} - {r.department}</div>
                        <div className="text-xs text-gray-600 truncate">{r.templateName || 'Sense plantilla'} - {formatDate(r.completedAt)} - {r.completedByName}</div>
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className={['text-xs rounded-full px-2 py-1', statusClass(r.status)].join(' ')}>{statusLabel(r.status)}</span>
                        {isAdmin ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            aria-label="Eliminar auditoria"
                            title="Eliminar auditoria"
                            disabled={deletingId === r.id}
                            onClick={() => deleteExecution(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {hasMoreRows ? (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loadingMoreRows || !nextRowsCursorTs}
                        onClick={() => {
                          if (!nextRowsCursorTs) return
                          load({ append: true, cursorTs: nextRowsCursorTs })
                        }}
                      >
                        {loadingMoreRows ? 'Carregant...' : 'Carregar mes'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-slate-50/60 p-2">
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                  {isGlobalViewer ? (
                    <select
                      value={valuationDepartment}
                      onChange={(e) => setValuationDepartment(e.target.value as Department | 'all')}
                      className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                    >
                      <option value="all">Tots</option>
                      {DEPARTMENTS.filter((d) => allowedDepartments.includes(d.id)).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <div className="h-9 rounded-lg border border-gray-300 bg-white px-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setValuationMonthAnchor((prev) => startOfMonth(subMonths(prev, 1)))}
                      className="h-6 w-6 rounded text-gray-600 hover:bg-gray-100"
                      aria-label="Mes anterior"
                    >
                      &lt;
                    </button>
                    <span className="min-w-[130px] text-center text-sm font-medium text-gray-900">{valuationMonthTitle}</span>
                    <button
                      type="button"
                      onClick={() => setValuationMonthAnchor((prev) => startOfMonth(addMonths(prev, 1)))}
                      className="h-6 w-6 rounded text-gray-600 hover:bg-gray-100"
                      aria-label="Mes seguent"
                    >
                      &gt;
                    </button>
                  </div>

                  <select
                    value={valuationResponsible}
                    onChange={(e) => setValuationResponsible(e.target.value)}
                    className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                  >
                    <option value="all">Responsable: tots</option>
                    {responsibleOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <div className="ml-auto flex items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2 h-9">
                      <span className="text-[11px] text-gray-600">Min aud/mes</span>
                      <input
                        type="number"
                        min={0}
                        value={String(currentConfig.minAuditoriesMes)}
                        disabled={valuationDepartment === 'all'}
                        onChange={(e) => {
                          if (valuationDepartment === 'all') return
                          setConfigMap((prev) => ({
                            ...prev,
                            [valuationDepartment]: {
                              ...currentConfig,
                              minAuditoriesMes: Math.max(0, Number(e.target.value || 0)),
                            },
                          }))
                          setConfigDirty(true)
                        }}
                        className="h-7 w-[64px] rounded-md border border-gray-300 bg-white px-2 text-sm"
                      />
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2 h-9">
                      <span className="text-[11px] text-gray-600">
                        {currentConfig.bonusMode === 'per_event' ? 'Bonus/event €' : 'Max bonus €'}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={String(currentConfig.maxBonusMensualEur)}
                        disabled={valuationDepartment === 'all'}
                        onChange={(e) => {
                          if (valuationDepartment === 'all') return
                          setConfigMap((prev) => ({
                            ...prev,
                            [valuationDepartment]: {
                              ...currentConfig,
                              maxBonusMensualEur: Math.max(0, Number(e.target.value || 0)),
                            },
                          }))
                          setConfigDirty(true)
                        }}
                        className="h-7 w-[72px] rounded-md border border-gray-300 bg-white px-2 text-sm"
                      />
                    </label>

                    <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2 h-9">
                      <span className="text-[11px] font-semibold text-gray-800">
                        {currentConfig.bonusMode === 'per_event' ? 'Per event' : 'Mensual'}
                      </span>
                      <Switch
                        checked={currentConfig.bonusMode === 'per_event'}
                        disabled={valuationDepartment === 'all'}
                        onCheckedChange={(checked) => {
                          if (valuationDepartment === 'all') return
                          setConfigMap((prev) => ({
                            ...prev,
                            [valuationDepartment]: {
                              ...currentConfig,
                              bonusMode: checked ? 'per_event' : 'total_month',
                            },
                          }))
                          setConfigDirty(true)
                        }}
                      />
                    </div>

                    {valuationDepartment === 'all' ? (
                      <span className="text-[11px] text-gray-500">Selecciona departament per editar regles.</span>
                    ) : null}
                    {valuationDepartment !== 'all' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingConfig || !configDirty}
                        onClick={async () => {
                          const ok = await saveDepartmentConfig(valuationDepartment as Department, {
                            ...currentConfig,
                            enabled: true,
                          })
                          if (ok) setConfigDirty(false)
                        }}
                      >
                        {savingConfig ? 'Desant...' : 'Desar'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-gray-600">Total auditories</div>
                  <div className="text-lg font-semibold text-gray-900">{valuationTotals.auditories}</div>
                </div>
                <div>
                  <div className="text-gray-600">Total responsables</div>
                  <div className="text-lg font-semibold text-gray-900">{valuationTotals.responsables}</div>
                </div>
                <div>
                  <div className="text-gray-600">Total a abonar</div>
                  <div className="text-lg font-semibold text-gray-900">{formatEur(valuationTotals.bonus)}</div>
                </div>
                <div>
                  <div className="text-gray-600">% abonat / maxim</div>
                  <div className="text-lg font-semibold text-gray-900">{formatPct(valuationTotals.percentOfMax)}</div>
                </div>
              </div>

              {valuationLoading ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">Carregant valoracio mensual...</div>
              ) : valuationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{valuationError}</div>
              ) : valuationRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
                  {valuationDepartment === 'all'
                    ? 'No hi ha auditories del mes.'
                    : 'No hi ha auditories del mes per aquest departament.'}
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <div
                    className={[
                      'grid gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700',
                      valuationDepartment === 'all'
                        ? 'grid-cols-[110px_1.2fr_100px_100px_120px_120px_140px]'
                        : 'grid-cols-[1.2fr_100px_100px_120px_120px_140px]',
                    ].join(' ')}
                  >
                    {valuationDepartment === 'all' ? <div>Dept</div> : null}
                    <div>Responsable</div>
                    <div className="text-right">Auditories</div>
                    <div className="text-right">Validades</div>
                    <div className="text-right">% validacio</div>
                    <div className="text-right">Factor minim</div>
                    <div className="text-right">Bonus EUR</div>
                  </div>
                  <div className="divide-y">
                    {valuationRows.map((row) => (
                      <div
                        key={`${row.department}-${row.responsible}`}
                        className={[
                          'grid gap-2 px-3 py-2 text-sm',
                          valuationDepartment === 'all'
                            ? 'grid-cols-[110px_1.2fr_100px_100px_120px_120px_140px]'
                            : 'grid-cols-[1.2fr_100px_100px_120px_120px_140px]',
                        ].join(' ')}
                      >
                        {valuationDepartment === 'all' ? (
                          <div className="truncate text-gray-700">
                            {DEPARTMENTS.find((d) => d.id === row.department)?.label || row.department}
                          </div>
                        ) : null}
                        <div className="truncate text-gray-900">{row.responsible}</div>
                        <div className="text-right text-gray-700">{row.fetes}</div>
                        <div className="text-right text-gray-700">{row.validades}</div>
                        <div className="text-right text-gray-700">{formatPct(row.percentValidacio)}</div>
                        <div className="text-right text-gray-700">{formatPct(row.factorMinim)}</div>
                        <div className="text-right font-semibold text-gray-900">{formatEur(row.bonusEur)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </RoleGuard>
  )
}


